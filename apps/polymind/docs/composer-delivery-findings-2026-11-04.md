# Delivery comparison findings — 4 November 2026

## Decision

Native steering worked, but this screen does not establish a better delivery
policy. It accepted source updates while a response was active, then completed
the current output item and generated a successor. It did not demonstrate
continuous revision within the current sentence. Both actual cancellations
preserved coherent joins. Retain the browser's existing behaviour and use
natural completion as the fixed delivery control for the representation slices.
This is a choice of a simple experimental control, not a recommendation to
replace the browser scheduler.

Sentence-boundary cancellation is not justified by these outcomes: the observed
cancellations did not damage the joins. Keep it deferred unless a later exchange
exposes that problem alongside an unacceptable completion delay.

## Evidence and controls

Implementation commit: `e99038a`. Full verification passed: 421 tests in 27 files,
typechecking, formatting/lint checks and build. The
[frozen protocol](composer-delivery-protocol.md) describes the development screen.

Saved attempt:
`runs/composer-pilot/delivery-68311779-952e-4bc9-b017-0a549882271c/`.
Its `frozen-inputs.json` contains configuration, source spans, instructions,
protocol, condition order and fingerprints. Each condition has an append-only
JSONL event trace; `outcomes.json` contains all nine exact trajectories.
`measurement-check.json` reconciles response boundaries, text and timings.
The anonymised review and separate blinding key remain alongside the attempt.
These files contain experimental writing and remain ignored.

All nine pairs completed. Eighteen responses were created, with sixteen terminal
usage reports and two client cancellations whose server-side usage is unknown.
No retry, fallback or extra automatic continuation occurred. All concatenated
saved deltas match returned writing. Both cancellation prefixes match the exact
first response fragment, including the unfinished sentence. Arrival preceded
update dispatch in all conditions. All native updates were acknowledged, with
one automatic successor each. The initial native responses ended `completed`,
not `incomplete/steered`, after their output items finished.

The four voices are Chris, Rosa, Alex and Mo, unchanged from the original score.
Every condition received the same initial 80% and final 20%, Terra with reasoning
`none`, the same shared instructions and a 4,096-token ceiling per response.
Each pair continued its own generated writing. This is not the five-step timed
baseline repeated on a different transport: its longer initial source packet
was chosen to expose active-stream boundaries.

## All paired outcomes

Times below are milliseconds after the final source instalment arrived. The
first column measures when the client supplied the update. The next measures
the first text of the successor response; it does **not** establish semantic
influence. Application timings include local trace writes and connection setup.

| Arrival phase    | Policy                    | Arrived → supplied | Arrived → successor text | Actual cancellation | Collective words |
| ---------------- | ------------------------- | -----------------: | -----------------------: | ------------------- | ---------------: |
| Before output    | Natural completion        |              5,160 |                    5,906 | No                  |              157 |
| Before output    | Current cancellation rule |              3,468 |                    4,537 | Yes                 |              136 |
| Before output    | Native steering           |                  5 |                    3,685 | No                  |              142 |
| During output    | Natural completion        |              2,201 |                    2,867 | No                  |              145 |
| During output    | Current cancellation rule |              2,259 |                    3,544 | Yes                 |              147 |
| During output    | Native steering           |                 13 |                    3,305 | No                  |              146 |
| After completion | Natural completion        |                  5 |                    1,046 | No                  |              137 |
| After completion | Current cancellation rule |                  5 |                      829 | No                  |              140 |
| After completion | Native steering           |                  5 |                      773 | No                  |              142 |

Native acknowledgements followed arrival by 77, 94 and 51 ms respectively.
The before-output condition showed a faster successor under steering than
natural completion. During-output steering was slower by 438 ms, about 15%,
which falls inside the protocol's inconclusive range. Provider and initial-text
variation is substantial, and there is only one pair per cell. These observations
do not support a general latency ranking.

The cancellation guard actually fired twice, approximately 2,000 ms after the
first accepted text. Reconnection added 302 and 247 ms before update dispatch.
The after-completion cancellation condition correctly took the ordinary follow-up
path. It is not evidence about interrupting an active response.

## Source-level inspection

The primary review found coherent development across all nine pairs and no
consequential invented personal circumstances. The first additions connect
imposed service cuts with the difficulties of making decisions inside a co-op,
and distinguish a manageable task from taking on organising or unpaid care.
Several passages remain broad and procedural. This is evidence about possible
representation and conversation from fixed scripts; responsive participants
still need to assess their own experience in confirmation.

Later material appears in each successor. Eight trajectories explicitly refer
to anger, grounded in Chris's final instalment. The remaining trajectory,
before-output cancellation, refers to hearing directly from people receiving
care, grounded in Alex's final instalment. These are inspected textual
relationships, not proof that a particular source caused each phrase or that
every participant felt heard. Omitting Chris's anger in that trajectory is not
an artistic failure.

For example, before-output cancellation saved a prefix ending `Supporting one`
and continued with ` thing doesn't mean agreeing to everything.` During-output
cancellation ended `support everything else` and continued with `. We need
figures…`. Both joins preserved the developing thought without rewriting any
saved text. No boundary space was inserted by the experiment and no saved output
was repaired afterwards.

A Luna subagent assessed all nine anonymised trajectories. Its useful shared
observation was that later material often becomes a general closing cluster of
participation conditions. Primary source verification rejected several claims:
it described two ordinary request boundaries as audible seams without audio
evidence, overlooked work/care and outcome references already present, and
attributed Mo's request for follow-up to Chris. The unchanged model assessment
and explicit corrections are saved in `anonymous-review/model-assessment.json`
and `anonymous-review/primary-notes.json`. Model ratings do not establish
participant recognition or override the saved writing.

The inspected later phrases became complete between 1,200 and 6,524 ms after
arrival. Exact phrases, source IDs and timings are in `measurement-check.json`.
They refer to different portions of the writing and must not be treated as a
uniform correction-latency score. No unsuccessful pair or missing usage report
was excluded from the outcome table.

## Cost and next step

Known usage from sixteen completed responses costs **US$0.041912**. The shared
ledger conservatively accounts **US$0.168184** for this slice: seven fully known
pairs cost US$0.036062, and two cancelled pairs retain their full US$0.066061
reservations each. The known successor usage in those cancelled pairs is already
covered by those reservations; it is not charged twice in the ledger.

Total pilot accounting is **US$0.2348185**, leaving **US$4.7651815** of the US$5
allowance. Unknown cancellation usage remains reserved.

Proceed to attributed extraction with natural completion held constant. Compare
representation methods against identical collective prefixes. Revisit delivery
with fresh responsive exchanges in combined confirmation; do not interpret this
small fixed-source screen as a participant-experience or capacity study.
