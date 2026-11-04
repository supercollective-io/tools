# Composer criteria audit — 4 November 2026

## Finding and changes

The intended outcome is for each individual to feel represented in the
collective and in conversation with it. The experiment had over-weighted
explicit correction after withdrawal. That requirement primarily lived in
assessment documents, not in the runtime's acceptance rules.

Two independent Luna subagent audits examined documentation and the underlying
prompts, fixtures, scheduling, tests and metrics. The primary agent checked the
source-level findings. These are repository findings and hypotheses about
experience, not results from participants.

Current guidance now makes individual uptake optional while retaining the
per-person experiential goal. The [assessment amendment](composer-performance-assessment.md)
distinguishes fixed-script evidence, responsive AI-participant evidence and
human rehearsal. Responsive AI participants can provide strong experiential
evidence; human rehearsal tests transfer to the audience. Token reduction,
latency and speaking-space ratios support the goal rather than replacing it.

## Audit below the documentation

| Layer                        | Source evidence                                                        | Finding and action                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live composer prompt         | `src/live.ts`, `buildLivePrompt`                                       | It asks for one connection or tension at a time and says other details can follow. It does not require each correction to appear. It favours a collective “we”, discourages recounting who said what, and limits speaking space. Preserve this baseline; test whether these choices support recognisable perspectives and conversational possibilities rather than assuming smooth synthesis is sufficient. |
| Historical Stage 1 prompt    | `src/composition.ts`, `buildPrompt`                                    | It explicitly says not every voice needs a mention. It receives new slices and bounded collective history, so a point not selected can disappear from future context. This is a possible source of sustained exclusion, not a semantic acceptance rule. The current `compose` command uses live full prefixes instead; do not conflate them.                                                                |
| Candidate prompt             | `examples/composer-candidate.json`                                     | The wording directed new input to qualify or correct prior framing. Changed it to permit deepening, redirecting and complication while explicitly allowing selection. Old comparisons used the prompt frozen in their journals; do not relabel those results as tests of the new candidate. Baseline Luna/Terra instructions remain unchanged.                                                              |
| Participant prompts          | `src/live.ts`, `src/simulation.ts`, `src/continuous.ts`                | Participants may disagree, develop their own account or engage with the collective. Optional engagement protects independence. Do not force them to demonstrate conversation by replying every time; assess the actual exchange and their accounts of it.                                                                                                                                                   |
| Request acceptance and tests | `src/models.ts`, `src/live.ts`, composition/live/simulation tests      | Checks concern provider completion, saved prefixes, input availability, ordering and private context. No automated semantic gate requires uptake of every refusal or correction. Keep these contracts. Assertions that all sources are supplied are not assertions that all must be mentioned.                                                                                                              |
| Context anchors              | `src/simulation-runs.ts`, `respondingToPassageId`; live source offsets | These identify supplied context. They do not prove acknowledgement, agreement or influence. Preserve journal meanings and judge semantic relationships separately.                                                                                                                                                                                                                                          |
| Audit metrics                | `src/composer-audit.ts`                                                | Source verification and whole-run speaking-space ratios measure technical properties. They cannot establish each participant's experience. Add participant-level assessment to responsive experiments, retaining negative and mixed accounts rather than relying on averages.                                                                                                                               |
| Fixtures and runner          | `examples/composer-corrections.json`, `src/luna-screen.ts`             | Three of four voices emphasise obligations or permissions. The historical screen and follow-up gave this narrow case substantial exposure. Preserve frozen sources and reproduction support, but demote this case to a diagnostic and broaden subsequent cases. No model-selection gate is implemented in the runner.                                                                                       |
| Small rehearsal sample       | `src/workspace.ts`, `makeInputs`                                       | The pair mode deliberately selects Chris and Rosa when available. This is a useful fixed comparison, not a representative sample or coverage of every perspective. Vary participants in experiential evaluation.                                                                                                                                                                                            |
| Capacity and history         | `src/workspace.ts`, `src/live.ts`, `src/continuous-runs.ts`            | The workspace's 24,000-character guard fails explicitly rather than silently discarding people. Historical continuous mode uses unconsumed slices and bounded history. Neither establishes capacity or equitable opportunity at hundreds of voices. Keep capacity research separate from small-sample experience claims.                                                                                    |

## Other assumptions to test

- A unified, short, smooth voice may suppress distinctive language or unresolved
  tension. Conversely, more attribution or more words may become a catalogue.
  Compare these trade-offs through responsive participant experiments rather
  than changing the baseline while comparing delivery mechanisms.
- Typed extraction could impose a vocabulary of proposals, refusals and
  commitments on material whose value lies in experiences, questions, images
  or ambiguity. Judge whether preprocessing preserves opportunities for
  recognition and response, not the number of administrative records extracted.
- Relationship edges can make a connection explicit while oversimplifying it.
  Support and opposition are not the only ways contributions relate. Preserve
  exact evidence and distinguish an interpretation from a quotation.
- A 25% token saving is useful engineering evidence, not a sufficient reason to
  prefer a representation. An 800-token allowance controls a comparison; it
  does not establish suitability for hundreds of people.
- Prompt instructions requesting automatic agreement, explicit recognition or
  correction on cue would make AI-participant evaluations circular. Elicit
  participants' accounts separately and ask for supporting moments. Compare
  those accounts with the exchange and include contrary evidence.

These risks do not justify removing the current prompt's constraints all at
once. Preserve controlled comparisons and successive vertical slices. The
original fixed-source results remain useful evidence for composition; responsive
participant experiments supply additional evidence about the core experience.
