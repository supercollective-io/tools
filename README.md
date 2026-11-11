# Match

A lean organiser CLI for testing whether whole-text contributions and needs produce useful pairs.
Python 3.12+, managed with uv. Includes a local operator review interface; no hosted service or database.

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
assessment requires separate human review. No extraction, automated messaging, follow-up pairing or claims of validated
collaboration prediction yet.

## Score and inspect an event

```sh
uv run match score examples/event.json --model jev-1.14.0 --output runs/reddit-v11
uv run match inspect runs/reddit-v11 --person 1cv563y
# The same command resumes missing/failed pairs without redoing saved successes.
uv run match score examples/event.json --model jev-1.14.0 --output runs/reddit-v11
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
uv run match allocate runs/reddit-v11 --output runs/reddit-v11-allocation.json
uv run match allocate runs/reddit-v11 --normalisation zscore --output runs/reddit-v11-zscore.json
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


## Review in a browser

```sh
uv run match review examples/event.json \
  --fixtures examples/comparisons.json \
  --run runs/reddit-v11
```

Open <http://127.0.0.1:8765>. The interface uses plain forms and tables to import
an event, inspect full profiles, review blind pair comparisons, save judgements,
and inspect/export a saved allocation. It makes no model calls. Omit `--run` if
no scoring run is available. Use `--port` to choose another port.

Reviews are saved atomically under `runs/operator-review/`, separately for each
event fingerprint. Restart with the same event and workspace to resume. Use
`--workspace` for another review workspace. Only one server can use a workspace
at a time; after a crash, remove its `.lock` only once the server has stopped.
The server binds to loopback and is intended for one local operator, not hosting.

The forty-person example produces 40 neutral comparison prompts: 30 development
and 10 reserved holdout comparisons. New questions assess one metric at a time:
directional support or shared inquiry. Overall comparisons are not generated.
Existing sessions retire unanswered overall questions on reopening; recorded
judgements and their history are preserved. The shared participant appears once.
For support questions, candidates’ offers are visible and their needs can be
expanded. The recipient’s needs appear first, with their offers expandable for
context when judging additional help. Unstructured profiles remain intact.

The reserved people are disjoint from the
development group and from people referenced in `--fixtures`. Smaller events can
produce fewer questions or no holdout. No preferred answer is generated.
This is a review queue, not new ground truth or proof of an unseen test set.

Choose A, B, or “Can’t choose”, with an optional note. Browser reviews are attributed
to “Local operator”; no name, confidence or separation entry is required. Unclear judgements
remain in the archive and are excluded from ranked exports. Save and next resumes
the first unanswered question; choose a reviewed question to amend it. The archive
retains the edit history, timestamps, event snapshot and score-exposure information.

Review reserved holdout questions before revealing an allocation. Once scores
are revealed, holdout judgements are locked; development reviews can still be
edited and are recorded as having seen scores. Allocation uses the existing
solver, displays weakest pairs first, and exports model/rubric/input provenance.
The original rules still apply: a complete scoring run, an even participant count,
and one partner for everyone. The interface does not introduce pairing overrides.

Export approved comparisons to a file, then use it with the existing evaluator:

```sh
uv run match evaluate examples/event.json runs/operator-comparisons.json \
  --model jev-1.14.0 --output runs/operator-evaluation.json
```

Use `--split holdout` only once a candidate is ready for held-out evaluation.
Keep the review archive alongside the fixture export. Supply all relevant prior
comparisons when starting a new workspace. Reserving people automatically cannot
undo previous exposure to their scores, or guarantee coverage of important cases.
For independent validation, collect genuinely fresh profiles and human judgements.
Imported event files use the same schema as the CLI; existing comparisons are
optional during import. Reimporting an unchanged event resumes its saved session.

## Expert-assisted blind batches

The expert supplies **machine judgements for triage**, not approved human labels.
Use two fresh expert contexts: one sees the forward packet, the other sees reversed
A/B order. Both receive complete profiles and a single metric per question, without
human answers, Jev scores, or each other's answers. Keep the existing human answers
as an initial diagnostic instead of supplying them as examples.

```sh
uv run match expert-prepare runs/expert-assessment/source-review.json \
  --output runs/expert-inputs-next
```

Each expert returns `{input_hash, judge, assessments}`. Each assessment contains
`proposal_id`, `choice` (`left`, `right`, `unclear`), `reason`, and `ambiguous`
(boolean). Choices refer to the packet that expert received. The ranker maps the
reverse pass back to the original orientation, validates complete unique coverage,
and compares the requested metric against the saved Jev run:

```sh
uv run match expert-rank runs/expert-assessment/source-review.json \
  --forward runs/expert-assessment/forward-output.json \
  --reverse runs/expert-assessment/reverse-output.json \
  --run runs/reddit-v11 --output runs/expert-assessment/triage-next.json
```

The first assessment was performed in two fresh Codex agent contexts. It is not
an external provider API integration or evidence from two different model families.
The packets, expert answers and private triage report remain under ignored `runs/`.
Future assessments require running an expert on the exported packets and importing
its answers; the browser makes no model calls.

The prepared review workspace preserves the three previous human judgements and
presents the 23 unanswered questions in batches of 5, 5, 5, 5 and 3:

```sh
uv run match review examples/event.json --workspace runs/expert-review \
  --expert-report runs/expert-assessment/triage.json --port 8766
```

Open <http://127.0.0.1:8766>. Finish a batch, then stop or explicitly choose
**Review another five**. Progress survives restarts. The queue prioritises order
instability, disagreement and ambiguity, and includes an agreement audit per batch
where available. It randomises question order within each batch and persists random
A/B orientation. Completed human judgements are never reoriented or asked again.

The browser receives only the active batch and human review records. It never
receives expert choices, rationales, Jev scores or selection reasons. Allocation
score disclosure is disabled in this workspace. Original sessions remain separate.
Exports still contain human judgements only, with uncertainty retained in the archive.

These are targeted diagnostic batches, **not a representative accuracy sample**.
The old split names remain for compatibility; targeted selection does not turn them
into independent validation. Separately collect a randomly sampled, genuinely unseen
human evaluation set. Agreement between expert and Jev can still be wrong.
