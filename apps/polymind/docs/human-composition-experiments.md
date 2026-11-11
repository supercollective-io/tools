# Human-first composition experiments

Status, 6 November 2026: the creator has parked prompt experiments to move on to
projected rehearsal. G, A and original text-010 are leading references; H is also
very good. Retain both direct-voice and developing-qualifications candidates.
No further prompt screen or synthetic-corpus rewrite is scheduled. The protocols
below describe the completed exploration and remain available for later use.


Working protocol, 6 November 2026. The creator prioritised the real contributions
because their specificity, diversity and expression differ substantially from the
existing synthetic corpus. Human six is the primary development case. Success on
the old synthetic material is not evidence of transfer to these human inputs.
Keep the [assessment criteria](collective-voice-criteria.md), but explore different
forms rather than selecting a single reliable prompt prematurely.

## Source material

The private working set is
`runs/human-contributions-2026-11-06-v4/inputs-english.json`. It extends the frozen
five-person set with h06; h01–h05 are unchanged. Original TXT and SRT files are
preserved byte-for-byte with hashes and source paths. Their words agree after
whitespace normalisation. The SRT ends at 127.76 seconds; this is a cue endpoint,
not an independent audio measurement. No audio was supplied.

The creator authorised clear transcription corrections. The working h06 text
contains six logged changes, including three recognition corrections and three
capitalisation changes. Ambiguous family-background phrasing remains unchanged.
The private manifest records every original/replacement pair and rationale.
Do not treat transcription artefacts as creative source language or silently
reconstruct uncertain wording. The composer receives only the invitation and
contribution ID/text pairs, never provenance notes or private assessments.

## First batch

All conditions use the same six complete contributions in the same order. There
are no synthetic cases in this batch. Use two drafts per condition for exploratory
variation, not a reliability estimate. Each final passage targets 140–160 words;
record actual length without trimming outputs after generation.

The creator removed the British English requirement to avoid unnecessary
regional steering. All new prompts request English without a dialect. Historical
prompts and outputs remain unchanged. The reference is therefore P028 with that
qualifier removed, not an exact historical reproduction. Preserve the participants'
expressions rather than standardising their language to the composer's dialect.

| Condition                                            | Model | Final passages | Calls | Question                                                                   |
| ---------------------------------------------------- | ----- | -------------: | ----: | -------------------------------------------------------------------------- |
| Thinking-aloud reference, regional qualifier removed | Terra |              2 |     2 | What does the existing approach do on human six?                           |
| Range instruction removed                            | Terra |              2 |     2 | Does removing range pressure change composition and selection?             |
| Source-language chorus                               | Terra |              2 |     2 | Can participants' phrases, recurrence and juxtaposition carry composition? |
| Longer composition, then adaptation                  | Terra |              2 |     4 | Can relationships emerge with more space, and survive compression?         |
| Matched thinking-aloud reference                     | Luna  |              2 |     2 | Does changing the model change the same task's result?                     |

Total: ten final passages through twelve model calls, plus two saved exploratory
compositions. The range condition deletes exactly one sentence from the current
reference; it does not add a stronger selection instruction. Chorus changes the
form and instructions together. The longer condition adds computation and an
intermediate text as well as space; an improvement cannot isolate those causes.
Luna's prompt and settings match the Terra reference except for model identity.
These ten outputs do not establish model equivalence or superiority.

The [catalogue](../examples/collective-human-variants.json) is public; participant
material, plans, requests, outputs and assessments stay in ignored `runs/`.
Terra and Luna use reasoning `none`, a 4,096-token request ceiling and a
120-second timeout. The runner uses the existing USD 2 reservation ceiling for
the whole batch, with four concurrent jobs and sequential stages within a job.
No model fallback or automatic retries are enabled.

## Prepare, verify and run

Offline preparation validates exactly six non-empty contributions, the reference
and all stage settings. It refuses an existing output file. It adds the matched
Luna reference explicitly and prints the source-file hash and call counts.

```sh
mise exec -- node scripts/prepare-human-screen.ts \
  --inputs runs/human-contributions-2026-11-06-v4/inputs-english.json \
  --out runs/human-composition-2026-11-06-plan-v1.json

mise exec -- node --env-file-if-exists=.env scripts/collective-screen.ts \
  --plan runs/human-composition-2026-11-06-plan-v1.json \
  --out runs/human-composition-2026-11-06-v1
```

The second command performs real provider calls. It creates a new destination,
freezes the plan, records exact requests and streamed prefixes, and retains
failures and all completed stages. `reading-copy.txt` contains opaque-labelled
final passages, with `key.json` separately identifying conditions. Long drafts
remain in `results.jsonl` for comparison with their adaptations. Inspect saved
results before claiming the run completed or a composition worked.

## Read the results

Read final passages before intermediate drafts. Keep a short source-grounded
evidence card for each final passage:

1. What becomes possible through this combination? Identify the actual movement,
   juxtaposition or recurrence rather than rewarding a polished umbrella theme.
2. Which consequential meanings are preserved, changed, merely named or absent?
   Inspect recurrent exclusions across drafts without imposing an inclusion quota.
3. Are there invented facts, shared biographies, agreement, or misleading
   equivalences? A source account is not an independently verified event.
4. Does this depend on these particular contributions? Could most of it be reused
   unchanged for a different room?
5. What seems worth hearing or answering? Record text-based judgement separately
   from an actual aloud reading and participant recognition.

For the chorus, check source phrases and who their personal claims refer to.
An intentional sequence is not automatically a catalogue. For long/adapted pairs,
identify relationships gained with space and lost or strengthened during cutting.
For the range ablation, record the attention trade-off as well as composition.
Retain disagreements and different promising forms; do not aggregate a score or
declare a winner. Human six is a development set, not a holdout or a representative
sample of an audience. Later fresh human material tests transfer.

## Subsequent experiments

First use the creator's response to these passages to choose what deserves more
exploration. More examples should demonstrate heterogeneous source combinations
and forms the creator finds convincing. Do not label model-authored exemplars
as creator-approved. A substantially human-edited example would break the loop
of models writing, imitating and assessing their own preferred style.

A later recomposition experiment can begin with a subset, introduce new sources
and allow revision of the unpublished whole. Record order and starting-subset
effects. This is different from generic audit/rewrite and from live continuation.
Neither this method nor long-first adaptation may retract already published live
prefixes; any future live integration needs a separate design.

