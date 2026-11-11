# Role placement experiment — 10 November 2026

## Question and setup

Does repeating the recipient’s role inside their needs change fixture 4’s scores?

Every scoring request already receives both people’s complete `offers` and `needs`, plus event context. Display names/titles and IDs are not sent to Jev. The recipient’s original offers already begin “I am a hobby composer and pianist.” Therefore this tests repetition and placement of an existing fact, not supplying a previously unknown role.

The experiment uses the existing peer composer (`1gk4mad`), recipient composer (`1joxpvx`) and visual-novel developer (`1l1fhta`) from `examples/event.json`. Their source URLs and adaptation provenance remain in `examples/sources.json`. A synthetic recipient (`1joxpvx-role`) changes only the needs text by prepending:

> I am a composer.

Original and modified recipients are each assessed with the peer composer and developer. The event, all other text, model (`jev-1.14.0`), rubric (`whole-text-v10`), criteria and score extraction remain fixed. The synthetic ID preserves the original recipient’s relative A/B ordering with both partners; IDs and display names are not model inputs.

Five repetitions × four unique pair assessments = 20 requests. No metric or prompt changes were made. Real fixture 4 remains unchanged and approved. The four comparisons in this experiment are drafts: their preferred/alternative ordering merely specifies exploratory contrasts, not new human judgements.

## Mean component scores

The first direction is partner → recipient composer. The reverse is recipient → partner.

| Partner | Recipient version | Partner → recipient | Recipient → partner | Shared inquiry |
| --- | --- | ---: | ---: | ---: |
| Peer composer | Original needs | 0.5490 | 0.2740 | 0.6715 |
| Peer composer | Role repeated in needs | 0.5340 | 0.3010 | 0.6735 |
| Visual-novel developer | Original needs | 0.5750 | 0.8320 | 0.8120 |
| Visual-novel developer | Role repeated in needs | 0.5450 | 0.8365 | 0.8280 |

The peer’s mean directional support changes by −0.015; the developer’s by −0.030. The developer’s average advantage shrinks from +0.026 to +0.011. Repeating the role did not selectively reduce the peer’s score enough to resolve the ranking.

## Individual repetitions

| Run | Peer → original | Peer → role repeated | Developer → original | Developer → role repeated |
| --- | ---: | ---: | ---: | ---: |
| 1 | 0.5675 | 0.5625 | 0.5650 | 0.5625 |
| 2 | 0.5650 | 0.5400 | 0.5800 | 0.5325 |
| 3 | 0.5250 | 0.5175 | 0.5650 | 0.5600 |
| 4 | 0.5150 | 0.5425 | 0.5925 | 0.5075 |
| 5 | 0.5725 | 0.5075 | 0.5725 | 0.5625 |

The developer ranks above the peer in 3/5 original-condition runs (one tie), and 2/5 role-repeated runs (one tie). This small exploratory sample is not a significance test or evidence that repeating a role generally worsens matching. It shows that the proposed addition did not reliably fix this particular case.

## Interpretation

- Both sides’ full texts are already shared with the model. There is no need to add that input path.
- The overlapping composer role is already explicit in the offers. Missing role information alone does not explain the behaviour.
- Stating an existing skill does not explicitly exclude collaboration with someone who shares it. Thus a decrease in peer support is a hypothesis, not a required response to this edit.
- A separate overlap penalty is not justified by this experiment. It could suppress explicitly wanted co-writing, peer learning or programmer partnerships. Before adding another metric, test whether the existing directional contribution metric can distinguish requested complementary work from requested peer collaboration.

No decision was made to remove fixture 4, change the allocation weight, or modify real participant inputs.

## Run the comparison

```sh
uv run match evaluate examples/role-context-event.json \
  examples/role-context-comparisons.json --include-drafts \
  --model jev-1.14.0 --output runs/role-context-next.json
```

Use a new output filename per run. The CLI’s draft pass/fail labels describe only the exploratory ordering encoded in the file; no human-judgement accuracy is reported. Inspect signed margins and component scores rather than counting these as validated successes.

Saved runs: `runs/role-context-v10-1.json` through `runs/role-context-v10-5.json`. Each contains full input, rubric and response snapshots. These generated runs remain local and ignored by Git.
