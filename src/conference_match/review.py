"""Local operator review: blind proposals, durable human labels and saved allocations."""

import hashlib
import json
import random
import secrets
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import Field

from conference_match.allocation import allocate
from conference_match.evaluation import Comparison, Fixtures
from conference_match.models import Event, Record, write_json
from conference_match.runs import event_hash, load_results


class Proposal(Record):
    id: str
    left: tuple[str, str]
    right: tuple[str, str]
    metric: Literal["support", "shared_inquiry", "sum"]
    split: Literal["development", "holdout"]


class Judgement(Record):
    proposal_id: str
    choice: Literal["left", "right", "unclear"]
    reason: str = ""
    reviewed_by: str = Field(default="Local operator", min_length=1)
    ordering_confidence: Literal["tentative", "definite", "unspecified"] = "unspecified"
    expected_separation: Literal["similar", "unspecified"] = "unspecified"


class SavedJudgement(Judgement):
    reviewed_at: str
    scores_seen: bool


class ReviewSession(Record):
    schema_version: Literal[1] = 1
    revision: int = 0
    event: Event
    input_hash: str
    kind: Literal["real", "synthetic"] = "real"
    proposals: list[Proposal]
    reserved_ids: list[str]
    judgements: dict[str, SavedJudgement] = Field(default_factory=dict)
    history: list[SavedJudgement] = Field(default_factory=list)
    scores_revealed: bool = False
    expert_report_hash: str | None = None
    batches: list[list[str]] = Field(default_factory=list)
    batch_index: int = 0


