"""Resumable pair scoring, with immutable inputs and explicit failures."""

import hashlib
import json
import time
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from itertools import combinations
from pathlib import Path

from conference_match import rubric
from conference_match.models import Assessment, Event, Participant, Record, write_json
from conference_match.scoring import Scorer


class Manifest(Record):
    schema_version: int = 1
    event: Event
    input_hash: str
    rubric_hash: str
    requested_model: str
    resolved_model: str | None = None


def event_hash(event: Event) -> str:
    payload = event.model_dump(mode="json")
    payload["participants"] = sorted(payload["participants"], key=lambda p: p["id"])
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def pairs(event: Event) -> list[tuple[Participant, Participant]]:
    return list(combinations(sorted(event.participants, key=lambda p: p.id), 2))


def pair_path(directory: Path, a: str, b: str) -> Path:
    digest = hashlib.sha256(json.dumps(sorted((a, b))).encode()).hexdigest()
    return directory / "pairs" / f"{digest}.json"


def read_manifest(directory: Path) -> Manifest:
    manifest = Manifest.model_validate_json((directory / "manifest.json").read_text())
    if manifest.schema_version != 1 or manifest.input_hash != event_hash(manifest.event):
        raise ValueError("Run manifest is inconsistent or uses an unsupported schema")
    return manifest


def read_assessment(path: Path, manifest: Manifest, a: str, b: str) -> Assessment:
    result = Assessment.model_validate_json(path.read_text())
    if (result.a, result.b, result.rubric, result.model) != (
        a,
        b,
        manifest.rubric_hash,
        manifest.resolved_model,
    ):
        raise ValueError("Assessment does not match its run manifest")
    return result


@contextmanager
def run_lock(directory: Path) -> Iterator[None]:
    directory.mkdir(parents=True, exist_ok=True)
    lock = directory / ".lock"
    try:
        handle = lock.open("x")
    except FileExistsError:
        raise ValueError(
            "Run is locked. If its previous process has stopped, remove the run's .lock file."
        ) from None
    try:
        handle.close()
        yield
    finally:
        lock.unlink(missing_ok=True)


def score_event(
    event: Event,
    directory: Path,
    requested_model: str,
    factory: Callable[[str], Scorer],
    concurrency: int = 4,
    progress: Callable[[str], None] = print,
) -> tuple[int, int]:
    if concurrency < 1:
        raise ValueError("Concurrency must be at least one")
    with run_lock(directory):
        return _score_locked(event, directory, requested_model, factory, concurrency, progress)


def _score_locked(
    event: Event,
    directory: Path,
    requested_model: str,
    factory: Callable[[str], Scorer],
    concurrency: int,
    progress: Callable[[str], None],
) -> tuple[int, int]:
    started = time.monotonic()
    manifest_path = directory / "manifest.json"
    expected = Manifest(
        event=event,
        input_hash=event_hash(event),
        rubric_hash=rubric.fingerprint(),
        requested_model=requested_model,
    )
    if manifest_path.exists():
        manifest = read_manifest(directory)
        if (manifest.input_hash, manifest.rubric_hash, manifest.requested_model) != (
            expected.input_hash,
            expected.rubric_hash,
            expected.requested_model,
        ):
            raise ValueError("Inputs, rubric or model changed; choose a new run directory")
    else:
        if any(p.name != ".lock" for p in directory.iterdir()):
            raise ValueError("Output directory is not empty and has no run manifest")
        manifest = expected
        write_json(manifest_path, manifest.model_dump(mode="json"))

    all_pairs = pairs(event)
    pending: list[tuple[Participant, Participant]] = []
    successful = 0
    failures: dict[str, str] = {}
    for a, b in all_pairs:
        path = pair_path(directory, a.id, b.id)
        if path.exists():
            read_assessment(path, manifest, a.id, b.id)
            successful += 1
        else:
            pending.append((a, b))
    progress(f"{successful}/{len(all_pairs)} assessments already saved")

    def save(a: Participant, b: Participant, result: Assessment) -> None:
        nonlocal successful
        if (result.a, result.b, result.rubric) != (a.id, b.id, manifest.rubric_hash):
            raise ValueError("Scorer returned inconsistent participant IDs or rubric")
        if manifest.resolved_model is None:
            manifest.resolved_model = result.model
            write_json(manifest_path, manifest.model_dump(mode="json"))
        if result.model != manifest.resolved_model:
            raise ValueError("Provider changed models within a run")
        write_json(pair_path(directory, a.id, b.id), result.model_dump(mode="json"))
        successful += 1

    def failed(a: Participant, b: Participant, exc: Exception) -> None:
        # Never persist exception text that may contain input text or credentials.
        failures[pair_path(directory, a.id, b.id).stem] = type(exc).__name__
        write_json(directory / "failures.json", failures)
        progress(f"Failed pair {a.id} / {b.id} ({type(exc).__name__})")

    # Resolve aliases once, then pin every remaining request and future resume to that version.
    if pending and manifest.resolved_model is None:
        a, b = pending.pop(0)
        try:
            save(a, b, factory(requested_model).score(event, a, b))
        except Exception as exc:
            failed(a, b, exc)
            progress("Could not resolve a model from the first assessment; rerun to retry")
            return successful, len(all_pairs) - successful

    if pending:
        scorer = factory(manifest.resolved_model or requested_model)
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = {executor.submit(scorer.score, event, a, b): (a, b) for a, b in pending}
            for future in as_completed(futures):
                a, b = futures[future]
                try:
                    save(a, b, future.result())
                except Exception as exc:
                    failed(a, b, exc)
                progress(f"{successful}/{len(all_pairs)} saved; {len(failures)} failed")
    write_json(directory / "failures.json", failures)
    progress(
        f"Finished in {time.monotonic() - started:.1f}s: {successful} saved, "
        f"{len(all_pairs) - successful} failed"
    )
    return successful, len(all_pairs) - successful


def load_results(directory: Path, complete: bool = False) -> tuple[Manifest, list[Assessment]]:
    if (directory / ".lock").exists():
        raise ValueError("Run is being written; wait for scoring to finish")
    manifest = read_manifest(directory)
    results: list[Assessment] = []
    for a, b in pairs(manifest.event):
        path = pair_path(directory, a.id, b.id)
        if path.exists():
            results.append(read_assessment(path, manifest, a.id, b.id))
        elif complete:
            raise ValueError("Run is incomplete; finish scoring before allocation")
    return manifest, results
