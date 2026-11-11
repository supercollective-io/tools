# Prompt iteration against human judgements — 10 November 2026

## Decision

Keep `whole-text-v10`, using the user’s wording:

> Considering only requirements Person B has explicitly asked for, how much can Person A help fulfil Person B’s requests?

Swap A and B for the other direction. Common instructions, five support labels, shared-inquiry question, profiles, human labels and allocation weights are unchanged.

**8/8 human rankings on three runs; 5/5 synthetic sanity checks.** This is development-set performance after trying multiple candidates, not independent validation. No unseen holdout was tested.

## Diagnosis

The original saved scores for question 4 rated the other composer’s contribution at 0.613 and the visual-novel developer’s at 0.570. The recipient seeks a game project; another composer does not explicitly offer one. The model returns distributions, not reasoning, so interpreting this as credit for unrequested collaboration is a hypothesis.

In question 7, the original writer–writer pair total was 2.415 versus 2.340 for writer–developer. Directional scores were similar and slightly higher shared inquiry tipped the sum towards the two writers. The user prefers the developer’s concrete project and reciprocal need for writing.

Similar profiles also appear in questions 1, 2, 3, 5, 6 and 8. They are not a reason for a blanket penalty: explicit co-writing and programmer-partner requests must remain valid.

## Runs

Every real-fixture run scores the same nine distinct pairs with `jev-1.14.0`. A positive margin means the human-preferred candidate is above the alternative. Question 7 uses the sum (range 0–3); question 4 is directional support (range 0–1).

| Candidate | Passes / 8 | Ties | Q4 margin | Q7 margin |
| --- | ---: | ---: | ---: | ---: |
| Original, fresh | 7 | 0 | +0.025 | -0.025 |
| Shared-skills clarification | 7 | 0 | +0.120 | -0.027 |
| Provide what is sought | 7 | 0 | -0.270 | +0.075 |
| Provide + shared-skills clarification | 5 | 0 | -0.208 | -0.005 |
| Seeking is not providing | 7 | 0 | -0.018 | +0.040 |
| Exclude unrequested benefits | 7 | 1 | +0.050 | +0.000 |
| Fill a stated gap | 5 | 0 | -0.117 | -0.210 |
| Exclude unrequested benefits, repeat 1 | 8 | 0 | +0.052 | +0.067 |
| Exclude unrequested benefits, repeat 2 | 8 | 0 | +0.083 | +0.085 |
| Original, repeat | 6 | 0 | -0.078 | -0.030 |
| Given requirements (user) | 7 | 0 | -0.005 | +0.307 |
| Considering only (user) | 8 | 0 | +0.035 | +0.195 |
| Considering only, repeat 1 | 8 | 0 | +0.123 | +0.243 |
| Considering only, repeat 2 | 8 | 0 | +0.017 | +0.265 |

The old cached run initially scored 6/8. Fresh original-prompt runs scored 7/8 and 6/8, confirming that question 4 was unstable. The accepted prompt scored 8/8 on all three trials; its question 4 margin ranged from +0.017 to +0.123, and question 7 from +0.195 to +0.265.

## Trade-off and limits

Question 2 remains correctly ordered, but its margin is 0.328–0.350 with the accepted wording. The human judgement calls the candidates similar-ish. The alternative excluding unrequested benefits kept that margin at 0.050–0.062 but scored 7/8 with one tie, then 8/8 twice. We retain the user’s latest wording for its observed ranking consistency, without claiming better absolute calibration.

The qualitative similarity annotation is preserved; no numeric threshold was invented. Several comparisons reuse people and pairs, so the eight outcomes are not independent evidence. Repeated success on these examples does not establish general reliability.

All three tested sanity candidates passed 5/5. For the accepted wording, reciprocal directional support was 0.983 and 0.985; the one-way pair scored 0.990 in its supported direction and 0.003 in the unsupported direction.

## Reproduction and artefacts

```sh
uv run match evaluate examples/event.json examples/comparisons.json \
  --model jev-1.14.0 --output runs/next-real-evaluation.json
uv run match evaluate examples/sanity-event.json examples/sanity-comparisons.json \
  --model jev-1.14.0 --output runs/next-sanity-evaluation.json
```

Use new output filenames; saved evaluations include their complete prompt text, profile snapshot, human judgements, model version and raw assessments. No full-event scoring or allocation was rerun.

This iteration used 138 pair assessments across 14 real-fixture runs and 3 sanity runs. Generated reports remain ignored by Git.

### Saved run files

- `runs/iteration-baseline-v2.json` — Original, fresh
- `runs/iteration-skills-v3.json` — Shared-skills clarification
- `runs/iteration-provide-v4.json` — Provide what is sought
- `runs/iteration-provide-skills-v5.json` — Provide + shared-skills clarification
- `runs/iteration-seeking-v6.json` — Seeking is not providing
- `runs/iteration-requested-v7.json` — Exclude unrequested benefits
- `runs/iteration-gap-v8.json` — Fill a stated gap
- `runs/iteration-requested-v7-repeat1.json` — Exclude unrequested benefits, repeat 1
- `runs/iteration-requested-v7-repeat2.json` — Exclude unrequested benefits, repeat 2
- `runs/iteration-baseline-v2-repeat.json` — Original, repeat
- `runs/iteration-user-v9.json` — Given requirements (user)
- `runs/iteration-user-only-v10.json` — Considering only (user)
- `runs/iteration-user-only-v10-repeat1.json` — Considering only, repeat 1
- `runs/iteration-user-only-v10-repeat2.json` — Considering only, repeat 2
- `runs/iteration-requested-v7-sanity.json` — synthetic sanity check
- `runs/iteration-user-v9-sanity.json` — synthetic sanity check
- `runs/iteration-user-only-v10-sanity.json` — synthetic sanity check

### Candidate questions

- **Original, fresh:** How much can what Person A offers support Person B's stated needs?
- **Shared-skills clarification:** How much can what Person A offers support Person B's stated needs? Shared skills alone do not establish support.
- **Provide what is sought:** How well do Person A's stated offers provide something Person B explicitly seeks?
- **Provide + shared-skills clarification:** How well do Person A's stated offers provide something Person B explicitly seeks? Shared skills alone do not establish support.
- **Seeking is not providing:** How much can what Person A offers support Person B's stated needs? Seeking the same thing is not providing it.
- **Exclude unrequested benefits:** How much can Person A help fulfil Person B's requests, excluding benefits B has not asked for?
- **Fill a stated gap:** How well do Person A's offers fill a gap that Person B describes?
- **Given requirements (user):** Given requirements Person B has explicitly asked for, how much can Person A help fulfil Person B's requests?
- **Considering only (user):** Considering only requirements Person B has explicitly asked for, how much can Person A help fulfil Person B's requests?

## Subsequent full-run check

The later 780-pair v10 run reproduced 7/8 fixture rankings: question 7 remained
correct, but question 4 reversed by 0.0225. This supplements the three earlier 8/8
fixture runs and confirms residual instability. See `full-run-comparison.md` for
component changes, all partner changes and token-based cost estimates. The full
run does not change the human judgements or the prompt.
