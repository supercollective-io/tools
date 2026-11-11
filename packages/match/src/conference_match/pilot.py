"""A small durable event lifecycle, with private participant access and explicit release."""

import hashlib
import hmac
import secrets
from collections.abc import Callable
from pathlib import Path
from threading import RLock, Thread
from typing import Literal

from pydantic import Field, model_validator

from conference_match.allocation import Allocation, allocate
from conference_match.models import Event, Participant, Record, write_json
from conference_match.runs import event_hash, load_results, score_event
from conference_match.scoring import JevScorer, Scorer


class ProfileInput(Record):
    name: str = Field(min_length=1, max_length=200)
    offers: str = Field(min_length=1, max_length=12000)
    needs: str = Field(min_length=1, max_length=12000)
    contact: str = Field(default="", max_length=1000)
    consent: Literal[True]

    @model_validator(mode="after")
    def nonblank(self):
        if any(not text.strip() for text in (self.name, self.offers, self.needs)):
            raise ValueError("Name, offers and needs must not be blank")
        return self


class Entrant(Record):
    id: str
    token_hash: str
    profile: ProfileInput
    revision: int = 0

    def participant(self) -> Participant:
        return Participant(
            id=self.id, name=self.profile.name, offers=self.profile.offers, needs=self.profile.needs
        )


