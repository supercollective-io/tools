# Focused delivery findings — 4 November 2026

## Decision

**Short natural openings are the useful result; native steering adds no
consistent advantage in this comparison.** Prefer a short naturally completed
thought as the next delivery design to develop. Keep the browser unchanged:
this experiment establishes an earlier first boundary, not the quality or
reliability of repeated short turns throughout a live performance.

The focused investigation is complete. Twelve pairs, 24 responses, all completed
with exact saved joins and inspectable source relationships. Under natural
completion, requesting a short opening brought successor text forward by
1.854–2.267 seconds (54–67%) in all three cases. Complete trajectories contained
similar amounts of writing, so this was not achieved simply by speaking less.
No new cancellation implementation is justified: the preceding screen's actual
cancellations had coherent joins, and this follow-up found a simpler way to
reach an earlier natural boundary.

Representation work remains paused. Its next study will address larger sets of
participant accounts without initially imposing live deadlines or compression
gates, as recorded in the [revised pilot](composer-pilot.md).

## Design and verification

Implementation: `039c9b5`. The [frozen protocol](composer-boundary-protocol.md)
crossed a short opening (one sentence, about 20–30 words) with an ordinary opening
(about 110 words), and natural completion with native steering. The successor
in every cell received the same instruction to finish approximately 140 words
across the complete pair. The initial system instruction and source packets
were unchanged across cells. All used Terra, reasoning `none`, a 4,096-token
ceiling per response and the common Responses WebSocket transport.

The update arrived at the first non-empty delta. Before-output and after-output
arrivals had already been tested in the [earlier delivery screen](composer-delivery-findings-2026-11-04.md).
The four original services voices supplied development material. All four cells
met the frozen advancement gate: supported steering, distinct realised opening
lengths, completed pairs, and no consequential grounding or join failure. Two
fresh fictional four-person scores then repeated all four cells without prompt
changes. Their order was fixed, with the first confirmation case reversed.

Full verification passed: 443 tests across 30 files, formatting/lint,
typechecking and build. New tests cover equal source packets and successor
instructions, the shared speaking allowance, frozen conditions, fresh-case
ordering and exact future-source exclusion. Existing transport tests still
cover cancellation races, unsupported steering, provider failures and exact
prefix continuation. No browser, journal or model-selection behaviour changed.

## All paired outcomes

Times are milliseconds from source arrival. The gap is the last opening delta
to the first successor delta. These are application-observed events, including
trace writes and connection handling, not isolated provider-computation times.
The experiment publishes deltas immediately; it does not measure browser or
audio playback pacing.

| Case                     | Opening  | Delivery   | Opening / total words | Supplied | Successor text |   Gap |
| ------------------------ | -------- | ---------- | --------------------: | -------: | -------------: | ----: |
| Services, development    | Ordinary | Completion |             108 / 140 |    2,426 |          3,370 | 1,044 |
| Services, development    | Short    | Completion |              25 / 145 |      477 |          1,103 |   649 |
| Services, development    | Ordinary | Steering   |             111 / 148 |       12 |          2,698 |   788 |
| Services, development    | Short    | Steering   |              29 / 156 |       20 |          1,443 | 1,042 |
| Courtyard laundry, fresh | Ordinary | Completion |             114 / 142 |    2,446 |          3,194 |   821 |
| Courtyard laundry, fresh | Short    | Completion |              25 / 140 |      575 |          1,338 |   892 |
| Courtyard laundry, fresh | Ordinary | Steering   |             107 / 135 |       17 |          2,745 | 1,134 |
| Courtyard laundry, fresh | Short    | Steering   |              23 / 152 |       11 |          2,645 | 2,086 |
| Summer nights, fresh     | Ordinary | Completion |             119 / 153 |    2,692 |          3,405 |   782 |
| Summer nights, fresh     | Short    | Completion |              29 / 154 |      727 |          1,551 |   881 |
| Summer nights, fresh     | Ordinary | Steering   |             118 / 154 |       18 |          3,298 |   855 |
| Summer nights, fresh     | Short    | Steering   |              26 / 146 |       12 |          1,451 |   709 |

All six short openings were single complete sentences of 23–29 words. Ordinary
openings contained 107–119 words. Total trajectories ranged from 135 to 156
words; none of the short conditions obtained its apparent advantage through
over 20% less total writing than its paired ordinary condition.

Steering supplied updates within 11–20 ms and acknowledged them within 49–71 ms.
Every response nevertheless completed normally with one output item; this
includes successors containing several sentences or paragraphs. No response
ended `incomplete/steered`. Prompting for a shorter opening shortened the item;
punctuation did not become an independent provider checkpoint.

With ordinary openings, steering's successor advantage was 107–672 ms and under
20% in every case: inconclusive under the protocol. With short openings,
steering was 340 ms slower for services, 1,307 ms slower for laundry, and 100 ms
faster for summer nights. The laundry pause remains in the results. Three
cases cannot establish its cause or a general provider latency distribution.
There is no consistent transport advantage to justify extra integration work.

## Source-level inspection and model review

