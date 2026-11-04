# Typed extraction — frozen development protocol

## Question and hypothesis

Can attributed typed evidence preserve distinctive experiences and useful
differences while reducing what the composer reads? The hypothesis is that
explicit attribution and source-grounded interpretation help the composer make
connections without flattening perspectives. Counter-hypotheses are that
extraction loses ambiguity, privileges administrative categories, or adds more
metadata than it saves. Treat a negative result as evidence, not a reason to
silently repair the outputs.

Compare full text, bounded rotating original excerpts, and typed evidence.
Hold natural completion, model settings, instructions, source availability and
the collective prefix constant within each case. Use the existing Chat adapter
for all conditions in this slice, with no arrival during a request. The preceding
delivery screen justified this simple control; absolute latency across these
two transports is not a controlled comparison.

## Cases and schedule

`examples/composer-representation.json` defines three development snapshots:

1. Chris, Rosa, Alex and Mo's complete original contributions. The fixed collective
   prefix is the first sentence of the delivery screen's before-output natural
   completion trajectory.
2. The unused fictional belonging exchange through 4,500 ms. Ari's final source
   ends at `wel`; exclude all later arrivals from reader and composer inputs.
3. The same belonging exchange through 9,500 ms, with the developing perspectives
   available. It is correlated with the preceding snapshot, not a third
   independent conversation.

Both belonging snapshots have the same short, authored collective prefix. This
is a controlled prior text, not a model result or an assessment answer. The
original score remains unchanged. The previously unused belonging fixture now
serves representation development; it remains distinct from the timed baseline.
Keep later confirmation exchanges fresh.

Run one composer response per representation and snapshot: nine responses.
Rotate the order of the three representations across cases. Each representation
continues the identical frozen prefix, rather than inheriting another condition's
output. Use Terra, reasoning `none`, 4,096 output tokens and a 120,000 ms timeout.
Use Luna with the same reasoning, ceiling and timeout for three reader calls,
one per snapshot. Luna's composer screen does not qualify it automatically as a
reader; inspect extraction independently of the resulting composition.

## Evidence and selection

The reader returns attributed experiences, proposals, conditions, refusals,
corrections, questions, images and uncertainties. Interpretations are explicitly
generated; quotes remain separate original text. Do not require exhaustive
coverage or elevate corrections above the performance's other material.

Resolve each unique exact quote to its source ID and UTF-16 offsets locally.
Reject invented, ambiguous or future-source quotations. Do not fix model output
silently. Assign deterministic IDs and sort by source and span. Keep all valid
extracted records for inspection, even when the packet omits them.

Select records in source-order rotation, retaining whole records under the
packet allowance. For rotating excerpts, use original sentence-like spans with
the same source rotation and rotate the starting sentence within each source
by the snapshot index. This bounded control must not always take the opening
sentences. Preserve incomplete final statements as fragments. Record
unextracted source spans as omissions and valid unselected records as deferred
material. Record both selection and extraction losses separately.
Keep the detailed omission/deferred audit in the saved sidecar. Send each quote
once with its source reference, including in the full-text control; duplicating
source text as provenance would artificially inflate the baseline.

Bounded packets have an **800-token allowance**, including their own metadata,
excluding common instructions and the collective prefix. Use a 760-token local
`o200k_base` selection ceiling to leave room for model-specific formatting, then
verify the packet with the provider's input-token count endpoint. If its count
exceeds 800, fail that condition before composition and preserve its packet.
Do not substitute a local estimate for the provider's count. Full text is an
unbounded control. See [OpenAI's token-counting guide](https://developers.openai.com/api/docs/guides/token-counting).

## Frozen assessment key

Keep this section and subsequent assessments out of reader and composer inputs.
For services, inspect differences between imposed cuts and co-op control, care
capacity and a manageable task, and limited campaign agreement. For belonging,
inspect being recognised versus being left unknown, silence versus language or
freedom from explanation, and ambiguous or changing feelings about a place.
At 4,500 ms, do not present Ari's unfinished `wel` as a completed claim. A later
source makes the word explicit; only the developed snapshot may use that text.

Evaluate four stages separately: extraction fidelity, selection losses,
composition, and practical cost. A valid quote does not prove its interpretation
is faithful. Inspect all records, omitted/deferred ranges and complete outputs.
Use an anonymised external model assessment, followed by primary verification
against source spans. Record model-review mistakes as well as composer mistakes.
Assess potential for representation and conversation under the
[performance criteria](composer-performance-assessment.md); do not turn selective
omission into a requirement that everyone receive an immediate reply.

Report actual composer prompt tokens and their median reduction against full
text, plus reader tokens, count requests, preparation latency and total costs.
The 25% reduction is an engineering target; a missed target does not erase
stronger experiential evidence. No representation advances as faithful if its
retained interpretation materially reverses a source distinction. Rank eligible
approaches by consequential distortions and omissions, then token reduction,
then preparation complexity. These snapshots are a screen, not statistical or
participant-experience equivalence.

## Verification, accounting and advancement

Test quote validity, exact offsets, deterministic ordering, future-source
exclusion, packet budgets including metadata, omission/deferred coverage, exact
saved prefixes and provider failures. Run full verification before real calls.
Freeze the protocol, cases, resolved sources, configuration and fingerprints in
a new ignored attempt before dispatch. Preserve streamed reader/composer text,
usage and failures. Reruns get new linked attempt directories.

Reserve all calls in the shared US$5 ledger, with a US$0.50 cumulative cap for
this slice. No retries. Token-count requests also receive conservative input
reservations plus one output token; they do not generate text. Because this
pilot does not establish their billing treatment, retain those reservations
instead of assuming they are free. Report them separately from generation usage.
The count endpoint's latency is validation overhead; also report preparation
without that validation so a deployment need not repeat it blindly.

Advance after inspecting every outcome and committing findings. The following
relationship slice must use the same selected evidence when adding edges, so an
effect cannot be attributed to selecting different nodes.
