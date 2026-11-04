# Eight-person composer experiment — 4 November 2026

## Decision

Neither local run meets the composition criteria. The candidate avoided a large
verbatim repetition, but did not improve speaking proportion or reliably preserve
the consequential differences in the source. Keep it as a comparison candidate;
do not replace the default composer instructions with it. Compare a cloud
composer before further Gemma-specific prompt tuning.

## Conditions and evidence

Both runs used all eight unchanged contributions in `examples/score.json`, in
the same five 20% slices. Only the composer generated. Both used local
`gemma4:12b-mlx`, `think: false`, 8192-token context, raw prefill and an effective
96-token request resource budget. The instructions were the controlled change.
No cloud calls were made.

| Run       | Journal                                          | Collective words | Mean participant words | Ratio  | Request finishes           |
| --------- | ------------------------------------------------ | ---------------- | ---------------------- | ------ | -------------------------- |
| Baseline  | `runs/composer-eight-baseline-2026-11-04.jsonl`  | 293              | 140.875                | 2.080× | EOS, EOS, budget, EOS, EOS |
| Candidate | `runs/composer-eight-candidate-2026-11-04.jsonl` | 292              | 140.875                | 2.073× | EOS, EOS, budget, EOS, EOS |

Both ended with five completed source steps and no outstanding attempts. All
ten request input snapshots verified against their recorded source offsets.
Both input fingerprints were
`e3a0ca228436429ce2bcfcb89cddf401ff80899c658d31022d5c53aba6a7254e`.
Full request evidence is saved beside each journal as `-audit.json`; these local
files remain ignored. The source score is fictional rehearsal material.

The baseline ran before the fixed-mode budget correction: its journal says
`maxOutputTokens: 256`, but the serial scheduler imposed 96. The candidate used
`runs/composer-candidate-96.json` and the same effective budget. The committed
local example configurations now state 96 explicitly. Fixed mode now honours
that configured budget; cloud candidates can allow reasoning headroom. The
historical journals were not modified.

These are one run per condition, not evidence of statistical improvement. Both
hit the resource ceiling on request 3, so neither establishes natural stopping
behaviour. Their excessive length and substantive failures are still observable.

## Assessment against available input

| Request | Baseline                                                                                                                                                                                           | Candidate                                                                                                                                                                                                                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, 20%  | Opens with information being held elsewhere. That is already too narrow: Rosa's admitted text describes direct control, while Alex refuses replacing care with family labour.                      | Adds a difference between people wanting clear tasks and people whose organising has failed. Its implication that a clearer job would have changed an outcome is stronger than Mo's available claim. Both underuse the actual contrast between direct control and being ignored. |
| 2, 40%  | Connects unpaid care, quiet group chats and power to change decisions, but expands to 80 new words.                                                                                                | Makes limited time the organising theme. That is grounded in parts of the input, but compresses different institutional and practical problems into availability.                                                                                                                |
| 3, 60%  | Repeats the opening and much of request 2 until the budget intervenes. Ben's inability to lose the day's pay and Mo's objection to use of their name are now available and do not change the text. | Develops time/participation again and reaches its budget. Rosa's specific delegation proposal becomes a vague boiler example; Mo's objection is not retained as an issue of consent.                                                                                             |
| 4, 80%  | Completes the repeated passage. Chris's explicit refusal of a volunteer bus, Ben's conditional participation fund and Alex's organising limit do not redirect it.                                  | Adds only a full stop. The same new constraints were present in this request but produce no substantive development.                                                                                                                                                             |
| 5, 100% | Develops bounded responsibility, which connects Nadia and Mo, but leaves the distinction between participating, delegating and authorising a position unresolved.                                  | Moves towards being informed rather than making choices. This risks turning constrained participation and demands for accountability into a preference to leave decisions to others. Alex's mother's own voice and Mo's right to decline association remain unrepresented.       |

Selection necessarily omits details. The failures above concern changed meaning
or a dominant framing that fails to accommodate important objections, not a
requirement to mention every person in every update. Neither run called on named
speakers or directly invited participants to respond. That narrow success does
not compensate for repetition, disproportion or flattened positions.

First saved text arrived approximately 13.0–23.8 s after each baseline request
and 10.1–16.7 s after each candidate request. These are journal-derived delays,
including saving overhead, not controlled provider latency measurements. The
model was not randomised or independently warmed between conditions. The
candidate's shorter delay is not evidence of a prompt speed improvement.

## Next experiment

Use the prepared Terra and Sol configurations with baseline and candidate
instructions, as described in the [procedure](composer-experiment.md) and
[model research](composer-models-2026-11-04.md). Their cloud continuation and
artistic quality have not been tested. No `OPENAI_API_KEY` or `.env` was available
in this checkout during this work, so no paid comparison was attempted.

Do not proceed to optimising synthetic participants on the strength of these
local results. Use targeted correction/refusal inputs after identifying a
composer that can handle the fixed score reasonably well, then rehearse with
actual people.

## Software verification

`mise exec -- pnpm run verify` passed: Biome, TypeScript, all 389 tests across
22 files, and the production build. Added coverage includes source visibility
during concurrent arrival, incomplete fixed scores, uncertain prompt evidence,
Unicode offsets, recovery, offline CLI privacy, all-eight fixed scheduling,
explicit reasoning configuration and old/new serial budgets on resume. The
compiled CLI help and local Markdown links were also checked. These checks
establish the covered software behaviour, not artistic quality.
