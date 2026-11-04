# Composer architecture pilot

## Goal and method

Investigate architectures that support each participant feeling represented in
the collective and in conversation with it. The
[assessment amendment](composer-performance-assessment.md) records the creator's
clarifications and supersedes the original emphasis on explicit correction
after withdrawal. Responsive AI-participant rehearsals provide substantial
experiential evidence alongside controlled fixed-source comparisons. Human
rehearsal tests transfer to the audience.

Complete each vertical slice through implementation, automated verification,
bounded real calls, saved-outcome inspection and a findings commit. Keep failed
and interrupted outcomes. Later slices depend on the preceding findings; this
table is a work sequence, not a claim that those experiments have run.

| Slice                        | Status                               | Question and evidence                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Luna qualification           | Complete, provisional Terra retained | [50 responses, costs, paired outcomes and reassessment](composer-luna-results-2026-11-04.md). Fixed scripts show a grounding difference; they do not settle the participant experience.                            |
| Timed baseline               | Complete                             | [Five requests and reconciled measurements](composer-delivery-baseline-2026-11-04.md), using four original voices. No composer cancellation occurred in this run.                                                  |
| Delivery comparison          | Complete, no policy winner           | [Nine completed pairs, two actual cancellations and working native steering](composer-delivery-findings-2026-11-04.md). Natural completion is the fixed representation control; browser behaviour stays unchanged. |
| Typed evidence               | In progress                          | Full prefixes and bounded rotating excerpts as controls; attributed extraction with exact source spans. Evaluate experience, questions and uncertainty as well as proposals and refusals.                          |
| Supported relationships      | Pending                              | Identical selected evidence with and without supported relationship edges. Ordinary records; no graph database.                                                                                                    |
| Diverse excerpts             | Pending                              | Select varied original passages under the same packet allowance; retain original wording and provenance.                                                                                                           |
| Global summary               | Pending                              | A generated summary with source references and recorded omissions; assess whether shared themes erase distinctions.                                                                                                |
| Per-participant summaries    | Pending                              | Preserve distinct perspectives before combining them; assess cost and whether the composer makes connections rather than enumerating.                                                                              |
| Hierarchical issue synthesis | Pending                              | Group related material, then synthesise; assess the added reader cost, delay and interpretive losses.                                                                                                              |
| Combined confirmation        | Pending                              | Baseline versus the selected combination on fresh exchanges, including responsive AI participants and participant-level assessments. Include actual preparation delay and cost.                                    |

Implement each alternative preprocessing method only after completing the
preceding method's run and assessment. The five experimental packet approaches
are typed evidence, diverse excerpts, global summaries, participant summaries
and hierarchical synthesis. Rotating excerpts are a bounded control; relationship
edges are a separate intervention on the same evidence. Use an 800-token packet
allowance for bounded comparisons, with shared instructions and collective
prefixes outside it. Keep input sets identical where isolating a representation.

The initial plan made sentence-boundary cancellation conditional on damaged
joins alongside excessive completion delay. The delivery screen did not expose
that combination; it did expose waiting at output-item boundaries.

The creator also proposed more frequent output boundaries after the delivery
screen. That screen tested the existing passage length and does not settle
generation granularity. A focused follow-up can compare one short thought per
natural completion with ordinary passages, and sentence-boundary cancellation
when new context is pending. Compare native steering and ordinary completion
under identical short-output instructions to separate length effects from
transport effects. Measure useful uptake, pauses, continuity and cost at equal
total speaking space. The current API documentation exposes no punctuation-based
output-item boundary setting; a full stop in streamed text is not itself a
provider item boundary. Tool-based emission checkpoints are a more involved
alternative, requiring additional orchestration. These modifications remain
unimplemented and untested.

## Resource and evidence controls

The shared ledger is `runs/composer-pilot/usage.jsonl`, with a US$5 overall cap.
Reserve conservative input and the full output allowance before dispatch.
Retain reservations for failed or aborted requests without usable usage reports.
Reader calls, retries and automatic continuations count. Subscription-backed
research/review agents are separate from paid API latency and usage evidence.

