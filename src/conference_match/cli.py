"""Command-line interface for whole-text matching."""

import argparse
import sys
from pathlib import Path

from pydantic import ValidationError

from conference_match.allocation import allocate
from conference_match.models import load_event, write_json
from conference_match.runs import load_results, score_event
from conference_match.scoring import JevScorer


def protect_output(output: Path, files: list[Path], trees: list[Path] | None = None) -> None:
    target = output.resolve()
    if target in [p.resolve() for p in files] or any(
        target.is_relative_to(p.resolve()) for p in (trees or [])
    ):
        raise ValueError("Output would overwrite source input or run state; choose another path")


def main() -> int:
    parser = argparse.ArgumentParser(prog="match")
    commands = parser.add_subparsers(dest="command", required=True)
    assess = commands.add_parser("assess", help="Assess one pair with Jev")
    assess.add_argument("input", type=Path)
    assess.add_argument("--a", required=True)
    assess.add_argument("--b", required=True)
    assess.add_argument("--output", type=Path, required=True)
    assess.add_argument("--model", default="jev-latest")
    score = commands.add_parser("score", help="Score every pair; rerun to resume")
    score.add_argument("input", type=Path)
    score.add_argument("--output", type=Path, required=True)
    score.add_argument("--model", default="jev-latest")
    score.add_argument("--concurrency", type=int, default=4)
    inspect = commands.add_parser("inspect", help="Inspect saved candidate scores")
    inspect.add_argument("run_dir", type=Path)
    inspect.add_argument("--person", required=True)
    allocation = commands.add_parser("allocate", help="Allocate one partner per person")
    allocation.add_argument("run_dir", type=Path)
    allocation.add_argument("--output", type=Path, required=True)
    allocation.add_argument("--normalisation", choices=["none", "zscore"], default="none")
    args = parser.parse_args()
    try:
        if args.command == "allocate":
            protect_output(
                args.output,
                [args.run_dir / name for name in ("manifest.json", "failures.json", ".lock")],
                [args.run_dir / "pairs"],
            )
            manifest, results = load_results(args.run_dir, complete=True)
            allocation_result = allocate(manifest.event, results, args.normalisation)
            write_json(
                args.output,
                {
                    "input_hash": manifest.input_hash,
                    "rubric_hash": manifest.rubric_hash,
                    "model": manifest.resolved_model,
                    "requested_model": manifest.requested_model,
                    **allocation_result.model_dump(mode="json"),
                },
            )
            print("A / B | A → B | B → A | shared | allocation weight")
            for pair in allocation_result.pairs:
                raw = pair.raw_scores
                print(
                    f"{pair.a_name} / {pair.b_name} | {raw['a_to_b']:.3f} | "
                    f"{raw['b_to_a']:.3f} | {raw['shared_inquiry']:.3f} | {pair.weight:.3f}"
                )
            print(
                f"{len(allocation_result.pairs)} pairs; "
                f"mean weight {allocation_result.mean_weight:.3f}; "
                f"minimum {allocation_result.minimum_weight:.3f}; "
                f"normalisation {args.normalisation}"
            )
            return 0
        if args.command == "score":
            event = load_event(args.input)
            _, failed = score_event(event, args.output, args.model, JevScorer, args.concurrency)
            return 1 if failed else 0
        if args.command == "inspect":
            manifest, results = load_results(args.run_dir)
            manifest.event.person(args.person)
            relevant = [r for r in results if args.person in (r.a, r.b)]
            print("partner | you → them | them → you | shared inquiry | sum")
            for result in sorted(relevant, key=lambda r: (-r.weight, r.a, r.b)):
                is_a = result.a == args.person
                other = result.b if is_a else result.a
                outward = result.metrics["a_to_b" if is_a else "b_to_a"].normalised
                inward = result.metrics["b_to_a" if is_a else "a_to_b"].normalised
                shared = result.metrics["shared_inquiry"].normalised
                print(
                    f"{manifest.event.person(other).name} ({other}) | {outward:.3f} | "
                    f"{inward:.3f} | {shared:.3f} | {result.weight:.3f}"
                )
            print(f"Showing {len(relevant)}/{len(manifest.event.participants) - 1} candidates")
            return 0
        event = load_event(args.input)
        a, b = event.person(args.a), event.person(args.b)
        if a.id == b.id:
            raise ValueError("Choose two distinct participants")
        protect_output(args.output, [args.input])
        result = JevScorer(args.model).score(event, a, b)
        write_json(args.output, result.model_dump(mode="json"))
        for metric, score in result.components.items():
            print(f"{metric}: {score:.3f}")
        print(f"sum: {result.weight:.3f} | model: {result.model}")
        return 0
    except ValidationError as exc:
        # Pydantic's default error includes input text: avoid printing private profiles.
        print(f"Invalid data: {exc.error_count()} validation error(s)", file=sys.stderr)
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
    return 1
