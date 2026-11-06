# Rapid collective-voice screening

Current status, 6 November 2026: prompt experimentation is parked while work
moves to projected rehearsal. The [human-first experiments](human-composition-experiments.md)
record the current candidate prompts and creator feedback. The scale ladder and
protocols below are retained as historical research, not scheduled work.

Use a scale ladder, not a single tiny-group test. The
[criteria](collective-voice-criteria.md) stay fixed; prompt mechanisms, not wording
polish, are the first experimental factor. This replaces serial, one-off prompt
scripts with a reusable bounded-parallel runner.

## Test cases and search

- **Synthetic 4, 8, 16, 32, 64:** nested subsets of one frozen 64-slot corpus,
  generated with the existing contribution-v4 authoring instructions and Terra.
  Reuse the approved eight-person pilot; generate only missing slots. These are
  development fixtures, not population samples or evidence of human recognition.
- **Human 4:** separate small-group diagnostic. Original TXT/SRT files stay in
  ignored `runs/`; the Spanish working translation retains its provenance.
- Small cases test relationships between distinct concerns. Larger cases test
  selection, compression and the collective picture. Nested cases add sources
  as they grow: this does not isolate group size from composition of the set.

The initial catalogue is in
[collective-screen-variants.json](../examples/collective-screen-variants.json):
range, question-led development, semantic transitions, counterpoint, a supported
relation map, source anchors, draft revision, and an unrelated fictional example.
These are different hypotheses. Intermediates are source material, not evidence
that a plan is faithful. The writer retains the original inputs at every stage.

Run one draft per variant and case: 48 final passages, 66 model calls with this
catalogue. Four concurrent jobs; stages within a job remain sequential. Keep
Terra and output length constant. Assess each size separately. The creator
subsequently clarified that the current stage remains divergent: test substantially
different approaches next, rather than prioritising repetition and source-order
checks. Reserve stability checks for candidates worth developing. Combine mechanisms
only after an identifiable benefit, rather than expanding a full factorial grid.

The whole initial suite is for development. Reordering is a sensitivity check,
not an independent source holdout. A genuinely fresh source set is required
before claiming transfer. Do not promote a prompt solely because it is best at
four or 64; record where it works and fails.

## Fast assessment without a false leaderboard

Screen finished passages under opaque labels before revealing the mechanism.
For each, write a compact evidence card:

1. The relationship that develops, with a passage—or why it remains a catalogue.
2. Source meanings shaping the text; important absences or mere mentions.
3. Any consequential distortion, invented shared circumstance or manufactured
   agreement, with source evidence. Distinguish an interpretation or proposal
   from a false claim that someone expressed or endorsed it.
4. A notable strength or obstacle for spoken delivery. Text review is not an
   actual performance test.

Use automated checks for completion and technical validity, not artistic grades.
A model reviewer can suggest evidence and omissions; verify consequential
findings against the sources. Neither a single score nor a fluent judge rationale
establishes recognition, belonging or quality. Two readers' disagreement should
stay visible. Do not require identical wording under input reordering.

Advance promising mechanisms with no identified serious distortion; keep mixed
findings. Before accepting a baseline, repeat unchanged candidates, inspect
source/order sensitivity and recurring exclusion across sizes, and have the
creator hear finalists aloud. Participant feedback is the separate check of
recognition and belonging. Allow “neither” or “not yet”; no batch must produce a
winner. Repeated failure of the same mechanism calls for a different hypothesis,
not more superficial paraphrases.

## Runner

Prepare a private plan with `model`, `concurrency`, `datasets`, `variants` and
`repetitions`. A dataset contains only its ID, invitation and contribution
ID/text pairs; private authoring assignments must never enter it. Variants
contain ordered stages with `instructions` and optional `includePrevious`.

```sh
mise exec -- node --env-file-if-exists=.env scripts/collective-screen.ts \
  --plan runs/<private-plan>.json --out runs/<new-screen-directory>
```

The runner refuses an existing destination. It freezes the plan, journals exact
requests, streamed prefixes, stage results, usage and timing, and saves all job
outcomes. Failure in one job does not erase completed jobs; there are no automatic
API retries. The CLI uses a shared USD 2 reservation ceiling per screen. A
separate key maps opaque reading labels to cases and variants. Generation is
isolated from the research, assessment and earlier chat.

This is how iterations become faster: change a catalogue or case, run one batch,
read short evidence cards, and spend repeats on contenders. Research and source
audits can run independently while generation proceeds. Keep documentation to
hypothesis, changed factor, result and next decision; do not rewrite a protocol
for every draft.

## Research informing the design

Two independent GPT-6 Luna research agents considered composition and evaluation.
The evidence motivates tests; it does not validate a collective-performance
method.