class PilotState(Record):
    schema_version: Literal[1] = 1
    description: str = Field(min_length=1, max_length=8000)
    model: str
    status: Literal["open", "scoring", "failed", "ready", "released"] = "open"
    revision: int = 0
    round: int = 0
    entrants: list[Entrant] = Field(default_factory=list)
    snapshot: Event | None = None
    allocation: Allocation | None = None
    error: str | None = None
    progress: str = ""
    resolved_model: str | None = None
    rubric_hash: str | None = None


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class Pilot:
    def __init__(
        self,
        directory: Path,
        description: str | None = None,
        model: str = "jev-1.14.0",
        factory: Callable[[str], Scorer] = JevScorer,
    ):
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = directory / "event.json"
        self.lock = RLock()
        self.worker: Thread | None = None
        self.factory = factory
        if self.path.exists():
            self.state = PilotState.model_validate_json(self.path.read_text())
            if description is not None and description != self.state.description:
                raise ValueError("Workspace belongs to another event; use a new workspace")
            if model != self.state.model:
                raise ValueError("Workspace uses another model; restart with its original --model")
        else:
            if not description or not description.strip():
                raise ValueError("Supply --description when creating an event")
            self.state = PilotState(description=description, model=model)
            write_json(self.path, self.state.model_dump(mode="json"))
        self.path.chmod(0o600)
        credential = directory / "organiser-key"
        if not credential.exists():
            if self.state.entrants:
                raise ValueError("Organiser key is missing; restore it from your workspace backup")
            with credential.open("x") as handle:
                credential.chmod(0o600)
                handle.write(secrets.token_urlsafe(32))
        self.organiser_key = credential.read_text().strip()
        if not self.organiser_key:
            raise ValueError("Organiser key is empty")
        if self.state.status == "scoring":
            # serve() holds the workspace process lock before constructing this object.
            updated = self.state.model_copy(deep=True)
            updated.status = "failed"
            updated.error = "Scoring was interrupted. Retry to resume saved assessments."
            self.persist(updated)

    def persist(self, updated: PilotState) -> None:
        updated.revision += 1
        write_json(self.path, updated.model_dump(mode="json"))
        self.path.chmod(0o600)
        self.state = updated

    def is_organiser(self, key: str) -> bool:
        return bool(key) and hmac.compare_digest(key.encode(), self.organiser_key.encode())

    def entrant(self, key: str) -> Entrant:
        digest = token_hash(key)
        for entry in self.state.entrants:
            if hmac.compare_digest(entry.token_hash, digest):
                return entry
        raise PermissionError("Invalid participant link")

    def info(self) -> dict:
        with self.lock:
            return {"description": self.state.description, "status": self.state.status}

    def join(self, profile: ProfileInput) -> str:
        with self.lock:
            if self.state.status != "open":
                raise ValueError("Registration is closed")
            if len(self.state.entrants) >= 100:
                raise ValueError("This event has reached its 100-participant limit")
            key = secrets.token_urlsafe(32)
            updated = self.state.model_copy(deep=True)
            updated.entrants.append(
                Entrant(id=secrets.token_hex(12), token_hash=token_hash(key), profile=profile)
            )
            self.persist(updated)
            return key

    def participant_view(self, key: str) -> dict:
        with self.lock:
            entry = self.entrant(key)
            partner = None
            if self.state.status == "released" and self.state.allocation:
                pair = next(p for p in self.state.allocation.pairs if entry.id in (p.a, p.b))
                partner_id = pair.b if pair.a == entry.id else pair.a
                other = next(e for e in self.state.entrants if e.id == partner_id)
                partner = other.profile.model_dump(exclude={"consent"})
            return {
                **self.info(),
                "profile": entry.profile.model_dump(),
                "revision": entry.revision,
                "partner": partner,
            }

    def edit(self, key: str, profile: ProfileInput, revision: int) -> None:
        with self.lock:
            entry = self.entrant(key)
            if self.state.status != "open":
                raise ValueError("Profiles are frozen while matches are prepared or released")
            if revision != entry.revision:
                raise ValueError("Your profile changed in another tab; reload before saving")
            updated = self.state.model_copy(deep=True)
            target = next(e for e in updated.entrants if e.id == entry.id)
            target.profile = profile
            target.revision += 1
            self.persist(updated)

    def organiser_view(self) -> dict:
        with self.lock:
            return {
                **self.state.model_dump(exclude={"entrants", "snapshot"}),
                "entrants": [
                    {"id": e.id, **e.profile.model_dump(exclude={"consent"})}
                    for e in self.state.entrants
                ],
            }

    def check_revision(self, revision: int) -> None:
        if revision != self.state.revision:
            raise ValueError("The event changed; reload before continuing")

    def start(self, revision: int) -> None:
        with self.lock:
            self.check_revision(revision)
            if self.state.status not in ("open", "failed"):
                raise ValueError("Matching is already running or complete")
            updated = self.state.model_copy(deep=True)
            if updated.status == "open":
                if len(updated.entrants) < 2 or len(updated.entrants) % 2:
                    raise ValueError(
                        "Matching requires at least two participants and an even count"
                    )
                updated.snapshot = Event(
                    description=updated.description,
                    participants=[e.participant() for e in updated.entrants],
                )
                updated.round += 1
            if updated.snapshot is None:
                raise ValueError("No frozen event to score")
            run = self.directory / f"round-{updated.round}"
            if (run / ".lock").exists():
                raise ValueError(
                    "Scoring lock remains. Confirm the old process stopped before "
                    "removing this round's .lock file and retrying."
                )
            updated.status, updated.error, updated.progress = "scoring", None, "Starting matching"
            self.persist(updated)
            self.worker = Thread(target=self.score, args=(updated.snapshot, run), daemon=False)
            self.worker.start()

    def score(self, event: Event, run: Path) -> None:
        try:

            def progress(message: str) -> None:
                with self.lock:
                    self.state.progress = message  # Transient; final state is durable.

            _, failed = score_event(event, run, self.state.model, self.factory, progress=progress)
            if failed:
                raise RuntimeError("Some assessments failed")
            manifest, results = load_results(run, complete=True)
            if manifest.input_hash != event_hash(event):
                raise ValueError("Scoring snapshot mismatch")
            allocation = allocate(event, results)
            with self.lock:
                updated = self.state.model_copy(deep=True)
                updated.status, updated.error = "ready", None
                updated.allocation = allocation
                updated.resolved_model, updated.rubric_hash = (
                    manifest.resolved_model,
                    manifest.rubric_hash,
                )
                updated.progress = "Matches ready for review"
                self.persist(updated)
        except Exception:
            # Provider error bodies may contain profile text or credentials.
            with self.lock:
                updated = self.state.model_copy(deep=True)
                updated.status = "failed"
                updated.error = (
                    "Matching failed. Check the server configuration, then retry to resume."
                )
                self.persist(updated)

    def release(self, revision: int) -> None:
        with self.lock:
            self.check_revision(revision)
            if self.state.status != "ready" or self.state.allocation is None:
                raise ValueError("Complete matching before releasing partners")
            updated = self.state.model_copy(deep=True)
            updated.status = "released"
            updated.progress = "Partners released"
            self.persist(updated)

    def reopen(self, revision: int) -> None:
        with self.lock:
            self.check_revision(revision)
            if self.state.status not in ("failed", "ready"):
                raise ValueError("Only unreleased results can be reopened")
            updated = self.state.model_copy(deep=True)
            updated.status, updated.snapshot, updated.allocation = "open", None, None
            updated.error, updated.progress = None, ""
            updated.resolved_model, updated.rubric_hash = None, None
            self.persist(updated)

    def remove(self, identifier: str, revision: int) -> None:
        with self.lock:
            self.check_revision(revision)
            if self.state.status != "open":
                raise ValueError("Reopen registration before removing a participant")
            if not any(e.id == identifier for e in self.state.entrants):
                raise ValueError("Participant not found")
            updated = self.state.model_copy(deep=True)
            updated.entrants = [e for e in updated.entrants if e.id != identifier]
            self.persist(updated)