The primary inspection found coherent exact joins in every pair, with leading
spaces preserved. All complete trajectories remained grounded in the available
source. Short openings left more room for subsequent development; their longer
successors sometimes approached a catalogue of concerns. Summer-night short
completion repeated the fan/noise tension later in the passage. These are
artistic limitations, not transport failures or reasons to erase the run.

The services writing distinguishes service accountability from responsibilities
inside a co-op, and later uses understandable figures, meeting access, anger or
care recipients speaking directly. Laundry writing retains time pressure,
awkward steps, sagging lines and the trade-off with plants; later passages use
the sunny end, recovered pegs or the old sheet stitching. Summer-night writing
preserves differing responses to heat and noise; later passages use discoveries
about a lamp, sleep after moving a fan, or moving a bed away from a fridge.
Some later details, such as a child's offer to swap rooms, do not appear.
Selective omission is not an automatic failure.

For each trajectory the primary review selected a grounded relationship to
newly available source and located the delta that completed the output phrase.
All twelve have an observed link. These are inspected relationships, not proof
of causal influence; the selected phrases are not identical semantic targets.

| Case                                                   | Ordinary completion | Short completion | Ordinary steering | Short steering |
| ------------------------------------------------------ | ------------------: | ---------------: | ----------------: | -------------: |
| Services: figures that can be questioned               |            3,437 ms |         1,279 ms |          2,726 ms |       1,533 ms |
| Laundry: using the sunny end for a towel               |            3,593 ms |         1,843 ms |          3,145 ms |       3,599 ms |
| Summer: later practical discoveries, different details |            4,119 ms |         2,301 ms |          3,581 ms |       1,930 ms |

Earlier successor text therefore did not always mean earlier use of the
inspected detail: short laundry steering reached the towel phrase later than
ordinary steering. Source links, exact quote offsets and phrase-completion times
are saved separately from the automatic availability measurements.

A Luna subagent assessed all twelve anonymised trajectories, with policies and
timings hidden. Passage length remained visible. It rated representation clear
in all twelve and conversational development clear in eight, mixed in four;
it found no consequential distortion or join failure. These are external model
assessments of fixed accounts, not responsive participants' reports. The primary
review checked them against complete sources and writing rather than adopting
the labels as an objective score. It corrected a claim that two laundry mix-up
examples were explicitly present where the output only referred generally to
mixed-up washing; it also distinguished already available examples from new
material. The original assessment remains unchanged alongside those notes.

There is also a broad collective formulation, “hundreds of us”, in ordinary
services steering, grounded in the petition's hundreds of signatories. This
must not be interpreted as evidence that all four fictional speakers signed it.
The evidence supports a provisional delivery choice, not universal individual
recognition or a demonstrated experience of conversation. Responsive participant
rounds remain useful for those questions, including the planned offline
representation study.

## Saved evidence and cost

All experimental writing remains in ignored `runs/`:

- Development: `runs/composer-pilot/boundary-1144f259-65b1-46e5-aa9a-41bc4663edfd/`.
- Laundry confirmation: `runs/composer-pilot/boundary-799a3553-deeb-46bb-ac10-94bb3bc10b31/`.
- Summer confirmation: `runs/composer-pilot/boundary-4b9522da-ccd8-47a0-84d4-8bed41b83f06/`.
- Anonymised assessment, blinding key, primary notes and accounting checks:
  `runs/composer-pilot/boundary-review-2026-11-04/`.

Each attempt contains frozen configuration, protocol, condition inputs and
fingerprints; append-only event traces; exact outcomes; `measurement-check.json`;
and `source-links.json`. The development directory also records the advancement
check. All fingerprints, initial source exclusion, exact output reconstruction,
24 terminal usage reports and 24 single-item completions were reconciled.
No failed or interrupted condition was removed; none occurred in this slice.

| Case          | Input tokens | Output tokens | Accounted API cost |
| ------------- | -----------: | ------------: | -----------------: |
| Services      |       17,208 |           690 |        US$0.020658 |
| Laundry       |       16,875 |           682 |        US$0.020285 |
| Summer nights |       16,634 |           715 |        US$0.020209 |
| Total         |       50,717 |         2,087 |    **US$0.061152** |

All usage was available, so no new reservation remains unresolved. Overall pilot
accounting is **US$0.3579554**, leaving **US$4.6420446** of the authorised US$5.
That total retains unknown cancellation and token-count reservations from earlier
slices. Subscription-backed fixture/review agents are separate from paid API
usage and measured delivery latency.

## What remains deliberately unimplemented

This ends the focused comparison with a useful, bounded result. A future live
integration should test repeated short thoughts, source coalescing while an item
is active, total speaking space and accumulated pauses with responsive
participants. It must preserve existing saved prefixes and avoid starvation.
The present two-response experiment does not establish those properties.

Keep sentence-boundary cancellation deferred until interrupted joins actually
suffer while natural completion is too slow. Structured Outputs may improve
parsing but has not demonstrated more frequent provider checkpoints. An explicit
`emit_passage` tool with new source returned in its result is a separate promising
architecture if more reliable checkpoints are needed; it needs its own lifecycle,
cost and continuity comparison. Neither mechanism was tested in this slice.
