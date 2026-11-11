# One mixed-schedule comparison fixture

This is scripted, model-authored fiction for an exploratory comparison of
ordinary and short natural continuations. It contains no human submissions.
It is not a representative sample or an audience study. The accounts do not
hear or respond to the composer.

The first 64 accounts preserve the writing from the earlier fictional corpus
`runs/contribution-64-screen-v1-complete/contributions.json`. That source labelled
itself `complete-unreviewed`, with provenance `LLM-generated fiction`; its SHA-256
is `e3620faf9041607e97c225662367bf0ec181b13a0a44009a4fcd5d8efec9e87d`.
The remaining 36 accounts were authored in this coding chat without provider API
calls. The plan embeds all text, so the ignored historical run is not required.

This fixture deliberately retains disagreement and practical limits across
work, housing, care, transport, public services, culture and community activity.
The inherited accounts repeat some themes, especially rotas and care; this is
not evidence that those themes are proportionally important to a real audience.
Editorial checks covered provenance, distinct accounts, length and scheduling.
No independent artistic review or factual verification has been performed.

Each account has four cumulative snapshots, split at sentence boundaries:

| Phase                     | Availability                                               |
| ------------------------- | ---------------------------------------------------------- |
| First staggered writing   | 0–39.6 seconds; all 100 accounts are present by 40 seconds |
| Further staggered writing | 60–120 seconds                                             |
| Shared burst              | All 100 accounts update at 150 seconds                     |
| Later staggered writing   | 180–300 seconds                                            |
| Observation tail          | 300–330 seconds; no new input                              |

All accounts remain joined throughout. These are controlled stages of disclosure,
not measured typing rates. Every account's final snapshot preserves its complete
source text. Equal-length edits and deletion are covered by the separate software
load trial; this pair focuses on the timing and quality of natural continuations.

Preparation is offline:

```sh
mise exec -- pnpm natural-comparison --plan examples/natural-comparison/plan.json --out runs/natural-pair-new --prepare
```

See the [experiment guide](../../docs/live-scale-experiment.md) for the separate
budgeted run command, cost assumptions, evidence and follow-up criteria.
