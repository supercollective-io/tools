# Match

A lean organiser CLI for testing whether whole-text contributions and needs produce useful pairs.
Python 3.12+, managed with uv. No web service or database.

```sh
uv sync
uv run pre-commit install
# Set JEV_API_KEY in .env (never commit it).
uv run match assess examples/event.json --a 1cv563y --b 1jgjvjt --output runs/pair.json
```

`TYPESAFE_API_KEY` is accepted as a fallback. `JEV_API_KEY` takes precedence.
The model defaults to `jev-latest`; `--model` accepts a pinned model ID.
A live command sends profile text to TypeSafe and incurs API usage.

Inputs contain `description` and `participants`. Each participant has `id`, `name`
and either a nonblank `profile`, or nonblank `offers` and `needs`. Text is not
summarised; names are excluded from model input. IDs must be unique.

Three hypotheses are scored: A's contribution to B, B's contribution to A, and
shared inquiry. Directional scores measure how much one person’s offers support the other’s stated
needs, using five anchors from no identifiable support to very strong support.
Jev returns a distribution over levels 0–4 and its expected score. We divide the
score by four; these are NOT probabilities of successful collaboration. Confidence
is retained for inspection, never used as a match-quality weight. The pair weight
is the sum of the three normalised scores. Rubrics live in `rubric.py`.

The forty example profiles are adapted from real r/INAT posts, with source URLs
and adaptation notes in `examples/sources.json`. They are historical requests,
not current availability. See `docs/data.md` for provenance and evaluation.
Unedited captures and generated runs stay local under ignored `data/` and `runs/`.

```sh
uv run ruff check .
uv run ruff format --check .
uv run pyright
uv run pytest
```

Tests use fake scorers; CI does not need secrets or private data. Model-quality
assessment requires separate human review. No extraction, introductions, website,
follow-up pairing or claims of validated collaboration prediction yet.

## Score and inspect an event

```sh
uv run match score examples/event.json --model jev-1.14.0 --output runs/reddit-v10
uv run match inspect runs/reddit-v10 --person 1cv563y
# The same command resumes missing/failed pairs without redoing saved successes.
uv run match score examples/event.json --model jev-1.14.0 --output runs/reddit-v10
```

`--concurrency` defaults to four. Transient SDK failures get up to three attempts.
A run freezes event text, rubric fingerprint and model configuration. Its first
successful response resolves `jev-latest`; remaining requests and resumes use that
exact returned model. Changed inputs or rubrics require a new output directory.
There is no silent fallback to a new model. A crash may leave `.lock`: remove it
only after confirming that no process is still writing that run.

Results are written atomically as requests finish. `failures.json` records error
classes without private request bodies. An unsuccessful run exits nonzero; inspect
shows available candidates and the missing count. A complete rerun makes no API calls.

## Allocate one partner per person

```sh
uv run match allocate runs/reddit-v10 --output runs/reddit-v10-allocation.json
uv run match allocate runs/reddit-v10 --normalisation zscore --output runs/reddit-v10-zscore.json
```

Allocation makes no API calls. It requires all pairs to be scored and an even
participant count. NetworkX maximises total edge weight while pairing everyone
exactly once. Tied optimal allocations are equally acceptable.

Default `none` uses the **sum** of all three 0–1 component scores. Optional `zscore`
standardises using the complete candidate graph before matching: both directions
share one pooled relevance distribution, while shared inquiry has its own.
Each value becomes `(value - population_mean) / population_standard_deviation`.
A zero-variance distribution contributes zero. Negative values are retained; the
solver still pairs everyone. All raw values and statistics remain in the export.

This equalises component variability, not predictive importance. Near-constant
noise can be amplified; raw sum remains the default. Compare modes against human
judgements rather than selecting whichever output looks more sophisticated.

The output contains selected partners, raw/transformed components, final weights,
model, rubric and input fingerprints. Displayed scores are rounded; allocation
uses unrounded values. Examples are real-derived and explicitly adapted; model outputs still require
human review and do not establish successful collaboration.

## Iterate against human pairwise judgements

`match evaluate` scores only pairs referenced by human-approved comparisons, then
checks the model's ranking against those judgements. Writer–writer and composer–composer
judgements are in `examples/comparisons.json`, with the user’s review notes and
ordering confidence and perceived score separation. See `docs/prompt-evaluation.md` for review, CLI commands and the development loop.
