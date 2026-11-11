# Additional-help contribution experiment — 10 November 2026

## Decision

Keep the lean v11 question as the next candidate:

> Given what Person B already offers, how much additional help can Person A provide towards Person B’s explicit requests?

Swap A/B for the reverse direction. No new metric, overlap penalty, extraction, input field, or allocation weight was added. Shared inquiry and common instructions are unchanged. Real fixture 4 remains approved and unchanged.

## What was actually tested

The earlier role-placement experiment added only “I am a composer.” It did not add “I do not need another composer”. All scoring requests already receive both people’s complete offers and needs; the recipient’s composer role was already stated in offers. That previous experiment tested repetition of an existing fact, not explicit exclusion.

This experiment compares the v10 baseline with v11 on three fresh runs each of the eight real judgements, plus three runs each of three explicit same-role sanity judgements. The model is pinned to `jev-1.14.0`; profiles and labels are held fixed within each comparison.

New synthetic controls copy the original recipient composer’s offers unchanged and replace only the needs:

- **Peer wanted:** “I am a composer. I am looking for another composer and pianist to co-compose a classical-inspired game soundtrack with me.”
- **Peer excluded:** “I am a composer. I will handle all composition myself and am not looking for another composer. I need a game developer with a project that needs music.”

Both recipients are paired with the same original peer composer and visual-novel developer. These deliberately explicit, assistant-authored controls implement the requested preservation of valid peer collaboration; they are not additional human judgements about the real posts. Original source IDs are `1gk4mad`, `1joxpvx` and `1l1fhta`, with provenance in `examples/sources.json`.

## Ranking results

| Suite | v10 baseline | v11 additional help |
| --- | --- | --- |
| Eight real judgements, three runs | 8/8 each run | 8/8 each run |
| Three explicit peer controls, three runs | 3/3 each run | 3/3 each run |
| Original reciprocal/asymmetric sanity suite | Previously 5/5 | 5/5 in this experiment |

The fresh baseline also passed all real judgements. Earlier v10 runs sometimes failed question 4. These results support retaining a promising candidate, not claiming an accuracy improvement or general reliability.

## Real comparisons: mean scores and margin ranges

| Question | v10 preferred / alternative | v11 preferred / alternative | v10 margin range | v11 margin range |
| --- | --- | --- | --- | --- |
| 1. writer_explicit_cowriting | 0.741 / 0.188 | 0.626 / 0.124 | +0.535 to +0.585 | +0.438 to +0.547 |
| 2. writer_seeking_game_team | 0.808 / 0.472 | 0.807 / 0.757 | +0.270 to +0.372 | +0.022 to +0.065 |
| 3. composer_project_over_peer | 0.759 / 0.286 | 0.738 / 0.341 | +0.420 to +0.510 | +0.323 to +0.442 |
| 4. composer_other_direction | 0.577 / 0.527 | 0.629 / 0.519 | +0.008 to +0.080 | +0.090 to +0.145 |
| 5. writer_shared_inquiry | 0.843 / 0.647 | 0.848 / 0.646 | +0.180 to +0.208 | +0.193 to +0.220 |
| 6. composer_overall_pair | 2.012 / 1.478 | 2.067 / 1.522 | +0.463 to +0.630 | +0.510 to +0.605 |
| 7. writer_overall_pair | 2.328 / 2.055 | 2.324 / 2.232 | +0.218 to +0.305 | +0.058 to +0.143 |
| 8. programmer_explicit_peer | 0.642 / 0.041 | 0.684 / 0.188 | +0.585 to +0.622 | +0.490 to +0.505 |

Question 2’s mean gap is 0.049 instead of 0.337, closer to the human “similar-ish” judgement without an invented numerical threshold. Question 4’s mean margin increases from 0.050 to 0.110. Question 7’s mean margin decreases from 0.273 to 0.093 while remaining positive in all three trials. Metrics for question 7 are summed (0–3); directional margins are on 0–1 scores.

## Explicit peer request and exclusion

| Prompt | Peer when requested | Developer when peer requested | Peer when excluded | Developer when requested instead |
| --- | ---: | ---: | ---: | ---: |
| v10 | 0.840 | 0.084 | 0.077 | 0.841 |
| v11 | 0.828 | 0.136 | 0.056 | 0.812 |

Both prompts already distinguish the explicit boundary. Under v11, the same composer offer averages 0.828 when requested and 0.056 when excluded. Shared-role collaboration is preserved; the evidence does not support adding a separate overlap metric.

## Limits and interpretation

- The ambiguous real composer’s peer support remains about 0.519 under v11, versus 0.527 under v10. The improved ranking in question 4 mainly comes from raising support for the developer (0.577 → 0.629), not turning the composer peer score into zero.
- The experiment tests score behaviour, not hidden reasoning. It does not prove that the model computes marginal contribution or understands role redundancy in general.
- Explicitly wanting another composer is different from already being a composer. Existing skill alone does not establish that collaboration, extra capacity or complementary experience is unwanted.
- Three repeats and a small, reused development set are not independent validation. No new holdout or full-event allocation was run.
- A broader redundancy penalty could conflict with the co-writing and programmer-peer fixtures. Further tests should vary the stated request and existing capability separately before adding another dimension.

## Reproduce

```sh
uv run match evaluate examples/event.json examples/comparisons.json \
  --model jev-1.14.0 --output runs/additional-help-next-real.json
uv run match evaluate examples/additional-help-event.json \
  examples/additional-help-comparisons.json --model jev-1.14.0 \
  --output runs/additional-help-next-peer.json
uv run match evaluate examples/sanity-event.json examples/sanity-comparisons.json \
  --model jev-1.14.0 --output runs/additional-help-next-sanity.json
```

Use new output filenames. Each real run uses nine pairs; each explicit-peer run uses four. This experiment made 82 pair assessments, including the four-pair original sanity run. Reports include full prompt and input snapshots.

Saved runs: `runs/additional-baseline-real-{1,2,3}.json`, `runs/additional-baseline-peer-{1,2,3}.json`, `runs/additional-v11-real-{1,2,3}.json`, `runs/additional-v11-peer-{1,2,3}.json`, and `runs/additional-v11-sanity.json`. Generated assessments remain local and ignored by Git.

## Subsequent full-event run

The later full v11 run completed all 780 real-profile pairs and reproduced all
eight reviewed fixture rankings. Raw-sum and z-score allocations each retain
5/20 pairs from v10; the two v11 modes agree on 15/20 pairs. Mean directional
support increases from 0.420 to 0.459, while mean shared inquiry stays near 0.516.
See `v10-v11-comparison.md` for all partner changes, component comparisons and
the distinction between an individual pair ranking and a global allocation.
