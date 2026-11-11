# Opportunity support investigation — 10 November 2026

## Decision

Keep the current v11 prompt. The user-approved short addition did not correct the
targeted support ranking in any of three live repetitions. Both prompts reproduced
8/10 real human rankings in every run. The candidate increased the average score gap
against the user's preferred candidate in the targeted writer/team comparison.
All synthetic controls passed under both prompts. No default rubric change was made.

The user explicitly authorised resending the example profiles and incurring Jev API
usage. The completed experiment contains 132 successful pair assessments, on pinned
`jev-1.14.0`, in `runs/explicit-request-v1/`. Earlier blocked preparations produced no
candidate result. The longer opportunity-specific paragraph was not tested live.

## Existing evidence

`examples/operator-comparisons.json` preserves the two ranked human judgements
from the user's exported `comparisons(1).json`. They are development examples,
not a holdout. The third review, “can't choose”, is retained in the local review
archive and is not converted into a ranked or numeric-equality label.

On the saved complete `runs/reddit-v11` run, the eight previous human comparisons
pass. Both new comparisons fail:

| Human comparison | Human-preferred minus alternative score |
| --- | ---: |
| Support for hobby writer: 3D modeller/writer over professional writer/editor | -0.1325 |
| Shared inquiry with 3D artist: 2D artist learning 3D over beginner Godot developer | -0.0450 |

The “can't choose” case compares two programmers supporting the professional writer.
The saved directional score difference is -0.0625 in the archive's left/right order.
This is a closeness diagnostic only: no pass threshold is inferred from that note.
These cached results are not fresh repeated baseline measurements.

## Diagnosis and candidate

The hobby writer explicitly wants a game-development team on which to contribute
writing. They do not request writing lessons, editing or a writing mentor.
The professional writer/editor has narrative skills but also seeks a developer;
the 3D modeller/writer explicitly proposes making a small game as an equal
collaboration. That proposal appears under **needs**, so the entire profile matters.

This supports testing whether the directional rubric credits relevant skills
without checking that they provide the kind of help requested. It does not prove
Jev's internal reasoning. The expert's recorded explanation also credited narrative
skills as though those were the recipient's request; that is suggestive evidence of
an interpretation error, not independent ground truth.

The user's note calls the preferred candidate a programmer and artist. The source
states 3D modelling, writing, artistic ability and some engine experience. Do not
rewrite that into an unstated programming credential. Preserve the human preference
while assessing the actual profile.

Append the following to each directional question; leave common instructions,
shared inquiry, score anchors and allocation weights unchanged:

> Assess what the person explicitly asks for help with. Relevant skills count only
> when they help fulfil that request.


The new shared-inquiry failure concerns a different metric. It remains in the test
suite but is not evidence for this directional change. Same-skill collaboration
must remain valid when it answers the actual request.

## Controlled test

`experiments/opportunity_support.py` performs three fresh repetitions of each
variant on pinned `jev-1.14.0`, alternating baseline/candidate order:

- Ten real human rankings: eight existing plus two newly exported; twelve pairs.
- The existing unclear judgement: two pairs, diagnostic only.
- Three explicit peer-wanted/peer-excluded controls: four pairs.
- Five reciprocal/asymmetric/unrelated sanity checks: four pairs.

That is **132 pair assessments**, excluding any transport retries. Jev receives
only the example event/profile text and the rubric through the existing scorer;
human preferences, notes, display names and reviewer identities are not transmitted.
All profiles are existing public-derived examples or synthetic controls.

```sh
uv run python experiments/opportunity_support.py \
  --output runs/explicit-request-v1-next \
  --review-archive runs/expert-assessment/source-review.json
```

Use a new output directory each time. Reports preserve inputs, labels, model,
rubric and individual scores; the application rubric is restored even on failure.
This small experiment does not resume partial live runs. Completed suite reports
remain available if a later request fails.

The candidate should consistently improve the targeted support preference without
regressing the earlier rankings or explicit-peer/asymmetry controls. Inspect margins
and every failure, not only aggregate pass rates. Do not change labels to make a
candidate pass. No claim of general improvement follows from this development set.

Local fake-scorer tests verify identical inputs and labels across variants, unchanged
shared-inquiry instructions, separate unclear reporting, pinned requested model,
request counts and restoration of the default rubric. They do not test model quality.


## Live results

Three fresh repeats per variant; identical profiles, labels, model, scale and
shared-inquiry wording. The candidate appends exactly the two sentences above to
each existing directional question. Baseline/candidate execution order alternates.

| Suite | Current v11 | Short addition |
| --- | --- | --- |
| Ten real human rankings | 8/10 each repeat | 8/10 each repeat |
| Explicit peer collaboration controls | 3/3 each repeat | 3/3 each repeat |
| Reciprocal/asymmetric/unrelated sanity checks | 5/5 each repeat | 5/5 each repeat |

Both prompts pass the original eight comparisons and fail the two newly ranked
comparisons in all three repetitions. These are repeated development measurements,
not 30 independent human labels or evidence of general accuracy.

### Target: support for the hobby writer seeking a team

Scores below are normalised rubric levels on 0–1, not success probabilities.

| Candidate | Current mean | Short-addition mean |
| --- | ---: | ---: |
| 3D modeller/writer (human-preferred) | 0.6450 | 0.5783 |
| Professional writer/editor | 0.7642 | 0.7717 |
| Preferred minus alternative | -0.1192 | -0.1933 |

Baseline margins were -0.0900, -0.1100 and -0.1575; candidate margins were -0.2100,
-0.2125 and -0.1575. The short addition fails the intended correction and moves the
average further from the human ordering. This does not establish the model's internal
reasoning or disprove the opportunity-versus-skill diagnosis; it rejects this wording
as a demonstrated solution on the tested examples.

### Other observations

- The new shared-inquiry comparison fails throughout. Its mean human-preferred margin
  is -0.0525 under baseline and -0.0325 under candidate. That question was unchanged;
  variation is not evidence of a targeted shared-inquiry improvement.
- For the human “can't choose” case, mean absolute left/right difference decreases
  from 0.0583 to 0.0283. Candidate signs reverse between runs. This is consistent with
  closer scores, but no exact tie or tolerance was requested and no pass/fail label
  is assigned to this diagnostic. Signed means alone would hide the variation.
- All eight earlier ranked cases still pass, but some margins shrink. For example,
  `writer_seeking_game_team` averages +0.0383 under baseline versus +0.0167 under
  candidate; `composer_other_direction` averages +0.1858 versus +0.0833. Aggregate
  agreement therefore conceals changes in separation.

## Artefacts and limits

Each suite/repeat report under `runs/explicit-request-v1/` includes the complete
input, rubric, human fixture records, returned assessments and model version.
`plan.json` records the pre-run decision rule; `summary.json` aggregates margins
and outcomes, excluding pass/fail outcomes for the unclear diagnostic. Raw evaluator
reports use draft rows for that diagnostic; their mechanically calculated ordering
outcomes must not be interpreted as human-labelled correctness.

The new human labels are preserved unchanged in `examples/operator-comparisons.json`.
No additional human review, full-graph allocation, expert-model rerun, or new prompt
search was performed. The application continues using `whole-text-v11`.
