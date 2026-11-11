# Delivery boundaries — frozen focused protocol

## Question

Does a shorter natural opening create an earlier useful opportunity for new
material without damaging the developing thought? Does native steering add
anything beyond that earlier boundary? This is an active-arrival, two-response
probe, not a sustained scheduler or participant-experience study.

The previous comparison covered arrival before output, during output and after
completion, including two coherent cancellation joins. Keep those outcomes as
references. Do not spend more calls repeating those phases or introduce a
sentence-cancellation implementation without evidence of the problem it solves.

## Controlled comparison

Cross opening granularity (one complete sentence of about 20–30 words; an
ordinary connected passage of about 110 words) with delivery (natural completion;
native steering). Four pairs, eight responses per case. In each condition reveal
the identical final 20% of four participant texts at the first non-empty delta.
Both arms request approximately 140 collective words across the pair. The
successor receives the identical instruction to use the remaining allowance.
This holds requested overall speaking opportunity constant; inspect actual word
counts because prompting cannot enforce exact lengths. Do not truncate or repair
writing to make counts match. The small opening is an intervention on the first
boundary only; the successor can be longer.

Use existing four-person services material for development. If all four cells
complete with supported steering, distinct realised opening lengths (short at
most 40 words; regular at least 70), and no consequential join or grounding
failure, repeat all four cells on each of two fresh fixed scores in
`examples/composer-delivery-confirmation.json`. Otherwise record the failed gate
and finish this screen without claiming confirmation. No selection of only good
outputs, repeated tuning or replacement cases. Before confirmation freeze its
manifest, protocol and unchanged model/prompt settings. The fresh cases are
fixed author-written accounts, not responsive AI participants.

The order for development and the second confirmation case is regular/completion,
short/steering, short/completion, regular/steering. Reverse this order for the
first confirmation case. This balances some order effects; it is not randomised
or sufficient to estimate provider variation. Each pair starts independently
and continues its own exact saved output. Sources, common instructions and
successor task are identical between its four cells. Source availability uses
exact UTF-16 offsets; no unrevealed suffix enters the initial request.

Terra, reasoning `none`, 4,096 output tokens per response, 120,000 ms pair timeout,
Responses WebSocket for every condition. Preserve the existing tested driver,
provider item/response events, exact deltas, and cancellation compatibility.
No browser changes, reader calls, retries or fallback. Natural completion sends
the source at terminal; steering sends at arrival and awaits its one automatic
successor. Settings and output allowance apply separately to both responses.

## Measures and interpretation

Freeze protocol, source/prompt/configuration fingerprints and condition order
before dispatch. Keep this assessment key out of model inputs. Save arrival,
supplied, acknowledgement, item and response boundaries, terminal reasons,
usage and exact writing. Saved deltas are immediate experimental publication;
there is no browser publication timer. Record application-observed timings,
including trace persistence, separately from any reviewer work.

For every condition report opening and total words; arrival-to-supplied;
arrival-to-successor first text; last opening delta to first successor delta
(the output gap); total duration; item counts and usage. Missing events and
failed conditions remain null/unavailable, not zero or excluded. Trace checks
must reconcile exact output, boundaries and source chronology. Acknowledgement
and first successor text are availability measures, not semantic uptake.

Inspect complete anonymised writing against the initial and newly available
sources. Record joins, repetition, concrete grounding, meaningful differences,
and later source-to-output relationships with exact phrases and offsets.
For a relationship, time the first delta at which the inspected phrase is
complete; record no observable uptake where no relationship is found. Different
phrases are not interchangeable semantic latency targets. No mandatory uptake
of an individual's correction, refusal or change of mind. Distinguish a missing
boundary space from a broken thought. Never retrospectively repair output.

Assess each dimension as clear/mixed/weak with evidence, not an aggregate score.
Prefer fewer consequential distortions and join failures, then earlier useful
uptake, then cost. Differences smaller than both 20% and one second remain
inconclusive. Report variability across cases and realised lengths. Three
cases with one pair per cell cannot establish a general latency ranking,
statistical significance or the participant experience. Do not promote shorter
openings if their apparent advantage depends on substantially less total writing
(over 20% fewer words within a matched policy/case) or repeated loss of useful
source distinctions. In that event describe the trade-off, not a winner.

## Budget and completion

Use the shared `runs/composer-pilot/usage.jsonl`: US$5 cumulative, US$0.80 for
`delivery-boundaries`. Each pair reserves both 4,096-token output ceilings,
reused prompt and possible previous output before dispatch; unknown usage stays
reserved. Record actual usage and conservative reservations separately. All
three cases are at most 24 responses; no extra repetition is planned.

Run focused tests and `mise exec -- pnpm run verify` before real calls.
Development command:
`mise exec -- node --env-file-if-exists=.env src/delivery-experiment.ts boundary services`.
Confirmation replaces `services` with a fixture ID and supplies the development
attempt as the next argument. Each attempt gets a new directory. Save an
anonymised model review and an independent primary source check, then commit
findings. Close the focused investigation with a recommendation and explicit
limits; production integration and long-running responsive trials are separate.

## Alternatives retained for later

Structured Outputs constrains response shape; an array element or a field named
`sentence` is not a provider output-item boundary or a grammatical guarantee.
It could simplify parsing and publication, but does not by itself let new input
affect generation sooner. Compare it only if application parsing needs justify
the added format and token overhead. See [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

An explicit `emit_passage(text)` tool call could publish a passage and receive
new source in its tool result. This would create an application-controlled
context checkpoint, requiring tool lifecycle, source coalescing, call budgets,
exact text publication and failure recovery. It is promising if natural short
completions remain too variable or lack useful checkpoints. Test it as its own
slice rather than mixing schema, prompting and transport changes here.

Native steering finishes its current output item before continuation; neither
formatting nor punctuation is documented as forcing a new provider item.
See [steering semantics](https://developers.openai.com/api/docs/guides/steering).