def proposals_for(event: Event, fixtures: Fixtures | None = None) -> ReviewSession:
    """Generate neutral, deterministic questions, never inferred human preferences."""
    used = {
        person
        for c in (fixtures.comparisons if fixtures else [])
        for pair in (c.preferred, c.alternative)
        for person in pair
    }
    ids = sorted(p.id for p in event.participants)
    if not used.issubset(ids):
        raise ValueError("Existing fixtures refer to people outside this event")
    rng = random.Random(event_hash(event))
    fresh = [p for p in ids if p not in used]
    rng.shuffle(fresh)
    # Reserve whole people, not overlapping pairs. Small events stay development-only.
    count = min(max(3, len(ids) // 5), len(fresh), len(ids) - 3) if len(ids) >= 6 else 0
    reserved = sorted(fresh[:count]) if count >= 3 else []
    groups = [("development", [p for p in ids if p not in reserved], 30)]
    if reserved:
        groups.append(("holdout", reserved, 10))
    proposals: list[Proposal] = []
    seen: set[tuple] = set()
    for c in fixtures.comparisons if fixtures else []:
        pairs = (c.preferred, c.alternative)
        canonical = [p if c.metric == "support" else tuple(sorted(p)) for p in pairs]
        seen.add((c.metric, tuple(sorted(canonical))))
    for split, people, target in groups:
        # Bounded sampling avoids constructing the cubic space of possible questions.
        added = 0
        for attempt in range(target * 100):
            if len(people) < 3 or added == target:
                break
            recipient, a, b = rng.sample(people, 3)
            metric = ("support", "shared_inquiry")[attempt % 2]
            left, right = (a, recipient), (b, recipient)
            canonical = [p if metric == "support" else tuple(sorted(p)) for p in (left, right)]
            key = (metric, tuple(sorted(canonical)))
            if key in seen:
                continue
            seen.add(key)
            digest = hashlib.sha256(json.dumps(key).encode()).hexdigest()[:16]
            proposals.append(
                Proposal.model_validate(
                    {
                        "id": f"review-{digest}",
                        "left": left,
                        "right": right,
                        "metric": metric,
                        "split": split,
                    }
                )
            )
            added += 1
    return ReviewSession(
        event=event,
        input_hash=event_hash(event),
        proposals=proposals,
        reserved_ids=reserved,
        kind=fixtures.kind if fixtures else "real",
    )


class ReviewStore:
    def __init__(self, directory: Path, event: Event, fixtures: Fixtures | None = None):
        self.directory = directory
        self.session = self.open(event, fixtures)

    def open(self, event: Event, fixtures: Fixtures | None = None) -> ReviewSession:
        path = self.directory / f"{event_hash(event)}.json"
        if path.exists():
            session = ReviewSession.model_validate_json(path.read_text())
            if (
                session.input_hash != event_hash(event)
                or event_hash(session.event) != session.input_hash
            ):
                raise ValueError("Review session does not match its event")
        else:
            session = proposals_for(event, fixtures)
            write_json(path, session.model_dump(mode="json"))
        if fixtures:
            used = {
                person
                for c in fixtures.comparisons
                for pair in (c.preferred, c.alternative)
                for person in pair
            }
            if not used.issubset(p.id for p in event.participants):
                raise ValueError("Existing fixtures refer to people outside this event")
            if used.intersection(session.reserved_ids) or fixtures.kind != session.kind:
                raise ValueError(
                    "Existing session conflicts with these fixtures; use a new workspace"
                )
        # Retire unanswered overall questions without changing any recorded judgement.
        focused = [p for p in session.proposals if p.metric != "sum" or p.id in session.judgements]
        if len(focused) != len(session.proposals):
            session.proposals = focused
            session.revision += 1
            write_json(path, session.model_dump(mode="json"))
        self.session = session
        return session

    def persist(self, updated: ReviewSession) -> None:
        updated.revision += 1
        write_json(self.directory / f"{updated.input_hash}.json", updated.model_dump(mode="json"))
        self.session = updated

    def attach_expert(self, path: Path) -> None:
        from conference_match.expert import ExpertReport, batch_order

        report = ExpertReport.model_validate_json(path.read_text())
        if report.input_hash != self.session.input_hash:
            raise ValueError("Expert report refers to a different event")
        digest = report.fingerprint()
        if self.session.expert_report_hash:
            if self.session.expert_report_hash != digest:
                raise ValueError("This workspace already uses another expert report")
            return
        if self.session.scores_revealed:
            raise ValueError("Scores were revealed in this workspace; use a fresh blind workspace")
        actual = {p.id: p for p in self.session.proposals}
        if len(report.items) != len(actual) or {i.proposal.id for i in report.items} != set(actual):
            raise ValueError("Expert report does not cover the current comparisons")
        if any(item.proposal != actual[item.proposal.id] for item in report.items):
            raise ValueError("Expert report contains different comparison definitions")
        updated = self.session.model_copy(deep=True)
        updated.batches = batch_order(report, set(updated.judgements))
        updated.expert_report_hash = digest
        # Persist randomised display orientation once. Never remap a saved human judgement.
        for proposal in updated.proposals:
            if proposal.id not in updated.judgements and secrets.randbits(1):
                proposal.left, proposal.right = proposal.right, proposal.left
        self.persist(updated)

    def public_session(self, has_run: bool) -> dict:
        data = self.session.model_dump(mode="json")
        if self.session.expert_report_hash:
            ids = self.session.batches[self.session.batch_index] if self.session.batches else []
            proposals = {p.id: p for p in self.session.proposals}
            data["proposals"] = [proposals[i].model_dump(mode="json") for i in ids]
            data["batch_number"] = self.session.batch_index + 1 if ids else 0
            data["batch_total"] = len(self.session.batches)
            data["batch_complete"] = all(i in self.session.judgements for i in ids)
            # Do not send future questions, priorities, machine choices or explanations.
            data.pop("batches")
        data["has_run"] = has_run and not self.session.expert_report_hash
        return data

    def next_batch(self) -> None:
        if not self.session.expert_report_hash or not self.session.batches:
            raise ValueError("No expert review batches available")
        current = self.session.batches[self.session.batch_index]
        if not all(i in self.session.judgements for i in current):
            raise ValueError("Finish this batch before starting the next")
        if self.session.batch_index + 1 >= len(self.session.batches):
            raise ValueError("All batches are complete")
        updated = self.session.model_copy(deep=True)
        updated.batch_index += 1
        self.persist(updated)

    def judge(self, judgement: Judgement) -> None:
        if self.session.expert_report_hash:
            active = self.session.batches[self.session.batch_index] if self.session.batches else []
            if judgement.proposal_id not in active:
                raise ValueError("This comparison is not in the current batch")
        proposal = next((p for p in self.session.proposals if p.id == judgement.proposal_id), None)
        if proposal is None:
            raise ValueError("Unknown comparison")
        if not judgement.reviewed_by.strip():
            raise ValueError("A reviewer is required")
        if proposal.split == "holdout" and self.session.scores_revealed:
            raise ValueError("Scores have been revealed; holdout judgements are now locked")
        updated = self.session.model_copy(deep=True)
        fields = judgement.model_dump()
        previous = updated.judgements.get(proposal.id)
        if previous and previous.choice == judgement.choice:
            for key in ("ordering_confidence", "expected_separation"):
                if key not in judgement.model_fields_set:
                    fields[key] = getattr(previous, key)
        saved = SavedJudgement(
            **fields,
            reviewed_at=datetime.now(UTC).isoformat(),
            scores_seen=self.session.scores_revealed,
        )
        updated.judgements[proposal.id] = saved
        updated.history.append(saved)
        self.persist(updated)

    def fixtures(self) -> Fixtures:
        comparisons = []
        for proposal in self.session.proposals:
            judgement = self.session.judgements.get(proposal.id)
            if judgement is None or judgement.choice == "unclear":
                continue
            preferred, alternative = proposal.left, proposal.right
            if judgement.choice == "right":
                preferred, alternative = alternative, preferred
            comparisons.append(
                Comparison(
                    id=proposal.id,
                    preferred=preferred,
                    alternative=alternative,
                    metric=proposal.metric,
                    reason=judgement.reason.strip() or "No note supplied.",
                    reviewed_by=judgement.reviewed_by,
                    status="approved",
                    split=proposal.split,
                    ordering_confidence=judgement.ordering_confidence,
                    expected_separation=judgement.expected_separation,
                )
            )
        if not comparisons:
            raise ValueError(
                "No ranked human judgements to export; unclear reviews remain in the archive"
            )
        return Fixtures(kind=self.session.kind, comparisons=comparisons)

    def allocation(self, run: Path | None, normalisation: str) -> dict:
        if self.session.expert_report_hash:
            raise ValueError("Allocation scores are hidden in a blind expert-review workspace")
        if run is None:
            raise ValueError("Start match review with --run to inspect a saved scoring run")
        manifest, results = load_results(run, complete=True)
        if manifest.input_hash != self.session.input_hash:
            raise ValueError("The saved run belongs to a different event")
        allocation = allocate(self.session.event, results, normalisation)
        pending = [
            p
            for p in self.session.proposals
            if p.split == "holdout" and p.id not in self.session.judgements
        ]
        if pending:
            raise ValueError("Review all reserved holdout comparisons before revealing scores")
        updated = self.session.model_copy(deep=True)
        updated.scores_revealed = True
        self.persist(updated)
        return {
            "input_hash": manifest.input_hash,
            "rubric_hash": manifest.rubric_hash,
            "model": manifest.resolved_model,
            "requested_model": manifest.requested_model,
            **allocation.model_dump(mode="json"),
        }
