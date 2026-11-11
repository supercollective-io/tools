"""Check input-order and profile-field effects on one saved human support judgement.

This is an exploratory diagnosis, not a production prompt change or validation set.
Run once from the repository root; reports are written to ignored runs/.
"""

import json
from collections.abc import Callable
from pathlib import Path

from conference_match.evaluation import Comparison, Fixtures, evaluate
from conference_match.models import Event, Participant, write_json
from conference_match.rubric import VERSION
from conference_match.scoring import JevScorer, Scorer

MODEL = "jev-1.14.0"
REPEATS = 3
OUTPUT = Path("runs/writer-input-diagnostics")
COMPARISON = Comparison.model_validate(
    {
        "id": "writer-team-support",
        "metric": "support",
        "preferred": ["1d664o8", "1einy86"],
        "alternative": ["1nseb22", "1einy86"],
        "reason": "User-reviewed preference; the recipient seeks a game-development team to join.",
        "status": "approved",
        "reviewed_by": "User, existing review",
    }
)
FIXTURES = Fixtures(comparisons=[COMPARISON])


class ReverseOrderScorer:
    """Send each pair in opposite positions while preserving its support direction."""

    def __init__(self, model: str):
        self.scorer = JevScorer(model)

    def score(self, event: Event, a: Participant, b: Participant):
        result = self.scorer.score(event, b, a)
        metrics = result.metrics.copy()
        metrics["a_to_b"], metrics["b_to_a"] = metrics["b_to_a"], metrics["a_to_b"]
        return result.model_copy(update={"a": a.id, "b": b.id, "metrics": metrics})


def variants(event: Event) -> dict[str, Event]:
    hobby = event.person("1einy86")
    modeller = event.person("1d664o8")
    professional = event.person("1nseb22")
    base = Event(description=event.description, participants=[hobby, modeller, professional])
    reverse = Event(description=event.description, participants=[hobby, professional, modeller])
    flattened_people = []
    needs_first_people = []
    for person in base.participants:
        if person.profile is not None:
            raise ValueError("Diagnostic expects profiles stored in offers and needs fields")
        flattened_people.append(
            person.model_copy(
                update={
                    "profile": f"Offers:\n{person.offers}\n\nNeeds:\n{person.needs}",
                    "offers": None,
                    "needs": None,
                }
            )
        )
        needs_first_people.append(
            person.model_copy(
                update={
                    "profile": f"Needs:\n{person.needs}\n\nOffers:\n{person.offers}",
                    "offers": None,
                    "needs": None,
                }
            )
        )
    return {
        "baseline": base,
        "swapped_input_order": reverse,
        "flattened_profiles": Event(description=event.description, participants=flattened_people),
        "needs_before_offers": Event(
            description=event.description, participants=needs_first_people
        ),
    }


def main() -> None:
    if OUTPUT.exists():
        raise ValueError(f"Output already exists: {OUTPUT}; preserve previous experiment runs")
    source = Event.model_validate_json(Path("examples/event.json").read_text())
    conditions = variants(source)

    def canonical(event: Event) -> list[tuple[str, str, str, str]]:
        people = []
        for person in event.participants:
            if person.profile is None:
                offers, needs = person.offers or "", person.needs or ""
            else:
                if person.profile.startswith("Needs:\n"):
                    needs, offers = person.profile.split("\n\nOffers:\n", 1)
                    needs = needs.removeprefix("Needs:\n")
                else:
                    offers, needs = person.profile.split("\n\nNeeds:\n", 1)
                    _, offers = offers.split("Offers:\n", 1)
            people.append((person.id, person.name, offers, needs))
        return sorted(people)

    if len({json.dumps(canonical(event)) for event in conditions.values()}) != 1:
        raise ValueError("Input representation variants changed source text")
    write_json(
        OUTPUT / "plan.json",
        {
            "model": MODEL,
            "repeats": REPEATS,
            "production_rubric_version": VERSION,
            "production_prompt_changed": False,
            "human_comparison": COMPARISON.model_dump(mode="json"),
            "conditions": list(conditions),
            "note": "Flattened and reordered fields preserve the same literal source text. "
            "They test serialization effects, not alternative factual claims.",
        },
    )
    for repeat in range(1, REPEATS + 1):
        for condition, event in conditions.items():
            factory: Callable[[str], Scorer] = (
                ReverseOrderScorer if condition == "swapped_input_order" else JevScorer
            )
            report = evaluate(event, FIXTURES, MODEL, factory)
            write_json(OUTPUT / f"{condition}-{repeat}.json", report)
            row = report["comparisons"][0]
            print(
                f"{condition} repeat {repeat}: preferred-minus-alternative "
                f"{row['margin']:+.4f}; {row['outcome']}",
                flush=True,
            )


if __name__ == "__main__":
    main()