- DiverseSumm studies divergent news sources and finds incomplete diversity
  coverage and evaluation biases. It supports testing range and ordering, not
  equating coverage with representation. [Huang et al.](https://arxiv.org/abs/2309.09369)
- LongEval investigates finer-grained source-faithfulness judgements. Use
  claim-level evidence for disputed passages rather than reviewing whole texts
  only by impression. [Krishna et al.](https://aclanthology.org/2023.eacl-main.121/)
- STORYSUMM shows that even human narrative-faithfulness protocols can miss
  inconsistencies. Preserve counter-evidence and use more than one view of
  finalists. [Subbiah et al.](https://aclanthology.org/2024.emnlp-main.557/)
- LLM judge preferences vary with candidate position. Opaque labels, shuffled
  presentation and source checks reduce reliance on a single preference result;
  they do not make it objective. [Shi et al.](https://arxiv.org/abs/2406.07791)
- Official OpenAI guidance advocates task-specific evaluation and iterative
  improvement. We use a local, private evaluation loop rather than uploading
  participant data into a hosted evaluation dataset.
  [Model optimisation](https://developers.openai.com/api/docs/guides/model-optimization),
  [evaluation flywheel](https://developers.openai.com/cookbook/examples/evaluation/building_resilient_prompts_using_an_evaluation_flywheel).

Hierarchical reduction is deferred: first test whether full input works. It can
lose rare meanings while adding latency and interpretation. The new catalogue
includes evidence-bearing intermediates, which differ from the generic outlines
that previously failed, but any benefit remains to be demonstrated.

## Initial run

`runs/collective-scale-screen-v1/` contains all 48 passages and 66 successful
model calls, generated in approximately 111 seconds. Standard-rate token usage
estimates were USD 0.389171 for the screen and USD 0.097253 for completing the
56 missing fictional accounts: USD 0.486424 total, excluding earlier experiments,
tax and caching discounts. This is usage accounting, not an invoice.

Two Luna reviewers inspected source text and opaque-labelled passages, split
across the cases. The parent checked candidate evidence and corrected mistakes:
one alleged omission was present in the passage, and several objections confused
collective “we” with unanimity. Model-assisted review remains fallible.

Promising mechanisms varied by scale: supported relations at synthetic four,
question-led composition at eight and 32, hinges and revision at 16, and questions
or relations at 64. These are single-draft candidates, not a ranking. The human
four-input case remains mostly sequential; the hinge version develops a more
explicit relationship but is not an accepted baseline. `shortlist.txt` offers
one illustrative candidate per case, with a separate method key.

The initial proposal to repeat unchanged contenders was superseded by the
divergent batch below. Source selection in larger outputs repeatedly
centres time, care and transport; examine the corpus distribution before
attributing that pattern to the model. No participant recognition or aloud
performance assessment has been conducted.

## Divergent batch

The creator chose breadth of exploration over stability checks. The new
[catalogue](../examples/collective-divergent-variants.json) keeps the range
reference and tests six substantial changes:

- **Thinking aloud:** perspectives interrupt or redirect a provisional thought.
- **Interwoven threads:** several threads remain active within one collective,
  without a compulsory overarching theme.
- **Dramatic progression:** source material supplies a desire, pressure or
  difficulty and something that changes its meaning.
- **Compose, audit, deepen:** an explicit source audit identifies what the first
  draft's framing makes hard to hear; a rewrite changes the framing rather than
  appending omitted topics. Draft and audit remain available to the writer.
- **Competing compositions:** generate three different readings sequentially,
  retaining all three. Later versions see earlier drafts to seek alternatives;
  these are dependent explorations, not independent repetitions or best-of-three
  selection. The original sources remain available throughout.
- **Reasoning setting:** compare the unchanged range prompt on Terra with
  reasoning disabled versus medium. All conditions get the same 4,096-token
  ceiling; requested final speaking space remains 140–160 words. This ceiling
  is higher than the previous screen's 1,536 to accommodate reasoning tokens.

The same six cases give 42 jobs, 54 candidate passages and 66 model calls, under
the existing USD 2 batch ceiling. The design is frozen in
`runs/collective-divergent-design-v1.json`; exact inputs and prompts are in
`runs/collective-divergent-plan-v1.json`. Outputs are in
`runs/collective-divergent-screen-v1/`. Source order is unchanged.

Assessment retains the existing criteria. Seek qualitatively different and
promising possibilities, with their trade-offs and source evidence. A strong
moment with rough edges can justify further exploration; stylistic novelty
does not excuse serious distortion. No method is declared reliable from this
batch, and no forced winner or composite score is required.

Runner additions are optional per-variant `model`, per-stage `includeHistory`
and `retainAsCandidate`. Exact effective models are journalled. Intermediate
audits stay out of the reading pack; explicitly retained alternative passages
appear under separate opaque labels. Completed alternatives survive a failure
in a later stage and are labelled with their job's failure status.

### Divergent batch findings

The batch completed all 42 jobs and 66 calls, retaining 54 passages. Recorded
usage gives an estimated API cost of **USD 0.382907**; API batch time was
116.2 seconds. Development and review time is additional. Full verification
passed 464 tests, formatting, typecheck and build.

Thinking aloud and dramatic progression produced promising moments where a
contribution changes the meaning of the opening thought. Competing compositions
changed both the organising idea and which sources received attention, including
at 64 inputs. These are useful different possibilities, not established winners.
Many passages still place consecutive domains beneath a broad common theme;
medium reasoning and an audit/rewrite did not obviously resolve that in the
inspected examples. The human four-input case remains uneven.

The private six-passage comparison is
`runs/collective-divergent-screen-v1/comparison.txt`, with a separate method key.
`findings.md` records specific strengths, source-grounding risks and attention
trade-offs. `reading-copy.txt` retains all 54 candidates; `manifest.json` records
cost and completion. No passages were edited after generation. Their whitespace
word counts range from 151 to 175 (median 161); 32 exceed the requested 160-word
upper target. No participant recognition or aloud assessment has taken place,
and no baseline is accepted.

The next useful exploration is how one contribution can change a developing
thought, alongside multiple threads and competing interpretations. This remains
a divergent stage; these results do not yet call for order-stability repetitions.

## Prompt-design review and proposed next step

Review dated 5 November 2026. The fifth human contribution is preserved unchanged
in `runs/human-contributions-2026-11-05-v3/`, alongside an updated five-contribution
English working input. Earlier frozen sets and experiments remain unchanged.
TXT and SRT agree after whitespace normalisation. No new composer run was made
as part of this review.

The research so far is stronger on representation and assessment than on prompt
construction. The existing runner already separates instructions from source
data, specifies the speaking perspective and output, retains original inputs,
and records exact experiments. However, the recent catalogues largely share the
same framing and restrictions. Changing the artistic mechanism inside that
frame does not establish whether the frame itself helps. The initial example
condition contained one miniature fictional illustration, not a set of complete
source-to-passage demonstrations.

### Guidance checked

Official [prompt engineering guidance](https://developers.openai.com/api/docs/guides/prompt-engineering)
recommends clear separation of instructions and context, and examples pairing
inputs with desired outputs. Diverse examples can communicate a transformation
that abstract instructions leave ambiguous. This motivates testing complete
composition examples; it does not establish their effectiveness for this piece.

Official [reasoning guidance](https://developers.openai.com/api/docs/guides/reasoning-best-practices)
recommends direct instructions, explicit success requirements, clear delimiters,
and starting without examples before adding them when needed. It advises against
unnecessary requests to expose step-by-step reasoning. The page includes older
model-specific advice: these general principles are hypotheses to test on Terra,
not evidence of a Terra-specific creative-writing optimum. Our spoken
thinking-aloud condition describes the desired passage; it is not a request for
the model's hidden reasoning.

### Project-specific hypotheses

- The shared warning against invented agreement may need the distinction already
  present in our criteria: collective “we” is a speaking perspective, not a claim
  of unanimity. Test that clarification without relaxing faithfulness.
- Range, caution and brevity may collectively encourage compact catalogues.
  This is a hypothesis, not a demonstrated cause. Test a substantially leaner
  brief while retaining the same external assessment criteria.
- Full demonstrations may teach the relationship between sources and composition
  better than more abstract artistic vocabulary. Use fictional sources outside
  the evaluation cases, with genuinely different successful movements. Inspect
  borrowing of content and formula as well as improvements.
- A contrasting pair can show the difference between accurate serial summary and
  collective composition. This contrastive technique is our proposed experiment,
  not a result established by the cited guidance.

### Proposed batch, not yet run

Keep Terra, source presentation, requested speaking length and assessment fixed.
Use five conditions: the existing thinking-aloud reference; a minimal brief with
that same compositional aim; the minimal brief with an explicit explanation of
collective “we” and faithful transformation; that clarified brief with two complete
and diverse source/output examples; and the clarified brief with a summary versus
composition example pair and a short explanation of the difference. This makes
30 passages across human five and synthetic 4, 8, 16, 32 and 64. It is a divergent
screen, not a fully isolated factorial study or an order-stability exercise.

Before examples become prompt material, the creator should inspect the few
passages or invented examples intended to express the artistic target. A model
reviewer's preference is insufficient to define that target. This review can be
small and need not hold up preparation of the remaining conditions.

Assess whether relationships develop, whether they preserve source meaning, and
what happens to attention, plurality and spoken quality. Keep different promising
possibilities. Human five is an expanded development case, not a clean holdout:
four accounts have already shaped the experiments and the fifth has been read.
A later matched model comparison can test whether a remaining limitation is
specific to Terra; increased reasoning on the same model has not answered that.

## Reduced prompt-framing screen

The creator subsequently reduced the scale sampling to **human five, synthetic
16 and synthetic 64**. These retain real speech, intermediate compression and
the largest input without running every nearby size during divergence. This is
15 passages across the five conditions, not the previously proposed 30. Return
to the other sizes once there is a direction worth investigating; the smaller
screen cannot establish performance throughout the scale ladder.

The [prompt catalogue](../examples/collective-framing-variants.json) contains the
unchanged thinking-aloud reference, minimal brief, clarified collective “we”,
two complete examples and a contrasting summary/composition pair. The primary
assistant authored fictional demonstration inputs and outputs about preserving
recordings and an amateur orchestra. Their outputs are 152 and 151 words; the
contrasting summary is 150 words. These are provisional examples, not
creator-approved artistic targets. The author had seen the evaluation corpus;
the examples are invented separately and are not held-out evidence.

The minimal brief changes several instructions together; its comparison with
the reference cannot isolate which deletion matters. The clarified brief adds
one explanation to the minimal brief. Both example conditions extend that
clarified brief, but differ in example count and teaching style. All conditions
use the same inputs, source order, Terra configuration, 140–160-word target and
external criteria. Assess copied content, recurring structures and closing
formulas alongside composition and fidelity.

The initial full-scale attempt in `runs/collective-framing-screen-v1/` produced
no passages or usage reports because network access failed; a separate unauthenticated
connectivity check confirmed DNS failure. Its records remain intact. The reduced
plan is `runs/collective-framing-plan-v2.json`, its design record is
`runs/collective-framing-design-v2.json`, and the network-enabled retry is saved
in `runs/collective-framing-screen-v2/`. No failed request was silently retried.

### Reduced-screen outcome

All 15 passages completed in 31.4 seconds of API batch time, at a recorded
usage-based cost of **USD 0.110570**. The private result is
`runs/collective-framing-screen-v2/`; `manifest.json` records completion and cost,
`findings.md` contains the assessment, and `comparison.txt` places reference and
two-example outputs side by side by case (human five and synthetic 64), with a
separate method key. The full opaque reading copy retains all 15 outputs.

The human case remains mainly sequential across conditions. The reference makes
a more visible initial turn; the full examples do not solve the catalogue
problem. At 64, the two-example output connects self-implication to structural
constraints and is worth retaining as a different possibility. The reference
also develops a relation through the risks of asking for change. No consistent
advantage is established for shorter wording, explicit “we” clarification or
these examples. This is one draft per condition/case, not a general verdict on
any prompting technique.

Two cheaper-model reviewers inspected source/output packets without condition
names. The parent checked their cautions and kept ambiguous interpretations
separate from established distortion. No obvious archive/orchestra content
leakage was observed. Synthetic selections still favour time, care and transport.
Word counts range from 151 to 166, with nine above 160. No participant recognition
or aloud assessment took place. No runtime code changed; repository formatting
and diff checks passed.

The reduced set supplied enough contrast to avoid expanding these particular
variants immediately. A matched comparison with another model, or demonstrations
that the creator endorses as artistic targets, would address a new uncertainty;
more nearby scale cases would currently offer less new information.

## Exact prompt inventory for authoring

On 6 November 2026, the creator requested the exact prompts and accompanying
context before writing their own comparison conditions. The private inventory
is `runs/prompt-inventory-2026-11-06/`. Start with `START-HERE.txt` for the review
and context explanation, then `static-prompts.txt` for the 39 distinct static
system messages, including planning/audit stages. Repeated identical messages
are grouped without removing their different uses. `current-complete-request.txt`
shows a complete human-five reference call; `full-request-examples/` contains a
complete representative request for each indexed system message.

`requests.jsonl` and `prompt-index.json` preserve full messages, configurations,
source references, condition/stage identifiers and completion status. Historical
dynamic/reader instructions and frozen delivery packets are included separately.
All 638 indexed message arrays were checked against their source records, and
all 66 unique system-message hashes were verified. Historical instrumentation can
duplicate records, so these are not counts of distinct API calls. The inventory
captures application-supplied context, not provider-internal instructions or
reconstructed wire payloads. Participant-generation and reviewer prompts are
outside its scope. No generation or model change was performed.

For the creator-authored comparison, accept complete replacement system prompts
verbatim. Keep source JSON and model settings fixed; do not silently add the
existing common instructions. Any shared wrapper should be explicit and visible.
