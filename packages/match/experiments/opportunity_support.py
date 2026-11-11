"""Controlled development experiment; does not change the application's default rubric.

Run from the repository root with Python from the project's environment.
"""

import argparse
from pathlib import Path

from conference_match import rubric
from conference_match.evaluation import Comparison, Fixtures, evaluate
from conference_match.models import load_event, write_json
from conference_match.review import ReviewSession
from conference_match.scoring import JevScorer

MODEL = "jev-1.14.0"
ADDITION = (
    " Assess what the person explicitly asks for help with. "
    "Relevant skills count only when they help fulfil that request."
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--review-archive", type=Path, required=True)
    parser.add_argument("--repeats", type=int, default=3)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("Choose a new output directory to preserve previous experiments")
    if args.repeats < 1:
        raise ValueError("Repeats must be positive")
    if rubric.VERSION != "whole-text-v11":
        raise ValueError("This experiment expects the unchanged v11 baseline")
    original_version, original_questions = rubric.VERSION, rubric.QUESTIONS.copy()
    old = Fixtures.model_validate_json(Path("examples/comparisons.json").read_text())
    new = Fixtures.model_validate_json(Path("examples/operator-comparisons.json").read_text())
    real = Fixtures(comparisons=old.comparisons + new.comparisons)
    archive = ReviewSession.model_validate_json(args.review_archive.read_text())
    unclear = []
    for proposal in archive.proposals:
        judgement = archive.judgements.get(proposal.id)
        if judgement and judgement.choice == "unclear":
            unclear.append(
                Comparison(
                    id=proposal.id,
                    preferred=proposal.left,
                    alternative=proposal.right,
                    metric=proposal.metric,
                    status="draft",
                    reason="Orientation only, not an expected ordering. Human note: "
                    + judgement.reason,
                )
            )
    if not unclear:
        raise ValueError("Expected an existing unclear judgement for the diagnostic")
    suites = [
        ("real", load_event(Path("examples/event.json")), real, False),
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
    write_json(
        args.output / "plan.json",
        {
            "model": MODEL,
            "repeats": args.repeats,
            "candidate_addition": ADDITION,
            "baseline_version": original_version,
            "baseline_questions": original_questions,
            "decision_rule": "Seek consistent target support improvement without regressions "
            "on earlier "
            "human rankings or synthetic peer/asymmetry controls. Shared inquiry is unchanged. "
            "No numeric tolerance or ranking is invented for unclear judgements. "
            "Development evidence only.",
        },
    )
    try:
        for repeat in range(1, args.repeats + 1):
            # Alternate order to reduce confounding from always running the candidate last.
            variants = ("baseline", "opportunity") if repeat % 2 else ("opportunity", "baseline")
            for variant in variants:
                rubric.VERSION = (
                    original_version if variant == "baseline" else "explicit-request-test-v1"
                )
                rubric.QUESTIONS = original_questions.copy()
                if variant == "opportunity":
                    for key in ("a_to_b", "b_to_a"):
                        rubric.QUESTIONS[key] += ADDITION
                for name, event, fixtures, include_drafts in suites:
                    print(f"Starting {variant} / {name} / repeat {repeat}", flush=True)
                    report = evaluate(
                        event, fixtures, MODEL, JevScorer, include_drafts=include_drafts
                    )
                    write_json(args.output / f"{variant}-{name}-{repeat}.json", report)
                    print(
                        f"Saved: {report['api_calls']} calls; {report['approved_outcomes']}",
                        flush=True,
                    )
    finally:
        rubric.VERSION, rubric.QUESTIONS = original_version, original_questions


if __name__ == "__main__":
    main()
