# Delivery comparison — frozen development protocol

## Question and hypothesis

Does native steering admit new source material sooner while preserving an exact,
coherent collective continuation? Compare it with the current cancellation rule
and natural completion. Availability and acknowledgement alone do not show that
the source influenced the writing. Neither does a fixed-source probe establish
how a participant experiences the exchange.

Reuse Chris, Rosa, Alex and Mo from the original score without changing their
words. Supply their first 80% initially and reveal the final 20% as one update.
This gives the initial response more speaking space than the timed baseline's
20% instalments. It is a controlled boundary probe, not a directly comparable
repetition of the five-step baseline. Keep that existing adapter run as a
compatibility reference.

## Conditions and controls

Use Terra, reasoning `none`, 4,096 output tokens per response, a 120,000 ms pair
timeout and a 2,000 ms refresh guard. Use the Responses WebSocket transport for
all three policies. Keep source packets, instructions and model settings equal.
The shared instructions retain the live composer's artistic instructions and
replace only its request-specific begin/continue tail with one stable rule that
works across inherited conversation history. Saved output is always exact.

Run one trajectory per policy and arrival phase: nine pairs, at most eighteen
responses. Rotate policy order across phases as frozen in the manifest. Each
trajectory begins independently; its second response continues its own writing.

- **Before output:** reveal the update on the initial `response.created` event.
- **During output:** reveal it on the first non-empty text delta.
- **After completion:** reveal it on the initial terminal event.
- **Natural completion:** queue the update and create the successor after the
  initial response finishes, with its response ID as conversation history.
- **Current cancellation rule:** wait until 2,000 ms after the first text delta
  and require an available update. If still active, close the connection and
  replay the exact accepted assistant prefix with the update on a new connection.
  Closing a connection is client cancellation, not proof server computation
  stopped. If already complete, create a normal successor.
- **Native steering:** send one `response.steer` event and await its automatic
  successor. Do not create an additional successor after acceptance.

OpenAI documents steering as taking effect at output-item boundaries, with an
automatic successor inheriting settings. It is not documented as changing
already-generated tokens. Record item and response boundaries to test the actual
behaviour. Unsupported steering is a recorded outcome; do not silently fall back.
See the [steering guide](https://developers.openai.com/api/docs/guides/steering)
and [WebSocket guide](https://developers.openai.com/api/docs/guides/websocket-mode).

## Measurement and assessment

Before paid calls, save this protocol, exact inputs, source offsets, configuration,
order and SHA-256 fingerprints. Append safe events with elapsed milliseconds,
source arrival, update dispatch, acknowledgement, output items, exact text deltas,
terminal status and usage. This experiment publishes deltas immediately to its
saved output stream; it has no browser display or separate 500 ms publication
timer. Do not compare these publication times directly with the timed baseline.
Timings are application-observed and include local durable trace writes and
connection setup. They are not measurements of provider computation alone.
Save raw provider deltas without adding a separator between responses. The
existing live adapter can insert a space after natural completion; this probe
does not. Classify a missing boundary space separately from a broken thought or
unfinished-word continuation, and do not attribute that formatting difference
to a delivery policy. Never repair the saved writing retrospectively.

Inspect complete anonymised trajectories against the sources. Check exact joins,
repetition, coherence and whether distinctive experiences remain available in the
collective thought. For each update, identify a supported source-to-output link,
or record no observable uptake. Do not require a particular individual's final
20% to appear. An omission is not automatically a failure or evidence of being
unrepresented. Report both machine timing and inspected semantic relationships.

Prefer fewer consequential distortions and join failures, then lower observed
uptake delay, then cost. Treat differences smaller than both 20% and one second
as inconclusive. One pair per condition is a development screen, not statistical
evidence. Repeat a promising combination on fresh exchanges in confirmation.
If the short streams do not trigger cancellation, report that limitation; do
not claim cancellation has been compared merely because the policy was selected.

## Accounting, verification and advancement

Reserve both responses before connecting, including the entire output allowance
of each automatic continuation. The ledger contains one accounting entry per
pair: an 8,192-token combined output ceiling, two copies of the initial prompt,
the update, and 4,096 additional input-token allowance for reused initial output.
Actual provider requests retain their 4,096-token ceilings. Settle only if both
responses provide valid usage; otherwise retain the full pair reservation. Trace
each response's available usage independently. No retries or reconnection except
the explicitly measured cancellation restart. Stop on generic failures; skip
further native conditions if steering is unsupported.

The slice cap is US$0.80 within the shared US$5 ledger. Run focused double tests
for phase order, future-source exclusion, cancellation races, exact prefixes,
automatic successor limits, unsupported steering, errors and idle timeouts.
Run `mise exec -- pnpm run verify` before paid trials.

Run with `mise exec -- node --env-file-if-exists=.env src/delivery-experiment.ts`.
An optional previous-attempt path links a new attempt. Files remain under ignored
`runs/composer-pilot/delivery-<uuid>/`. Keep every failed trace and reservation.
Advance after inspecting all outcomes and recording findings, including any
unsupported mechanism or inconclusive comparison. Do not modify browser delivery
on this development screen alone.