The [synthetic-corpus revision brief](representation-corpus.md#revision-after-human-comparisons)
changes the design assumptions before any replacement generation. Keep existing
synthetic inputs unchanged and do not spend the current batch on another scale
ladder.

## First batch findings

`runs/human-composition-2026-11-06-v1/` completed ten jobs and twelve calls,
producing all ten final passages and retaining both exploratory drafts. The
creator explicitly approved cloud transmission before dispatch. Recorded usage
gives an estimated USD 0.0382363 under the existing USD 2 ceiling; this is not an
invoice. `manifest.json` records hashes, counts, timing and validation. All twelve
requests were checked against the same six-source working set.

The range ablation did not visibly remove sequential organisation in either
draft. The chorus altered texture but remained largely source-by-source; one
passage misleadingly connected two different wishes from the same contributor.
Long-first adaptation produced more selective compositions and retained a useful
change of perspective in one pair, while another adaptation lost a connecting
thought from its longer draft. The matched Luna reference remained coherent but
also used lists and commentary. None is an accepted baseline or established
model advantage.

Final outputs contain 149–171 whitespace-separated words, with median 156;
eight of ten meet the requested 140–160 range. Both range-removed drafts exceed
it. Exploratory drafts contain 378 and 456 words. Nothing was trimmed. The private
`findings.md` contains ten evidence cards, source checks, intermediate comparisons
and attention trade-offs. `reading-copy.txt` retains all final passages under
opaque labels; `key.json` supplies the condition mapping.

Full automated verification passed 467 tests, formatting, type checking and build
after granting the test suite local socket access. The initial sandboxed suite
encountered loopback permission errors. Artistic review was by the primary
assistant who authored the prompts; it is not independent blind evaluation. No
aloud reading or participant feedback has taken place. Keep the different forms
available for creator review before further generation. The synthetic revision
remains a design brief, with no replacement corpus generated.

## Creator feedback and reasoning comparison

On 6 November 2026 the creator found **text-010 very good** and text-009
interesting, while rejecting explicit mention of “contributions”. Both were Luna
outputs with reasoning disabled, using the same reference prompt and human-six
input. This preference supersedes the assistant's shortlist as the direction
for exploration; it does not establish consistency, a validated baseline or
participant recognition. The creator also prefers “part of us” to “one of us”.
Keep the original passages and their original assessment unchanged.

The follow-up keeps human six and Luna, with two drafts each at reasoning
`none`, `medium` and `high`: six calls and six final passages. All share text-010's
system prompt plus one instruction to speak the collective thought directly,
avoid explicit source/process narration, and prefer “part of us” where useful
without repeating it mechanically or collectivising personal biography. The
visible “think aloud” instruction describes the artistic output; it is not a
request to reveal internal computation.

All three settings use the Responses API, the same 8,192-token ceiling (including
reasoning), a 180-second timeout and the same source order. This provides a new
within-batch comparison. The endpoint, prompt amendment and token ceiling differ
from the first batch, so a difference from historical text-010 cannot be
attributed solely to reasoning. The performance-length request remains 140–160
words. The existing USD 2 batch ceiling applies; no automatic retries or fallback.

The [official reasoning guide](https://developers.openai.com/api/docs/guides/reasoning#reasoning-summaries)
documents opt-in provider reasoning summaries and explicitly distinguishes them
from raw reasoning. The [Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna)
supports the three selected effort levels. Request `summary: auto` for medium and
high, omit it for none, and record absent summaries honestly. A returned summary
may help inspect reported priorities but does not prove what caused the prose.
Do not prompt for a retrospective explanation and label it internal reasoning.

`api: responses` selects a separate offline-screen adapter. It journals the exact
request body, sets `store: false`, disables automatic retries and provider logging,
and preserves output-token usage including reasoning for budget accounting.
Only output-text events reach the spoken-text callback. Returned summary text
and reported reasoning-token counts go into private stage records and a separate
`reasoning-summaries.txt`; raw/opaque reasoning and upstream errors are not saved.
Summaries never enter subsequent composition stages or the reading copy. Read
the prose before the summaries to reduce explanatory persuasion. This does not
change live writing or enable hosted tracing.

```sh
mise exec -- node scripts/prepare-human-reasoning-screen.ts \
  --previous-plan runs/human-composition-2026-11-06-v1/frozen-plan.json \
  --out runs/human-reasoning-2026-11-06-plan-v1.json

mise exec -- node --env-file-if-exists=.env scripts/collective-screen.ts \
  --plan runs/human-reasoning-2026-11-06-plan-v1.json \
  --out runs/human-reasoning-2026-11-06-v1
```

Inspect each passage for compositional movement, fidelity, attention and spoken
quality. In particular, check whether extra reasoning improves the desired
voice or merely adds polish, explanatory language or a repeated “part of us”
formula. Reasoning-token counts measure resource use, not artistic quality.

### Reasoning comparison findings

`runs/human-reasoning-2026-11-06-v1/` completed all six calls and passages.
The provider returned summaries for all four reasoning-enabled calls. Estimated
usage cost was USD 0.0035531 at the configured rates, before caching discounts;
this is not an invoice. `manifest.json` records request checks, hashes, timing and
token counts. All six calls used the same prompt and frozen human-six inputs.

All outputs avoided explicit “contributions”, “one of us” and “another of us”.
All used “part of us”, suggesting the preferred wording can itself become a
formula. In the assistant's reading, extra reasoning did not establish a clear
artistic advantage: useful turns coexist with lists, abstractions and some
strengthening of source claims. The creator-endorsed historical text-010 remains
a reference rather than being displaced by this assessment.

The medium calls reported 1,143 and 1,089 reasoning tokens; high reported 891
and 1,250; none reported zero. More requested effort did not monotonically
increase tokens or time in these two draws. Final passages contain 157–165 words,
with three exceeding the 160-word upper guide. No output was edited.

Provider summaries contain potentially useful editorial clues about attribution
caution and collective agency, but also generic restatements and a mismatch with
one final passage. Do not read them as transparent causal accounts. Final prose
was assessed before summaries; the private `findings.md` contains six evidence
cards and separate summary observations. The review is by the prompt author,
not an independent blind assessment. There has been no aloud reading or
participant feedback. Full verification passed 472 tests, formatting, type
checking and build.

## Direct collective voice: focused confirmation

The creator subsequently preferred direct “we” to habitual “part of us”, and
immediate entry into the substance over announcing a first thought. The
[direct-voice prompt](../examples/collective-direct-voice.txt) keeps text-010's
first paragraph (source faithfulness, range and length), replaces the
thinking-aloud paragraph with direct compositional movement, and retains a
short boundary against process narration and collective biography. It does not
prefer “part of us” or add a growing list of forbidden opening phrases.

`runs/human-direct-2026-11-06-plan-v1.json` freezes the new comparison: human six,
Luna, two draws with reasoning off and two with high reasoning. All settings,
sources and their order match the preceding reasoning screen: Responses API,
8,192 output tokens, 180 seconds, provider summaries requested only for high.
Concurrency is two. The unchanged historical text-010 is a reading reference,
not another generated cell or a controlled estimate of the prompt effect.
This is four calls and four new passages under the existing USD 2 batch ceiling.

```sh
mise exec -- node --env-file-if-exists=.env scripts/collective-screen.ts \
  --plan runs/human-direct-2026-11-06-plan-v1.json \
  --out runs/human-direct-2026-11-06-v1
```

Keep all four unedited passages and summaries. Read the prose before explanations
and compare aloud with the earlier text-010. Look for directness, development,
source fidelity and the presence of the collective voice. The creator can accept
a provisional composer without claiming audience-wide reliability. Do not expand
the matrix or generate synthetic replacements during this focused confirmation.

### Direct-voice findings

`runs/human-direct-2026-11-06-v1/` completed all four calls and passages, at an
estimated USD 0.0030816 in recorded usage before caching discounts. Both high
calls returned summaries. All four passages enter directly with “we want”, none
uses “part of us” or refers to contributions, and none announces a thinking
stage. One high passage still uses “one of us”; another loses an important source
uncertainty. Extra reasoning did not establish an advantage in this small batch.

`comparison.txt` presents the new passages as A–D and the unchanged historical
text-010 as a reference. The assistant finds D worth particular creator attention,
with its selection trade-offs recorded in `findings.md`; this is not an accepted
baseline. `comparison-key.json` identifies settings, and provider summaries remain
in their separate file. Final lengths are 168, 152, 153 and 158 words; nothing was
trimmed. No aloud reading or participant feedback was performed. The next step
is creator review, not automatic expansion of the experiment.

The runtime is unchanged from the previously verified 472-test version. For this
prompt/document-only change, schema and source-identity checks, the repository
check and Git whitespace checks passed; the full runtime suite was not repeated.

### Creator's passage-level assessment

The creator subsequently identified **A and the earlier text-010 as the best so
far, both with issues**. This supersedes the assistant's preference for D. Both
leading references used Luna with reasoning off; retain that as a provisional
direction, not evidence of general model-setting superiority.

The creator liked A's opening relationship and its question about collective
confidence, and also liked C's opening. C was otherwise among the weaker texts.
Specific objections concerned a classificatory insertion in B, B's assertion
about lost confidence and its corrective maxim, C's reportorial account language
and distancing qualification, and D's explicit announcement that the problems
differ. Exact passages and judgements are recorded privately in
`runs/human-direct-2026-11-06-v1/creator-feedback.json`.

The assistant interprets these choices as favouring direct composition over
classification, reporting and generic disclaimers. This is an interpretation of
the feedback, not a new set of blanket phrase bans. Consequential source
qualifications and personal factual scope still matter. A's liked question leaves
room for uncertainty, which its continuation preserves; B's definite historical
claim does not. Preserve these distinctions without treating caution itself as
an artistic achievement. The organising idea in the liked openings belongs to
these texts and should not become a compulsory theme for other source sets.

The original prompts, outputs and assessments remain unchanged. This feedback
updates the artistic references; it does not yet select a flawless passage or
authorise an automatic new generation batch.

### Developing qualifications: paired follow-up

The creator then authorised the next experiments. Compare the unchanged
`examples/collective-direct-voice.txt` with
`examples/collective-developing-qualifications.txt`, which appends only:

> Let qualifications change what we say, rather than comment on our right to say
> it. Let a particular limit, uncertainty or difference develop the thought:
> what we want, what is possible, or what acting together would require.

Use the same frozen human-six inputs, Luna through Responses with reasoning off,
two repetitions per prompt, concurrency two, 8,192 output tokens and a 180-second
timeout. No demonstrations or previous passages enter either request. The four
calls share the existing USD 2 batch ceiling. This isolates the added instruction
within this small screen; two repetitions cannot establish a reliable effect.

```sh
mise exec -- node --env-file-if-exists=.env scripts/collective-screen.ts \
  --plan runs/human-qualification-2026-11-06-plan-v1.json \
  --out runs/human-qualification-2026-11-06-v1
```

Assess whether uncertainty and differences develop the speech, whether specific
meanings retain their force, and whether the collective stays within its voice.
Do not score topical coverage or imitation of the earlier imagery as success.
Preserve all unedited outputs and compare with earlier A and original text-010.

The run completed all four calls, with recorded usage estimating USD 0.0009014
before caching discounts. `comparison.txt` labels the new texts E–H and includes
both unchanged historical references. E/H use the existing prompt; F/G use the
appendix. Word counts are 163, 160, 158 and 170 in reading order; no trimming was
performed. Exact requests, the condition key and private passage-level assessment
are saved alongside the results.

The assistant finds a promising local development in F, but no clear overall
improvement from the appendix. Generic qualifications remain in both conditions.
All four converge on the same opening idea without being shown previous outputs.
Keep the creator's existing shortlist and the unchanged reference prompt pending
review. This small batch does not establish a reliable prompt effect or general
success on other human sources. Schema, source identity, exact request settings,
repository check and whitespace checks passed; runtime code was unchanged.

The creator's subsequent review identifies **G as very good, at least as good as
A and original text-010**, and **H as also very good**. This supersedes the
assistant's proposed shortlist above. G uses the qualification appendix; H uses
the unchanged direct prompt. Both conditions have produced positively assessed
passages, without establishing which prompt is more reliable. Keep both as
candidate prompts and expand the artistic references accordingly. Do not infer
a rejection of E/F or approval of every individual sentence from this feedback.
Exact judgements are saved in the run's `creator-feedback.json`.

The assistant's assessment should give the whole passage's movement greater
weight and avoid turning earlier objections to particular phrases into blanket
bans. No additional generation or production prompt change was requested.