Before each paid slice, freeze its cases, configuration, hypothesis and assessment
rule. Keep assessment material out of composer/reader inputs. Use separate
development and confirmation cases. Freeze source fingerprints and record exact
offsets, omitted material, preparation costs and interpretation versus quotation.
Use new linked attempts for reruns. Keep experimental writing in ignored `runs/`.

Source delivery, offsets and acknowledgements establish availability. A
source-to-output relationship requires inspection of the actual writing.
Preserve non-uptake as an observation rather than requiring each individual's
change to appear. Assess patterns of representation and conversational
possibility and investigate these with responsive participants.

## Deferred research

These are hypotheses and proposed engineering work, not validated benefits.
Revisit a method when the cheaper slices supply evidence for its added cost.

| Approach                             | Hypothesis and evidence basis                                                                                                                                                                                                                                   | Engineering work                                                                                                    | Revisit trigger                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Local decode-time input injection    | New source tokens might affect generation with less interruption. Existing request-boundary experiments cannot establish this.                                                                                                                                  | Own a local inference loop, insert context safely, handle attention/cache changes and benchmark exact continuation. | Measured boundary delays remain consequential after simpler delivery options; a suitable local model is available.  |
| Separate streams and cross-attention | A model trained to combine ongoing inputs could select material during generation. Architectural possibility, not demonstrated for this piece.                                                                                                                  | Model/runtime design, training data and evaluation of asynchronous inputs.                                          | Controlled experiments show a clear limitation that request-level steering cannot address.                          |
| Full-duplex audio                    | Listening and speaking concurrently might improve the felt exchange. Text replay does not test interruption, rhythm or overlapping speech.                                                                                                                      | Audio sessions, participant identity, transport timing and performance interface.                                   | Text-level findings justify an audio rehearsal and its costs.                                                       |
| Full GraphRAG                        | Entity/relationship indexing and hierarchical retrieval might retain useful connections over long histories. [Its documented pipeline](https://microsoft.github.io/graphrag/index/default_dataflow/) goes well beyond the small relationship intervention here. | Chunking, extraction, entity resolution, communities, reports, retrieval and update handling.                       | Simple evidence records lose useful long-range structure on actual long sessions.                                   |
| Embeddings and learned compression   | Semantic selection or learned packets might retain more useful material per token. Savings alone do not establish better representation or conversation.                                                                                                        | Embedding/model choice, indexes, source reconstruction and semantic-loss evaluation.                                | Simple selectors fail on varied material and preparation cost is justified.                                         |
| Model-directed retrieval             | The composer could request the material it needs instead of receiving a fixed packet. Its own selection could also amplify recurring omissions.                                                                                                                 | Retrieval tools, scheduling, bounded calls, provenance and latency accounting.                                      | Fixed packets repeatedly omit material needed by the developing thought.                                            |
| Alternative providers                | Another model or streaming interface might improve the experience or costs. Provider/model changes would confound the first delivery comparison.                                                                                                                | Explicit adapters, completion semantics, error handling, pricing and capability tests.                              | Current models/interfaces leave a specific unresolved weakness.                                                     |
| Long-duration / hundreds of people   | Larger sessions may expose context, fairness and latency limits absent from four to eight voices.                                                                                                                                                               | Load fixtures, long histories, sustained cost monitoring and participant-level sampling.                            | A useful small-scale architecture and measurement chain are established.                                            |
| Human participant studies            | Test transfer of responsive AI-participant findings to people in the theatre.                                                                                                                                                                                   | Recruit participants, run the exchange, gather individual accounts and inspect specific moments.                    | A stable rehearsal configuration is ready for the audience; AI evidence identifies useful questions to investigate. |

Custom model architectures, full GraphRAG and large-capacity trials require
substantially more engineering than this pilot. Document their hypotheses and
triggers rather than presenting unimplemented mechanisms as tested alternatives.
