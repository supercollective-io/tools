"""Compare one shorter directional question against cached matched v11 runs."""

import argparse
import json
from pathlib import Path

from conference_match import rubric
from conference_match.evaluation import Comparison, Fixtures, evaluate
from conference_match.models import Event, load_event, write_json
from conference_match.review import ReviewSession
from conference_match.scoring import JevScorer

MODEL = "jev-1.14.0"
QUESTION = "How well does what Person A offers fulfil what Person B explicitly asks for?"
BASELINE = Path("runs/explicit-request-v1")


def suites(archive: ReviewSession) -> list[tuple[str, Event, Fixtures, bool]]:
    old = Fixtures.model_validate_json(Path("examples/comparisons.json").read_text())
    added = Fixtures.model_validate_json(Path("examples/operator-comparisons.json").read_text())
    unclear = [
        Comparison(
            id=p.id,
            preferred=p.left,
            alternative=p.right,
            metric=p.metric,
            status="draft",
            reason="Orientation only, not an expected ordering. Human note: "
            + archive.judgements[p.id].reason,
        )
        for p in archive.proposals
        if p.id in archive.judgements and archive.judgements[p.id].choice == "unclear"
    ]
    if not unclear:
        raise ValueError("Expected the existing unclear judgement")
    return [
        (
            "real",
            load_event(Path("examples/event.json")),
            Fixtures(comparisons=old.comparisons + added.comparisons),
            False,
        ),
        ("unclear", archive.event, Fixtures(comparisons=unclear), True),
        (
            "peers",
            load_event(Path("examples/additional-help-event.json")),
            Fixtures.model_validate_json(
                Path("examples/additional-help-comparisons.json").read_text()
            ),
            False,
        ),
        (
            "sanity",
            load_event(Path("examples/sanity-event.json")),
            Fixtures.model_validate_json(Path("examples/sanity-comparisons.json").read_text()),
            False,
        ),
    ]


def check_baselines(suite_list: list[tuple[str, Event, Fixtures, bool]]) -> None:
    plan = (BASELINE / "plan.json").read_text()
    if '"model": "jev-1.14.0"' not in plan:
        raise ValueError("Cached baseline uses a different model")
    for name, event, fixtures, _ in suite_list:
        for repeat in range(1, 4):
            path = BASELINE / f"baseline-{name}-{repeat}.json"
            if not path.exists():
                raise ValueError(f"Missing matched baseline: {path}")
            report = json.loads(path.read_text())
            if report["requested_model"] != MODEL:
                raise ValueError(f"Baseline model changed: {path}")
            if report["event"] != event.model_dump(mode="json"):
                raise ValueError(f"Baseline profiles changed: {path}")
            if report["fixtures"] != [c.model_dump(mode="json") for c in fixtures.comparisons]:
                raise ValueError(f"Baseline labels changed: {path}")
            if report["rubric"]["common"] != rubric.COMMON:
                raise ValueError(f"Baseline common instructions changed: {path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("runs/short-request-question"))
    parser.add_argument("--review-archive", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("Choose a new output directory to preserve prior results")
    if len(QUESTION) >= len(rubric.QUESTIONS["a_to_b"]):
        raise ValueError("Candidate question must be shorter than the current question")
    original_version, original_questions = rubric.VERSION, rubric.QUESTIONS.copy()
    archive = ReviewSession.model_validate_json(args.review_archive.read_text())
    suite_list = suites(archive)
    check_baselines(suite_list)
    write_json(
        args.output / "plan.json",
        {
            "model": MODEL,
            "baseline_runs": str(BASELINE),
            "candidate_question": QUESTION,
            "current_a_to_b": original_questions["a_to_b"],
            "candidate_characters": len(QUESTION),
            "current_characters": len(original_questions["a_to_b"]),
            "common_instructions_unchanged": True,
            "shared_inquiry_unchanged": True,
            "decision_rule": (
                "Compare target ranking and all existing human rankings; inspect the existing "
                "unclear case without imposing an order; preserve peer and sanity controls."
            ),
        },
    )
    try:
        rubric.VERSION = "short-request-question-v1"
        rubric.QUESTIONS = original_questions.copy()
        rubric.QUESTIONS["a_to_b"] = QUESTION
        rubric.QUESTIONS["b_to_a"] = (
            QUESTION.replace("Person A", "Person X")
            .replace("Person B", "Person A")
            .replace("Person X", "Person B")
        )
        for name, event, fixtures, include_drafts in suite_list:
            for repeat in range(1, 4):
                print(f"Starting {name} / repeat {repeat}", flush=True)
                report = evaluate(event, fixtures, MODEL, JevScorer, include_drafts=include_drafts)
                write_json(args.output / f"candidate-{name}-{repeat}.json", report)
                print(
                    f"Saved: {report['api_calls']} calls; {report['approved_outcomes']}", flush=True
                )
    finally:
        rubric.VERSION, rubric.QUESTIONS = original_version, original_questions


if __name__ == "__main__":
    main()
