"""Command-line interface for whole-text matching."""

import argparse
import sys
from pathlib import Path

from pydantic import ValidationError

from conference_match.models import load_event, write_json
from conference_match.scoring import JevScorer


def main() -> int:
    parser = argparse.ArgumentParser(prog="match")
    commands = parser.add_subparsers(dest="command", required=True)
    assess = commands.add_parser("assess", help="Assess one pair with Jev")
    assess.add_argument("input", type=Path)
    assess.add_argument("--a", required=True)
    assess.add_argument("--b", required=True)
    assess.add_argument("--output", type=Path, required=True)
    assess.add_argument("--model", default="jev-latest")
    args = parser.parse_args()
    try:
        event = load_event(args.input)
        a, b = event.person(args.a), event.person(args.b)
        if a.id == b.id:
            raise ValueError("Choose two distinct participants")
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
