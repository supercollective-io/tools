"""Small, explicitly labelled pairwise evaluations; no allocation required."""

from collections.abc import Callable
from pathlib import Path
from typing import Literal, Self

from pydantic import Field, model_validator

from conference_match import rubric
from conference_match.models import Assessment, Event, Record
from conference_match.runs import event_hash, load_results
from conference_match.scoring import Scorer


class Comparison(Record):
    id: str = Field(min_length=1)
    preferred: tuple[str, str]
    alternative: tuple[str, str]
    metric: Literal["support", "shared_inquiry", "sum"]
    reason: str = Field(min_length=1)
    status: Literal["draft", "approved"] = "draft"
    reviewed_by: str | None = None
    split: Literal["development", "holdout"] = "development"

    @model_validator(mode="after")
    def valid_comparison(self) -> Self:
        if any(a == b for a, b in (self.preferred, self.alternative)):
            raise ValueError("A pair must contain distinct people")
        if self.preferred == self.alternative or (
            self.metric != "support" and set(self.preferred) == set(self.alternative)
        ):
            raise ValueError("A comparison must assess different candidates")
        if self.status == "approved" and not (self.reviewed_by or "").strip():
            raise ValueError("Approved comparisons need a human reviewer")
        return self


class Fixtures(Record):
    kind: Literal["real", "synthetic"] = "real"
    comparisons: list[Comparison] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_ids(self) -> Self:
        if len({c.id for c in self.comparisons}) != len(self.comparisons):
            raise ValueError("Comparison IDs must be unique")
        return self


def pair_key(pair: tuple[str, str]) -> tuple[str, str]:
    return min(pair), max(pair)


def value(result: Assessment, pair: tuple[str, str], metric: str) -> float:
    if metric == "sum":
        return result.weight
    key = (
        "shared_inquiry"
        if metric == "shared_inquiry"
        else ("a_to_b" if result.a == pair[0] else "b_to_a")
    )
    return result.metrics[key].normalised


def evaluate(
    event: Event,
    fixtures: Fixtures,
    model: str,
    factory: Callable[[str], Scorer],
    split: str = "development",
    include_drafts: bool = False,
    source_run: Path | None = None,
) -> dict:
    selected = [
        c
        for c in fixtures.comparisons
        if c.split == split and (c.status == "approved" or include_drafts)
    ]
    if not selected:
        raise ValueError("No approved fixtures in this split; review drafts first")
    wanted = sorted({pair_key(p) for c in selected for p in (c.preferred, c.alternative)})
    # Validate all references before making any paid call.
    for pair in wanted:
        for identifier in pair:
            event.person(identifier)
    results: dict[tuple[str, str], Assessment] = {}
    resolved = None
    if source_run is not None:
        manifest, saved = load_results(source_run)
        if manifest.input_hash != event_hash(event) or manifest.rubric_hash != rubric.fingerprint():
            raise ValueError("Saved run uses different profiles, event context or rubric")
        if model not in (manifest.requested_model, manifest.resolved_model):
            raise ValueError("Saved run uses a different model")
        results = {(r.a, r.b): r for r in saved if (r.a, r.b) in wanted}
        if set(results) != set(wanted):
            raise ValueError("Saved run is missing a required fixture pair")
        resolved = manifest.resolved_model
    else:
        for a, b in wanted:
            r = factory(resolved or model).score(event, event.person(a), event.person(b))
            if (r.a, r.b, r.rubric) != (a, b, rubric.fingerprint()):
                raise ValueError("Scorer returned inconsistent IDs or rubric")
            if resolved is not None and r.model != resolved:
                raise ValueError("Provider changed models during evaluation")
            resolved = r.model
            results[(a, b)] = r
    rows = []
    for c in selected:
        preferred = value(results[pair_key(c.preferred)], c.preferred, c.metric)
        alternative = value(results[pair_key(c.alternative)], c.alternative, c.metric)
        margin = preferred - alternative
        rows.append(
            {
                "id": c.id,
                "status": c.status,
                "metric": c.metric,
                "preferred_score": preferred,
                "alternative_score": alternative,
                "margin": margin,
                "outcome": "tie" if abs(margin) < 1e-9 else "pass" if margin > 0 else "fail",
            }
        )
    approved = [r for r in rows if r["status"] == "approved"]
    return {
        "fixture_kind": fixtures.kind,
        "event": event.model_dump(mode="json"),
        "input_hash": event_hash(event),
        "fixtures": [c.model_dump(mode="json") for c in selected],
        "rubric_hash": rubric.fingerprint(),
        "rubric": {
            "common": rubric.COMMON,
            "questions": rubric.QUESTIONS,
            "support": rubric.RELEVANCE,
            "shared_inquiry": rubric.SHARED,
        },
        "requested_model": model,
        "model": resolved,
        "split": split,
        "unique_pairs": len(wanted),
        "api_calls": 0 if source_run else len(wanted),
        "source_run": str(source_run) if source_run else None,
        "approved_count": len(approved),
        "approved_outcomes": {
            key: sum(r["outcome"] == key for r in approved) for key in ("pass", "fail", "tie")
        },
        "approved_accuracy": sum(r["outcome"] == "pass" for r in approved) / len(approved)
        if approved
        else None,
        "comparisons": rows,
        "assessments": [r.model_dump(mode="json") for r in results.values()],
    }
