# Match

A lean organiser CLI for testing whether whole-text contributions and needs produce useful pairs.
Python 3.12+, managed with uv. No web service or database.

```sh
uv sync
uv run pre-commit install
# Set JEV_API_KEY in .env (never commit it).
uv run match assess examples/event.json --a ecology --b networking --output runs/pair.json
```

`TYPESAFE_API_KEY` is accepted as a fallback. `JEV_API_KEY` takes precedence.
The model defaults to `jev-latest`; `--model` accepts a pinned model ID.
A live command sends profile text to TypeSafe and incurs API usage.

Inputs contain `description` and `participants`. Each participant has `id`, `name`
and either a nonblank `profile`, or nonblank `offers` and `needs`. Text is not
summarised; names are excluded from model input. IDs must be unique.

Three hypotheses are scored: A's contribution to B, B's contribution to A, and
shared inquiry. Each uses the five anchors none/weak/moderate/strong/very strong.
Jev returns a distribution over levels 0–4 and its expected score. We divide the
score by four; these are NOT probabilities of successful collaboration. Confidence
is retained for inspection, never used as a match-quality weight. The pair weight
is the sum of the three normalised scores. Rubrics live in `rubric.py`.

Synthetic examples exercise code, not model quality. Real-source acquisition and
human evaluation are documented in `docs/data.md`. Never commit private inputs or
outputs; use `data/` and `runs/`. Public source candidates are not an acquired corpus.

```sh
uv run ruff check .
uv run ruff format --check .
uv run pyright
uv run pytest
```

Tests use fake scorers; CI does not need secrets or private data. Model-quality
assessment requires separate human review. No extraction, introductions, website,
follow-up pairing or claims of validated collaboration prediction yet.
