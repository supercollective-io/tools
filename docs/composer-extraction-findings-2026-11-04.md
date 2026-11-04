# Attributed extraction findings — 4 November 2026

## Decision

Keep full text as the reference. This typed packet does not qualify as a
compression improvement at the tested four-person scale: it increases composer
input, adds 12–18 seconds of reader preparation, and fails one of three input
contracts. Its successful compositions remain coherent and source-grounded, so
this is not evidence that typed evidence cannot support the intended experience.
It is evidence against this particular extract-and-repeat packet format.

The rotating-excerpt control also increases input. At these short snapshots,
repeated sentence-level references cost more than sending each original source
once. All three full-source packets already fit within 800 tokens. This screen
does not establish behaviour under the compression pressure of longer histories
or more voices.

## Run and verification

Implementation commit: `a3a0027`. Full verification passed: 433 tests in 29 files,
typechecking, Biome checks and build. See the
[frozen protocol](composer-extraction-protocol.md).

Saved attempt:
`runs/composer-pilot/extraction-a599e3c7-fc04-45d1-9c8a-f678b152001e/`.
The manifest freezes three snapshots, configuration, protocol and fingerprints.
Per-condition JSONL files preserve requests, reader/composer deltas, all extracted
records, packets, omitted/deferred spans, provider token counts and outcomes.
`measurement-check.json` verifies exact prefixes, visible-source quotation spans
and accounting. The anonymised model review and primary corrections are retained.
Experimental text remains ignored.

Eight composer responses completed. The ninth condition stopped before
composition because its reader returned 31 records against a maximum of 24.
All 31 quotes were separately inspected offline and bound exactly and uniquely
to available source text; the failure was the record-count contract, not invented
quotations. The failed output was not truncated, repaired or sent to the composer.
Three reader calls and eight token-count calls were made, without retries.

The two successful typed extractions produced 19 and 22 records. Their selected
packets contained 19 records each. Every retained quotation matched exact UTF-16
offsets within the available source prefix. No reader or composer input included
future source text. Ari's incomplete `wel` was not completed by the extraction
or the resulting unfinished-snapshot composition.

## All controlled outcomes

Composer input counts below are provider usage, including common instructions
and the identical frozen collective prefix for each snapshot. Packet counts
were separately verified with the provider's count endpoint. A failed condition
has no composer-token count; do not treat that as zero-cost composition.

| Snapshot              | Representation    | Packet tokens | Composer input tokens | Change against full input | Outcome                      |
| --------------------- | ----------------- | ------------: | --------------------: | ------------------------: | ---------------------------- |
| Services              | Full text         |           697 |                 1,193 |                 Reference | Completed                    |
| Services              | Rotating excerpts |           763 |                 1,259 |                     +5.5% | Completed                    |
| Services              | Typed evidence    |             — |                     — |                         — | Reader exceeded record limit |
| Belonging, unfinished | Full text         |           379 |                   856 |                 Reference | Completed                    |
| Belonging, unfinished | Rotating excerpts |           754 |                 1,231 |                    +43.8% | Completed                    |
| Belonging, unfinished | Typed evidence    |           683 |                 1,160 |                    +35.5% | Completed                    |
| Belonging, developed  | Full text         |           498 |                   975 |                 Reference | Completed                    |
| Belonging, developed  | Rotating excerpts |           761 |                 1,238 |                    +27.0% | Completed                    |
| Belonging, developed  | Typed evidence    |           734 |                 1,211 |                    +24.2% | Completed                    |

Median composer-input increase is 27.0% for rotating excerpts across three
snapshots and 29.9% for typed evidence across its two completed snapshots. These
are different denominators, not a three-case paired ranking. Neither meets the
25% reduction target. Including reader input makes typed processing more costly
still; no reader calls are omitted from the cost account.

Typed preparation took 12.1 and 17.7 seconds in the successful cases; the failed
reader took 16.2 seconds. Full packet construction took under 6 ms, and rotating
construction under 17 ms. Provider packet-count validation added 224–953 ms and
is recorded separately. These are observed application timings, not a benchmark
of model computation or a requirement to use remote counting in deployment.

