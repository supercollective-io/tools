"""Versioned file-based matching jobs; stdout contains JSON events only."""

import argparse
import fcntl
import hashlib
import json
import math
import os
import signal
import sys
import time
from collections.abc import Callable
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from datetime import UTC, datetime
from itertools import combinations
from pathlib import Path
from typing import Literal, Self

from pydantic import Field, model_validator

from conference_match import rubric
from conference_match.allocation import collaboration_scores
from conference_match.edges import Edge, allocate_edges
from conference_match.models import Assessment, Event, Participant, Record, write_json
from conference_match.runs import pair_path
from conference_match.scoring import JevScorer, Scorer


class JobError(ValueError):
    """A public error code whose text contains no participant/provider content."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class Snapshot(Record):
    id: str = Field(min_length=1)
    hash: str = Field(min_length=1)


class Person(Record):
    participantId: str = Field(min_length=1)
    text: str = Field(min_length=1)
    sourceRefs: list[str] = Field(min_length=1)
    embedding: list[float] | None = None

    @model_validator(mode="after")
    def nonblank(self) -> Self:
        if not self.participantId.strip() or not self.text.strip():
            raise ValueError("Participant ID and text must not be blank")
        if any(not ref.strip() for ref in self.sourceRefs):
            raise ValueError("Source references must not be blank")
        return self


class Config(Record):
    model: str = Field(min_length=1)
    eventDescription: str = Field(min_length=1)
    oddPolicy: Literal["reject", "trio"] = "reject"
    normalisation: Literal["none", "zscore"] = "none"
    concurrency: int = Field(default=4, ge=1, le=16)
    timeoutSeconds: float = Field(default=360, gt=0, le=3600)
    maxAttempts: int = Field(default=3, ge=1, le=10)
    maxCalls: int | None = Field(default=None, ge=0)
    forbiddenPairs: list[tuple[str, str]] = Field(default_factory=list)


class Request(Record):
    schemaVersion: Literal[1]
    jobId: str = Field(min_length=1)
    snapshot: Snapshot
    roster: list[Person] = Field(min_length=2)
    mode: Literal["collaboration", "similarity"]
    config: Config
    outputDir: str

    @model_validator(mode="after")
    def valid_job(self) -> Self:
        ids = [p.participantId for p in self.roster]
        if len(ids) != len(set(ids)):
            raise ValueError("Roster participant IDs must be unique")
        if not Path(self.outputDir).is_absolute():
            raise ValueError("Output directory must be absolute")
        if len(ids) % 2 and self.config.oddPolicy == "reject":
            raise ValueError("Odd roster requires an explicit trio policy")
        forbidden = {tuple(sorted(pair)) for pair in self.config.forbiddenPairs}
        if len(forbidden) != len(self.config.forbiddenPairs):
            raise ValueError("Forbidden pairs must be unique")
        if forbidden:
            # Feasibility is independent of scores. Refuse impossible constraints before spending.
            allocate_edges(
                ids,
                [Edge(a=a, b=b, weight=0) for a, b in combinations(ids, 2)],
                odd_policy=self.config.oddPolicy,
                forbidden_edges=tuple(self.config.forbiddenPairs),
            )
        if self.mode == "similarity":
            vectors = [p.embedding for p in self.roster]
            if any(v is None or not v or math.hypot(*v) == 0 for v in vectors):
                raise ValueError("Similarity requires a nonzero embedding for every participant")
            if len({len(v) for v in vectors if v is not None}) != 1:
                raise ValueError("Embeddings must have the same dimension")
            if self.config.normalisation != "none":
                raise ValueError(
                    "Similarity uses cosine weights without collaboration normalisation"
                )
        elif self.config.maxCalls is None:
            raise ValueError("Collaboration requires an explicit maxCalls budget")
        return self

    def fingerprint(self) -> str:
        payload = self.model_dump(mode="json", exclude={"outputDir"})
        payload["roster"] = sorted(payload["roster"], key=lambda p: p["participantId"])
        if self.mode == "collaboration":
            payload["rubric"] = rubric.fingerprint()
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
        ).hexdigest()


def now() -> str:
    return datetime.now(UTC).isoformat()


def _cosine(a: list[float], b: list[float]) -> float:
    # Normalise first to avoid overflow when inputs have large finite magnitudes.
    an, bn = math.hypot(*a), math.hypot(*b)
    return max(-1.0, min(1.0, math.fsum((x / an) * (y / bn) for x, y in zip(a, b))))


def _collaboration(
    request: Request,
    directory: Path,
    state: dict,
    update: Callable[[], None],
    factory: Callable[[str], Scorer],
    deadline: float,
) -> tuple[list[Edge], dict]:
    event = Event(
        description=request.config.eventDescription,
        participants=[
            Participant(id=p.participantId, name=p.participantId, profile=p.text)
            for p in sorted(request.roster, key=lambda p: p.participantId)
        ],
    )
    all_pairs = list(combinations(event.participants, 2))
    model_path = directory / "model.json"
    resolved = json.loads(model_path.read_text())["model"] if model_path.exists() else None
    assessments: list[Assessment] = []
    pending = []
    for a, b in all_pairs:
        path = pair_path(directory, a.id, b.id)
        if path.exists():
            result = Assessment.model_validate_json(path.read_text())
            if (result.a, result.b, result.rubric, result.model) != (
                a.id,
                b.id,
                rubric.fingerprint(),
                resolved,
            ):
                raise ValueError("Saved assessment is inconsistent")
            assessments.append(result)
        else:
            pending.append((a, b))
    state["progress"] = {"phase": "scoring", "completed": len(assessments), "total": len(all_pairs)}
    update()
    budget = request.config.maxCalls or 0
    if budget - state["providerCalls"] < len(pending):
        raise JobError("budget_exhausted", "Provider call budget cannot cover remaining scoring")

    def charge() -> None:
        if time.monotonic() >= deadline:
            raise TimeoutError("Scheduling deadline reached")
        state["providerCalls"] += 1
        update()

    def save(a: Participant, b: Participant, result: Assessment) -> None:
        nonlocal resolved
        if (result.a, result.b, result.rubric) != (a.id, b.id, rubric.fingerprint()):
            raise ValueError("Scorer returned inconsistent provenance")
        if resolved is None:
            resolved = result.model
            write_json(model_path, {"model": resolved})
        if result.model != resolved:
            raise ValueError("Provider model changed within frozen job")
        write_json(pair_path(directory, a.id, b.id), result.model_dump(mode="json"))
        assessments.append(result)
        state["progress"]["completed"] = len(assessments)
        update()

    if pending and resolved is None:
        a, b = pending.pop(0)
        charge()
        save(a, b, factory(request.config.model).score(event, a, b))
    errors = []
    if pending:
        scorer = factory(resolved or request.config.model)
        pool = ThreadPoolExecutor(max_workers=request.config.concurrency)
        active = {}
        iterator = iter(pending)
        exhausted = False
        try:
            while active or not exhausted:
                while len(active) < request.config.concurrency and not exhausted:
                    if time.monotonic() >= deadline:
                        exhausted = True
                        break
                    pair = next(iterator, None)
                    if pair is None:
                        exhausted = True
                        break
                    a, b = pair
                    charge()
                    active[pool.submit(scorer.score, event, a, b)] = pair
                if not active:
                    break
                done, _ = wait(active, return_when=FIRST_COMPLETED)
                for future in done:
                    a, b = active.pop(future)
                    try:
                        save(a, b, future.result())
                    except Exception as exc:
                        errors.append(type(exc).__name__)
        finally:
            pool.shutdown(wait=True, cancel_futures=True)
    if len(assessments) != len(all_pairs):
        if time.monotonic() >= deadline:
            raise TimeoutError("Scheduling deadline reached")
        raise RuntimeError("One or more pair assessments failed")
    statistics, scored = collaboration_scores(event, assessments, request.config.normalisation)
    return (
        [Edge(a=a, b=b, weight=score[1]) for (a, b), score in scored.items()],
        {
            "model": resolved,
            "rubric": rubric.fingerprint(),
            "statistics": {k: v.model_dump(mode="json") for k, v in statistics.items()},
        },
    )


def run_job(
    request: Request,
    factory: Callable[[str], Scorer] = lambda model: JevScorer(model, max_retries=0),
    emit: Callable[[dict], None] = lambda event: print(json.dumps(event), flush=True),
) -> dict:
    """Resume only frozen identical inputs; serialise ownership with an OS lock."""
    directory = Path(request.outputDir)
    directory.mkdir(parents=True, exist_ok=True)
    fingerprint = request.fingerprint()
    with (directory / "owner.lock").open("a") as owner:
        try:
            fcntl.flock(owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise JobError("job_busy", "Job is owned by another live process") from None
        manifest = directory / "request.json"
        if manifest.exists():
            saved = Request.model_validate_json(manifest.read_text())
            if saved.fingerprint() != fingerprint:
                raise JobError("input_changed", "Frozen job inputs changed; create a new directory")
        else:
            if any(p.name != "owner.lock" for p in directory.iterdir()):
                raise ValueError("Job directory is not empty and has no request manifest")
            write_json(manifest, request.model_dump(mode="json"))
        state_path = directory / "state.json"
        old = json.loads(state_path.read_text()) if state_path.exists() else {}
        if old.get("fingerprint", fingerprint) != fingerprint:
            raise ValueError("Job state fingerprint changed")
        if old.get("status") == "succeeded":
            result = json.loads((directory / "result.json").read_text())
            if result.get("fingerprint") != fingerprint:
                raise ValueError("Result fingerprint changed")
            emit(old)
            return result
        if old.get("attempt", 0) >= request.config.maxAttempts:
            raise JobError("retry_limit", "Job retry limit reached")
        state = {
            "schemaVersion": 1,
            "jobId": request.jobId,
            "snapshot": request.snapshot.model_dump(),
            "fingerprint": fingerprint,
            "status": "running",
            "ownerPid": os.getpid(),
            "attempt": old.get("attempt", 0) + 1,
            "providerCalls": old.get("providerCalls", 0),
            "previousStatus": "interrupted"
            if old.get("status") == "running"
            else old.get("status"),
            "startedAt": now(),
            "progress": {"phase": "starting", "completed": 0, "total": 0},
        }

        def update() -> None:
            state["updatedAt"] = now()
            write_json(state_path, state)
            emit(state)

        update()
        started = time.monotonic()
        deadline = started + request.config.timeoutSeconds
        try:
            if request.mode == "collaboration":
                edges, provenance = _collaboration(
                    request, directory, state, update, factory, deadline
                )
            else:
                edges = [
                    Edge(
                        a=a.participantId,
                        b=b.participantId,
                        weight=_cosine(a.embedding, b.embedding),
                    )
                    for a, b in combinations(request.roster, 2)
                    if a.embedding is not None and b.embedding is not None
                ]
                provenance = {
                    "model": request.config.model,
                    "metric": "cosine-similarity",
                    "embeddings": "supplied",
                    "providerCalls": 0,
                }
            if time.monotonic() >= deadline:
                raise TimeoutError("Scheduling deadline reached")
            state["progress"] = {
                "phase": "allocating",
                "completed": len(edges),
                "total": len(edges),
            }
            update()
            allocation = allocate_edges(
                [p.participantId for p in request.roster],
                edges,
                odd_policy=request.config.oddPolicy,
                forbidden_edges=tuple(request.config.forbiddenPairs),
            )
            people = {p.participantId: p for p in request.roster}
            result = {
                "schemaVersion": 1,
                "jobId": request.jobId,
                "snapshot": request.snapshot.model_dump(),
                "fingerprint": fingerprint,
                "mode": request.mode,
                "policy": allocation.policy,
                "groups": [
                    {
                        "id": hashlib.sha256(
                            (fingerprint + json.dumps(group.members)).encode()
                        ).hexdigest()[:24],
                        "participantIds": list(group.members),
                        "weight": group.weight,
                        "reviewRequired": group.review_required,
                        "sourceRefs": {p: people[p].sourceRefs for p in group.members},
                    }
                    for group in allocation.groups
                ],
                "provenance": provenance,
                "elapsedSeconds": time.monotonic() - started,
            }
            write_json(directory / "result.json", result)
            state["status"] = "succeeded"
            state["progress"]["phase"] = "complete"
            update()
            return result
        except BaseException as exc:
            state["status"] = (
                "interrupted"
                if isinstance(exc, (KeyboardInterrupt, InterruptedError))
                else "failed"
            )
            state["error"] = {
                "code": exc.code if isinstance(exc, JobError) else type(exc).__name__,
                "retryable": not isinstance(exc, JobError)
                and state["attempt"] < request.config.maxAttempts,
            }
            update()
            raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("request", type=Path)
    parser.add_argument("--schema", action="store_true", help="Print the request JSON schema")
    args = parser.parse_args()
    if args.schema:
        print(json.dumps(Request.model_json_schema(), indent=2))
        return 0

    def interrupted(_signum, _frame):
        raise InterruptedError("Worker interrupted")

    signal.signal(signal.SIGTERM, interrupted)
    try:
        request = Request.model_validate_json(args.request.read_text())
        run_job(request)
        return 0
    except BaseException as exc:
        # Exception details can include private input/provider bodies; expose only the type.
        print(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "type": "error",
                    "code": exc.code if isinstance(exc, JobError) else type(exc).__name__,
                }
            ),
            flush=True,
        )
        print(f"Matching worker stopped ({type(exc).__name__})", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
