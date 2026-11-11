# Pairwise human-judgement evaluation

The reference is a human ordering: **this pair should score higher than that pair**.
The model still scores each pair independently; code checks whether the scores reproduce
that ordering. This is a prompt evaluation, not an allocation or model-versus-model vote.

## Review and label

`examples/comparisons.json` contains eight user-reviewed comparisons from the real profiles,
including the writer–writer and composer–composer pairs. Their review notes are
recorded as human interpretations, not new facts added to the source profiles.
New comparisons should start as `draft`.
An agent's suggested ranking is not a human label. Review the full profiles before
looking at their model scores. Reverse a proposed ordering if appropriate, or leave it
as draft if ambiguous. Once agreed, set `status` to `approved` and `reviewed_by` to the
human reviewer. Record the reason for the preference.

Each comparison selects one metric:

- `support`: the first person's offers supporting the second person's needs. Pair order matters.
- `shared_inquiry`: common inquiry between the two people. Pair order does not matter.
- `sum`: the complete pair's two directional scores plus shared inquiry. Pair order does not matter.

Do not assume an overall preference establishes a preference on every component.
The draft suite includes component tests to diagnose failures and overall-pair tests
to test the agreed matching objective. Report them separately when interpreting results.

## Rapid iteration

Run human-approved development comparisons after each prompt edit:

```sh
uv run match evaluate examples/event.json examples/comparisons.json \
  --model jev-1.14.0 --output runs/eval-support-v3.json
```

Only the distinct pairs referenced by the selected comparisons are sent to Jev.
All eight current comparisons need nine assessments, not 780. Repeated pairs and reversed
orientations reuse one assessment. The first response pins the model for later calls.
Use a fresh output filename for each run; existing results are never overwritten.
This lean evaluator does not resume a partially failed live run.

The command prints each ordering result, both scores, the signed margin, and aggregate
agreement with human-approved judgements. A positive margin means the preferred pair
scored higher. Ties are reported separately and do not satisfy a strict preference.
Exit status is 1 if any approved ranking fails or ties, or the command errors; otherwise 0.
An empty approved suite refuses to run. The saved JSON contains the profiles, labels,
full rubric, model version, assessments and comparison results.

After scoring a full event under the current rubric into `runs/reddit-v11`,
you can inspect draft proposals against that run without API calls:

```sh
uv run match evaluate examples/event.json examples/comparisons.json \
  --model jev-1.14.0 --include-drafts --from-run runs/reddit-v11 \
  --output runs/draft-review.json
```

Draft outcomes are preview-only and never enter human-judgement accuracy. The saved
run must match the current profiles, event description, rubric and selected model.
Omit `--from-run` for fresh fixture scoring after a prompt change. Do not interpret
agent-proposed fixtures as evidence that the prompt is accurate.

## Choosing the next prompt

Keep the inputs, model and approved labels fixed when comparing prompts. Inspect failures
and score margins, not just the headline pass rate: tiny margins may reverse on another
run, and examples involving the same people are not independent observations.

Use `split: development` while iterating. Reserve separately reviewed comparisons as
`split: holdout`, then use `--split holdout` only for promising candidates. No genuine
holdout is supplied yet: the existing examples have already informed prompt development.
Do not relabel a failed case simply to make a prompt pass. Expand the fixture set with
new human judgements, including valid same-skill collaboration and asymmetric needs.

Only then run the full candidate graph and inspect the resulting allocation. The fixtures
are a cheap check of pair scores; they do not establish that the global pairing is good.

## Synthetic sanity suite

`examples/sanity-event.json` is deliberately fictional and separate from the forty
real-derived profiles. `examples/sanity-comparisons.json` encodes the user's requested
reciprocal, one-way and unrelated scenarios as approved behavioural expectations.
These are not empirical labels from real people; `kind: synthetic` keeps the reporting
explicit. The wording is assistant-authored from the user-specified scenarios.

The heart surgeon needs newt care; the newt specialist needs heart surgery. A second
newt specialist instead needs tax help, making their pairing with the surgeon one-way.
An unrelated game programmer provides a contrast. The event context remains a game
meetup, so the reciprocal match must work even outside the event's main subject.

```sh
uv run match evaluate examples/sanity-event.json examples/sanity-comparisons.json \
  --model jev-1.14.0 --output runs/sanity-next-prompt.json
```

Five ranking checks need four pair assessments. Inspect the scores as well as pass/fail:
rank agreement alone does not establish absolute calibration. Do not combine the sanity
suite's pass rate with the separately reviewed real-data accuracy. These are development
checks, not an unseen holdout. No prompt change was made to achieve their first passing run.

## First human-reviewed baseline

The user reviewed all eight comparisons on 2026-11-10, then clarified the first two:
question 1 is a definite preference for A after withdrawing an inference that the
composer might have technical game-development skills. Its expected separation is
unspecified. Question 2 is a definite preference for A, while the candidates remain
fairly similar. Questions
3, 4 and 6 also express definite orderings. Ordering confidence is unspecified for
5, 7 and 8 rather than inferred from the explanation.

`ordering_confidence` records how definite the preference is. `expected_separation`
records perceived closeness independently: question 2 is `similar`; question 1 is
`unspecified` after re-review. These are
qualitative review annotations, not invented numeric bounds or metric weights.
Rank accuracy alone does not measure separation agreement: a large score gap can
still pass a comparison where the human judges the candidates similar.

The original baseline is preserved locally in `runs/human-review-revised-q1.json`.
Its rubric predates the current prompt; `--from-run` intentionally rejects it under
the current rubric. Use a fresh fixture-only run for the current prompt. See
`prompt-experiments.md` for the controlled iteration and repeated results.

Do not convert a reviewer's interpretation into an unstated profile requirement.
For example, question 4's review interprets the composer as preferring professional
work; the input itself expresses a preference for a committed team and larger projects,
with flexibility about payment. The human ordering is retained without rewriting it.

## Exploratory role-placement comparison

`examples/role-context-event.json` copies the fixture-4 profiles and adds one
synthetic recipient whose needs begin “I am a composer.” Its four draft comparisons
can be run with `--include-drafts` to inspect placement effects without declaring
an expected human ranking. Both sides' complete offers and needs already reach the
model. See `role-context-experiment.md` for the controlled five-repeat experiment.

## Additional help and explicitly requested peers

The current v11 prompt considers the recipient’s existing offers within the
directional support metric. `examples/additional-help-event.json` and its
comparison file test explicitly wanted versus excluded co-composition. These
synthetic controls are separate from the exploratory role-repetition cases and
the real reviewed judgements. See `additional-help-experiment.md` for baseline
comparisons, repeated results, trade-offs and limitations. No overlap penalty
or fourth metric was added.
