# Timed baseline — frozen development protocol

## Question

Can we trace a timed change in source material through arrival, supplied context,
streamed writing and publication in the current composer? This first slice
establishes trustworthy measurement, not superiority of a delivery architecture.

Use Chris, Rosa, Alex and Mo from the original `examples/score.json`, with their
text unchanged. Four voices suffice for this measurement slice and reduce input
cost. They retain contrasting experiences of public services, self-organisation,
care and collective participation. This is a deliberate subset, not a claim
about coverage of all eight people or larger-scale capacity. The timed fixture
`examples/composer-timed.json` contains exactly the same five 20% source slices,
revealed at 0, 4,000, 8,000, 12,000 and 16,000 ms. Each reveal preserves original
voice order and Unicode code-point boundaries. Test that concatenating each
voice's events reproduces its original text and that each slice matches the
fixed experiment. Selected source text and baseline instructions remain constant; the
intervention is timed availability in the existing continuous scheduler. This
subset is not directly equivalent to the previous eight-person model screen.

The separate `examples/composer-belonging-unused.json` is unused material for a
later generalisation test, not this baseline. It was drafted before the creator
asked to retain the original text for comparability; no model trial used it.

Changes in the original score are traceable possibilities, not required output
phrases or individual replies. Keep assessment notes outside prompts.

## Implementation and controls

Use the existing live composer, its instructions and cancellation scheduler.
Feed deterministic participant source streams instead of calling participant
models. Their private fixture markers must not reach the composer. Freeze the
fixture and configuration with SHA-256 fingerprints before dispatch. Record
scheduled and observed arrivals, request context, exact output fragments and
publication times. Keep the legacy live journal unchanged; extra experiment
measurements live in an adjacent append-only file.

Use Terra with reasoning `none`, the same 4,096-token output ceiling and
120,000 ms request timeout as the screen. Run for 24,000 ms, with 2,000 ms refresh and 500 ms publication
intervals. Cap composer dispatches at six and this slice's total reservations
at US$0.25 inside the shared US$5 ledger. One real development run is sufficient
to inspect the measurement chain. Do not infer comparative latency from it.

## Verification and advancement

Run with `mise exec -- node --env-file-if-exists=.env src/timed-replay.ts`.
It creates a new ignored `runs/composer-pilot/timed-<uuid>/` attempt containing
the frozen protocol and inputs, a legacy live journal, an experiment trace and
a composer audit. An optional previous-attempt path links a replacement without
resuming or overwriting it. The usage ledger remains shared across attempts.

Test deterministic equal-time event ordering, no future-source leakage, exact
source-prefix continuation through refresh, cancellation during delivery,
private-context exclusion and inspectability of failure/interruption. Run full
verification before the real trial.

Inspect every source event and request, including non-uptake and any failure.
Identify at least one exact source-to-output relationship if it occurs; do not
invent one or treat provider acknowledgement as semantic influence. Record
whether output was subsequently published. The existing Chat adapter does not
expose native steering acknowledgement or item boundaries: mark those
unobserved rather than estimating them.

Advance when timestamps, offsets, supplied contexts and saved prefixes reconcile
and the attempt is inspectable. If no later material appears, record that
outcome; it is not automatically an artistic failure. Investigate a measurement
fault before beginning the delivery comparison. Use responsive AI-participant
assessment later to evaluate the two experiential goals.