## Extraction, selection and composition

**Extraction:** Exact quotes are a useful provenance guarantee, but do not prove
every generated interpretation is faithful. Several unfinished-snapshot records
assign feminine pronouns to Bea without source evidence. Those pronouns do not
appear in the collective output. Categories are also loose: a place that permits
staying without buying anything is labelled a condition, while other comparable
preferences are experiences or proposals. The labels need not become a fixed
ontology for the piece.

Both belonging extractions omit the explicit fact that Chen hears people speaking
their first language. They retain the room feeling different and not needing to
translate oneself. That loses a useful literal anchor and leaves a more abstract
interpretation available. It is an extraction loss, not merely an item rejected
by the packet budget. This matters when investigating whether a participant's
particular experience survives preprocessing; it does not automatically make
every composition that omits that detail an artistic failure.

**Selection:** The unfinished typed packet retains all 19 extracted records.
The developed packet defers three of 22: Ari's explicit welcoming description
and preference against square noise, and Bea's combined wish for anonymity and
recognisable home-town pronunciation. The waiting-driver detail was not extracted
in that snapshot, though it was extracted in the unfinished one. Sorting early evidence first can leave a revision
without the later detail that explains it. The old description and its correction
are visible, but selection has removed useful context. This is separate from
quotation validity. Graph relationships cannot recover text never extracted or
not selected.

**Composition:** All eight completed additions are brief and coherent. The full
services condition connects accountability with care cover and hearing the person
receiving care. Its rotating counterpart develops the concrete contrast between
changing a cleaning contract and struggling to allocate responsibility for a
boiler repair. In belonging, several conditions preserve the tension between
welcome through recognition and relief through anonymity. The developed typed
condition instead connects staying in a library without purchase or explanation
with choosing whether to talk. These different emphases are not themselves
evidence that an omitted participant feels excluded.

One full-text output joins the saved prefix as `home.A driver`. This is a missing
space at a raw response boundary, not a broken thought. The experiment preserved
it. The production live adapter already handles this natural-completion spacing
case; the screen does not establish a representation-specific join problem.

A Luna reviewer assessed anonymised outputs without seeing packet formats or
method labels. It found usable contrasts and concrete grounding across completed
conditions, with no clear experiential winner. Primary verification corrected
several source-attribution/quotation imprecisions and its occasional suggestion
of temporal uptake: each condition is one continuation from a source snapshot,
not a responsive exchange. Model observations are evidence to inspect, not
participant recognition. The next confirmation slice still needs responsive
AI participants and their individual assessments.

## Cost and follow-ups

Generation usage costs **US$0.0176114** at the pilot's uncached rates, including the
failed reader. Eight token-count calls retain **US$0.024484** of conservative
reservations because their billing treatment was not established. Total slice
accounting is **US$0.0420954**. The pilot now accounts **US$0.2769139**, leaving
**US$4.7230861** within the US$5 allowance.

Several engineering improvements remain plausible and untested:

- Return full text unchanged when it already fits the bounded-original control.
  This avoids sentence metadata that provides no capacity benefit here.
- Keep exact quotations in the audit while sending only concise generated claims
  and source references, or send typed quotations without redundant paraphrases.
  Compare those formats directly so fidelity losses are not mistaken for savings.
- Select fewer, more consequential units and retain the context of a revision.
  This needs a new frozen selection experiment and source-level inspection.
- Enforce the record count through structured output rather than relying on a
  prompt. That addresses the observed contract failure, not semantic fidelity.
- Test longer histories where the full source exceeds the packet allowance.
  Four short voices were sufficient for delivery measurement but are a limited
  compression stress case.

These refinements require additional implementation and controlled runs. Keep
them documented while completing the planned relationship and alternative
preprocessing slices; do not retrofit the failed outcome. The relationship slice
can use the two valid belonging extractions, selecting the same nodes for both
arms and reporting the unavailable services case. This tests an incremental
relationship effect without promoting typed extraction as the selected design.
