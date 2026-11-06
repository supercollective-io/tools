# Designing 64 fictional contributions

Current direction, 6 November 2026: the [human-six experiments](human-composition-experiments.md)
are the primary development test. The existing 64-contribution corpus is frozen
historical material. Read the revision brief below before preparing a replacement;
the original design and generation instructions remain unchanged for replay.

## Revision after human comparisons

The creator observes that the human contributions are more specific and diverse
than the synthetic set. Existing synthetic outputs repeatedly organise concerns
around time, rotas, care, transport and responsibility. The human material ranges
across distinct domains and ways of speaking, and can combine named circumstances,
abstract beliefs, personal histories, small wishes and political claims. Specificity
does not simply mean adding anecdotes: a precisely expressed worldview can be
specific without describing a local incident. These observations motivate a new
corpus design; six contributions do not estimate an audience distribution.

Do not rewrite the old corpus in place or paraphrase the real people into fictional
copies. Before generating another 64, prepare and inspect a small, separately
versioned pilot with these changes:

- Replace repeatedly shared background situations with independently conceived
  circumstances and interests. Retain some genuine overlap, without giving the
  whole set a common social-policy vocabulary or an easy connecting theme.
- Vary how a concern becomes specific: a place, object, practice, experience,
  relationship, conviction, strange wish or specialist interest. Fictional detail
  must not be presented as a real testimony or a verified public event.
- Vary form and length substantially. Allow associative lists, a single emphatic
  claim, digressions, unfinished thoughts, humour and a mixture of abstraction and
  detail. Do not require each speaker to offer a problem, qualification, proposed
  solution and collective-action conclusion. Longer contributions are not failures
  solely because the earlier fixture aimed for one minute.
- Preserve strong positions and differences of worldview. Do not manufacture
  balance, agreeable nuance, a common politics or a plausible compromise in every
  account. Avoid assigning identity as a shortcut to predictable opinions.
- Use the same open invitation. Authoring controls remain private, never extra
  participant-facing questions. Request English without a regional dialect; allow
  varied natural expression without caricature or fabricated transcription errors.
- Keep human testimony out of generation prompts. Use the observed structural
  differences as design evidence, not distinctive private wording or biographies
  to copy. Keep all source-to-working-text corrections auditable.

Review the pilot as writing before judging its compositor outputs. Inspect
repeated sentence shapes, repeated arguments and endings, domain concentration,
specificity and whether the texts sound like answers from different people. A
surface diversity of assigned traits is insufficient. Compare several human and
fictional texts side by side without expecting fiction to impersonate the humans.
Do not optimise the replacement corpus to make a favoured composer succeed.

Only expand after the pilot reveals a useful range. Version the new design,
authoring instructions and provenance separately; preserve the old prepared
bundles and readers. Revised synthetic material would provide additional stress
cases, not evidence of human recognition or a replacement for fresh human inputs.
No replacement corpus has been generated as part of the human-six batch.

## Original preparation and scope

Status: question agreed on 4 November 2026; 64-slot preparation and an eight-person
pilot runner implemented on 5 November 2026. The Terra pilot completed eight contributions on 5 November 2026. Results remain
unreviewed by participants; see `runs/contribution-terra-pilot-v2/reading-and-review.txt`.
The earlier sandboxed attempt in `runs/contribution-terra-pilot-v1/` saved no
completed contributions.

## Purpose and fixed context

Prepare 64 independent LLM-written contributions for a static representation
test. Each contribution represents one fictional person speaking for roughly
one minute. Supply all complete contributions together in later tests; there
is no arrival schedule or participant response to a collective text in this
corpus.

Use the exact [agreed invitation](rehearsing-we.md#current-test-question):

> What is something you’d like to change, but can’t change on your own?

Optional supporting prompts:

> What would you like to be different?
>
> What would you need to make that change?

Keep the invitation unchanged. All planning dimensions and generation controls
below are private authoring instructions, not extra questions for participants.
Contributions can answer any part without following a prescribed structure or
providing a solution.

The performance is in English, at un_ctrl in Germany. Imagine a room of mostly
German strangers with an interest in art or technology and differing familiarity
with the piece. Allow different levels of English fluency, enthusiasm and
confidence. Do not infer a shared ideology or technical expertise from attendance.
This is design context, not material to include in the authoring prompt. The
prompt asks for an English spoken answer and supplies only the invitation,
assigned circumstances and directions. It does not explain the festival or
collective representation process.

These are fictional rehearsal inputs, not a sample of Germany or a prediction of
festival attendance. A synthetic corpus can expose problems in condensation; it
cannot establish whether actual people feel represented. In-person tests follow.

## How much text is one minute?

Use **about 130 words as a planning centre**, with most contributions around
**100–160 words**. Allow shorter and longer contributions, roughly **80–180
words**, where the pace and amount of thought make sense. These are soft drafting
guides, not participant rules, a required distribution or automatic rejection
limits. Do not make every contribution converge on 130 words. Plan for roughly
8,320 words in total, without treating that total as a target to enforce.

Published speaking guidance gives different ranges for different situations.
[Trent University](https://www.trentu.ca/academicskills/how-guides/how-present-university-and-beyond/delivering-oral-presentation-public-speaking)
lists 120–150 words per minute for general conversation, while
[Kent](https://student.kent.ac.uk/studies/giving-an-oral-presentation) suggests
130–160 for unscripted presentations. These are practical speaking guides, not
measurements of this audience. Our wider range is a design choice to accommodate
thinking, pauses and varied fluency.

[Morrill, Baese-Berk and Bradlow](https://www.isca-archive.org/speechprosody_2016/morrill16_speechprosody.html)
study variation in spontaneous English speech, including Korean- and
Mandarin-speaking learners. Their findings support treating speaking style and
proficiency as relevant; they do not supply a German-audience word rate.

Count words, not model tokens. For reproducible inspection, count non-empty
whitespace-separated units after trimming the text. This convention treats a
contraction or hyphenated expression as one unit; it is an approximate word
count, not a linguistic measurement. Keep token usage separately for cost.

Read a varied sample aloud, including shorter, longer, hesitant and fluent texts.
Check that each could plausibly be spoken in about a minute without rushing or
padding. Record timed readings if performed; otherwise label duration as
estimated. Read-aloud timing is a plausibility check, not a measurement of how
an actual participant would improvise an answer.

## What diversity means here

Seek variation across the corpus, not maximum difference between every pair of
people. Repeated concerns, common expressions and partial agreement belong in a
plausible room. Different words can hide the same position; similar words can
express different stakes.

Use these dimensions to plan and review the set. The examples are possibilities,
not a menu for participants or quotas to fill.

| Dimension                  | Variation to look for                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interpretation             | Changing oneself, a relationship, a shared practice, an institution, material conditions, a wider system; questioning the premise.                                                        |
| Scale and subject          | Intimate, household, local and larger concerns; material, cultural, technological, ecological and interpersonal changes.                                                                  |
| Desired direction          | Removing a burden, creating a possibility, recovering something lost, preserving something threatened; wishes that conflict.                                                              |
| Experience and situation   | Different work and income conditions, caring responsibilities, housing, health, access, education, life stages and places of residence. Include comfort and capacity as well as hardship. |
| Relationship to the change | Directly affected, observing, responsible for part of the problem, already trying something, benefiting from the current arrangement, uncertain about consequences.                       |
| Limits on acting alone     | Time, money, knowledge, permission, other people's choices, coordination, institutional control, conflicting interests, or an unclear obstacle.                                           |
| Relationship to others     | Wanting help, expertise, solidarity, delegation, accountability, space or fewer obligations; willingness, reluctance or inability to participate.                                         |
| Knowledge and certainty    | Specific practical knowledge, partial understanding, conviction, speculation, questions, contradictions and changes of mind within an answer.                                             |
| Tone                       | Hope, irritation, humour, affection, anger, resignation, enthusiasm, embarrassment, detachment or mixed feelings. Quiet accounts need not be trivial.                                     |
| Form and register          | An anecdote, a direct wish, an abstract reflection, a proposal, a question, a list, a tangent or unfinished reasoning; everyday, technical or political vocabulary when plausible.        |
| Speaking habits            | Different sentence lengths, directness, repetition, self-correction, concision, rhythm, fluency and use of the optional prompts.                                                          |

Check whether model defaults repeatedly couple these dimensions. An articulate
person need not favour collective action; a hesitant person can have precise expertise.
People with similar backgrounds can disagree. The same desired change can arise
from different motives. Do not pair each social identity with one issue, tone,
political view or level of English, or attempt to cover every combination.

Demographic context can help establish a situation, but it is not a substitute
for a perspective. Use it sparingly and do not make every person introduce a
biography. Avoid accent spellings and deliberately broken English as markers of
identity. Natural differences in expression do not require caricature.

Leave room for broad answers, modest wishes, implausible proposals, uncertainty,
refusal and complaints with no solution. Do not require every voice to supply a
concrete incident, a nuanced counterargument, an organising plan or a satisfying
ending. Those requirements would narrow the agreed invitation.

## Assignment design

The [design file](../examples/contribution-design.json) specifies 64 slots and
explicit counts for each option. These are chosen rehearsal proportions, not
estimates of a festival audience. Each slot gets an assignment on 12 dimensions:
interpretation, scale, relationship to the issue, relationship to acting with
others, clarity, tone, form, register, fluency, rhythm, loose length guide and level of abstraction.
Most dimensions include an `open` option. The number of options follows the
subject, rather than being forced into powers of two.

The design also contains 12 coherent background situations, with sixteen open backgrounds and four to six slots for each specified background. These provide context without specifying an actual wish or
writing an argument. Repeated contexts permit different responses to related
circumstances. One background is open; it leaves the circumstances to the model.
An open background still receives dimension assignments. This replaces the
previous proposal for wholly unseeded contributions.

The assignment algorithm:

1. Expands the declared counts into bags of situation and dimension options.
2. Shuffles using the recorded integer seed (`20261105` in the prepared design).
3. Matches each dimension's options to slots while respecting situation-specific
   compatibility rules. The revised design has no background-based restrictions: any person can care about any scale or interpretation.
   Infeasible counts cause an error; the generator does not relax them silently.
4. Tries 6,000 seeded swaps of one dimension between two slots. Each swap keeps
   counts and compatibility intact. It accepts a swap only if the total number
   of repeated pairs of dimension options does not increase.
5. Builds a nested selection order, rewarding options not yet represented and
   then options that are less represented. Ties use a seeded order. Open options
   receive half the weight of explicit options, because they leave the final
   choice unresolved. Prefixes of this order define subsets of 8, 16, 32 and 64.

The repeated-pair score sums `n × (n − 1) / 2` over every observed option pairing
for every pair of dimensions. It is an assignment diagnostic, not a diversity
score for writing. The local search does not guarantee an optimum, independent
traits, all possible combinations or statistical representativeness. Compatibility rules remain supported, but the current design leaves them empty. Background
situations themselves are excluded from the swap objective; inspect their
relationships to the assigned traits in the saved slots.

The pilot is chosen for breadth rather than proportional sampling. In the
prepared eight, the coverage report records the selected interpretations, tones,
answer forms, scales and levels of abstraction. Some options are absent; see the
actual counts in the [pilot review](../examples/contribution-pilot/review.md).
Subset comparisons change both participant count and composition.

## Prepare and inspect the pilot

Run from the repository root with the pinned runtime. Offline preparation and
checking need no model key, running provider or network. Existing output
directories are never overwritten.

The committed preparation is in
[`examples/contribution-pilot/`](../examples/contribution-pilot/review.md).
Its [bundle](../examples/contribution-pilot/bundle.json) contains the full design,
model configuration, 64 slots, nested subsets, marginal and pair counts, and the
exact eight model requests. The review file presents the counts, selected
contexts, private directions and common authoring prompt for reading.

Check that the bundle reproduces exactly from its recorded inputs:

```sh
mise exec -- pnpm corpus check --bundle examples/contribution-pilot/bundle.json
```

To regenerate into a new directory:

```sh
mise exec -- pnpm corpus prepare \
  --design examples/contribution-design.json \
  --config examples/contribution-generator.json \
  --out runs/contribution-preparation-v1
```

Preparation never imports a provider for dispatch. Its output has no timestamps,
so identical inputs and algorithm versions produce an identical bundle. A SHA-256
fingerprint covers the preparation. The checker recomputes all assignments and
prompts, not just the checksum. Editing a prepared request or changing a model
without regenerating fails validation. The fingerprint detects changes; it is
not an authorisation signature.

The [generator configuration](../examples/contribution-generator.json) uses the
selected writing model, `openai/gpt-6.1-terra`, with reasoning
`none`, at most 1,024 output tokens per request and a 120-second timeout. This is
the same model for all eight requests. Temperature is omitted, leaving the
provider default; there is no provider sampling seed. The assignment seed only
reproduces the slots, not the model's prose. To change model or settings, edit the
configuration and prepare a new bundle. Model availability has not been tested
by this offline preparation.

Before running, read the eight requests for contextual plausibility. Treat the
assignments as background rather than traits that must all be conspicuous in
speech. They must not become extra participant-facing questions. Keep the
existing eight-person historical score out of generation prompts.

## Run the first eight when ready

This command is the boundary between preparation and real model use. It will
send the eight frozen requests to the configured provider and can incur cost.
For the supplied configuration, set `OPENAI_API_KEY` in the environment or the
ignored `.env` file. Hosted tracing remains disabled by the existing model
adapter. The preparation task stops before this command.

```sh
mise exec -- pnpm corpus pilot \
  --bundle examples/contribution-pilot/bundle.json \
  --out runs/contribution-pilot-v1
```

The runner makes at most eight sequential requests, each with fresh system and
user messages. No contribution sees another contribution, a collective output,
or composer instructions. There is no automatic retry, continuation, model
fallback, model download or expansion to all 64.

Each run creates its own directory and freezes the bundle before dispatch. The
append-only `events.jsonl` saves request starts, streamed prefixes, completed text,
reported token usage and sanitised failures. Only one invocation can create that
directory. Ctrl+C or a provider failure stops further requests; completed texts
and streamed prefixes remain available. A failed run exports no score. There is
no resume command in this first slice: inspect the saved results before deciding
whether to start a separate run, which would make fresh requests.

After eight completed responses, `contributions.json` contains the raw texts,
word counts and review flags with status `awaiting-editorial-review`. A separate
`score.json` contains only neutral IDs, display names matching those IDs, and
spoken texts. It uses the existing score format with `chunkPercent: 100`. Private
backgrounds, dimensions and review labels never enter this score. Generating the
score does not run a composer or establish that the writing is suitable.

Counts below 80 or above 180 words and exact repeated texts are flagged for
review, not silently rewritten. Empty output, provider token truncation and
stream/result mismatches fail the request. Raw provider error bodies and
credentials are not saved.

## Review before expansion

Read the pilot contributions without consulting the private assignments first.
Look for natural differences in thought and expression. Then compare the texts
with their assignments and inspect repeated openings, stock endings, identical
three-part answers, compulsory hesitation and automatic endorsements of acting
together. Read a range aloud using the timing guidance above.

Revise the design or common prompt if it repeatedly causes a problem. Preserve
acceptable variation and keep raw drafts and reasons for revisions. If the
common prompt changes, record which version produced each retained contribution.
Do not retrospectively claim identical generation conditions.

Only after the pilot review should generation expand to the remaining 56 slots.
The nested subsets and assignments are ready, but this implementation deliberately
runs only the first eight. Later expansion needs a separate explicit operation.
Freeze the resulting source corpus before comparing representation approaches;
do not adapt the source to make a preferred composer perform better.

## Deliverables and review

The pilot runner starts these records; the full corpus will retain the same separation:

- **Contributions:** exactly 64 unique IDs and their final English texts,
  explicitly labelled as LLM-generated fiction in the enclosing corpus.
- **Generation record:** model and prompt versions, private contexts, settings,
  raw drafts, edits and available usage information. Do not store credentials
  or hidden model reasoning. Only spoken texts and neutral IDs go to the composer;
  private contexts and review labels never do.
- **Review note:** word-count distribution, timing checks actually performed,
  examples of variation and overlap, unresolved weaknesses, and changes made.

Keep this corpus separate from the historical example score. The new corpus
commands use their own preparation format and leave existing experiment
configuration unchanged.

Before freezing, confirm:

- All 64 IDs are present once, with non-empty English contributions and no
  accidental exact duplicates or leaked generation instructions.
- The generation prompts preserve the agreed invitation and optional status of
  the supporting questions.
- Lengths are reported as a distribution. Outliers have been inspected rather
  than automatically padded, truncated or rejected.
- Variation exists in interpretation, experience and expression, with concrete
  examples recorded in the review note. Different topics alone are insufficient.
- Recurring concerns and contrasting reasons remain; the set has not been
  edited into 64 unique positions or balanced ideological camps.
- No common essay structure, repeated stock ending or identity stereotype
  dominates the set. Record remaining model tendencies rather than claiming
  human realism from a favourable model review.
- Fictional provenance and the separation of private context from spoken text
  are explicit. No claim of participant satisfaction accompanies the corpus.

## Research informing the design

The speaking sources above motivate a loose length estimate. The invitation's
rationale is recorded in the [piece brief](rehearsing-we.md#current-test-question).

[Kambhatla, Shaib and Govindarajan (2025)](https://arxiv.org/abs/2505.17390)
find that persona prompting can increase lexical diversity, but detailed persona
descriptions offer limited additional gains in their tests, and synthetic
prompts remain less diverse than human-written ones. Their study concerns
lexical diversity, not this performance or the full range of human experience.
It supports inspecting outputs rather than equating elaborate profiles with
successful diversity. Structured assignments, isolated generation and the review
procedure here are design choices, not a validated recipe.

## Revision after the first Terra pilot

The first eight overemphasised immediate personal and local concerns. The original
scale counts assigned 48 of 64 slots to intimate, household, group or local
concerns, eight to a wider scale and eight to an open scale. Background rules also
excluded systemic interpretations for some ordinary life situations. These were
authoring restrictions, not evidence about the audience.

The revised design assigns four intimate, four household, eight group, eight local,
sixteen national, sixteen global and eight open scales. These are exploratory
design weights, not demographic estimates. It adds a separate abstraction
dimension: 24 concrete, 24 mixed and 16 broad answers. Broad values and wishes
need not become anecdotes or actionable projects. Systemic and cultural
interpretations receive more slots; open backgrounds increase to sixteen.

All background compatibility restrictions are removed. A carer or a person
learning English can speak about national politics, climate or living with
difference. The common prompt now explicitly allows the subject to differ from
the assigned circumstances. Specific issues and positions are still chosen by the
model; climate change and fascism are motivating examples, not mandatory topics.

The broader-scope revision used `contribution-v3` and was prepared without generation. The original Terra run and its frozen v2 bundle remain
unchanged in `runs/contribution-terra-pilot-v2/`. No new model calls were made for
that revision.

## Spontaneous-answer pilot

Authoring version `contribution-v4` asks for answers developed on the spot. It
allows a broad start that finds a focus, movement between concerns, revision and
unresolved thoughts, alongside people who already know what they want to say.
This is variation in how thought develops, not compulsory fillers or language
errors. Cultural specificity is acceptable and is not a rejection criterion.

The revised scope assignments are unchanged from the broader-scope preparation.
The example bundle now uses v4. The authorised eight-contribution Terra run is
`runs/contribution-terra-spontaneous-v1/`; its frozen bundle and raw outputs are
kept separately from the first pilot. Changes in both assignment design and
authoring prompt mean this is an exploratory revision, not an isolated comparison
of prompt effects.

The v4 run completed all eight responses. The reading copy and editorial review
are in `runs/contribution-terra-spontaneous-v1/reading-and-review.txt`. The broader
political scope is visible and some speakers revise their focus, but the accounts
still have consistently orderly structure. They remain provisional synthetic
inputs, without read-aloud timing or participant validation.

## Controlled prompt comparison

The next experiment uses p002 (political discourse) and p025 (climate adaptation),
both broad answers whose uncertainty became a tidy argument. It freezes a short
starting concern for each case across all conditions, without showing the original
prose. Its freshly generated baseline therefore includes a topic cue absent from
the earlier pilot. The earlier output is context, not a matched control.

Three binary factors form eight conditions per case:

- **Unfinished minute:** replace the one-minute instruction with the first minute
  of a response, allowing an unfinished thought without forcing a cutoff.
- **Sparse assignments:** retain scale, abstraction, length, clarity and way of
  answering; omit the other seven dimensions. Circumstances stay fixed.
- **Thought development:** replace the way-of-answering assignment with a path.
  p025 starts broadly and discovers a focus; p002 moves among related concerns
  without necessarily choosing one. This factor tests those specific alternatives,
  not every possible thought path.

Each participant-condition cell receives two independent drafts: 32 requests in
a recorded shuffled order. Model, reasoning, output limit, invitation, topic cue
and circumstances are fixed. There is no provider sampling seed. The plan,
execution script, streamed journal and raw results live in
`runs/contribution-factorial-v1/`. No production corpus settings are changed.

Review assesses developing thought, rhetorical closure, surface hesitation,
remaining on topic and plausible length. Read generated texts under opaque IDs
before consulting condition labels; this only partially masks the review because
the reviewer designed the prompts. Two drafts help expose sampling variation but
cannot establish a reliable effect size or statistical significance.

The factorial run completed 32/32 responses, with 17,104 input and 7,041 output
tokens (estimated standard cost USD 0.052309 before tax and caching discounts).
See `runs/contribution-factorial-v1/findings.txt` for the editorial comparison
and `comparison.txt` for every raw response grouped by case and condition.
Sparse assignments had the clearest visible effect, partly through removing
required roles and constructive endings. The unfinished-minute instruction alone
made little difference. Thought-path benefits were more apparent for political
discourse than climate adaptation. These are exploratory observations, not a
validated ranking of prompts. The default corpus design remains unchanged.

## Human voice-note request as sent

Recorded on 5 November 2026. The following is the exact request sent for the
human reference contributions, preserving its wording and paragraph structure.
The final question was **bold** and hidden with the **spoiler effect**, so
recipients could reveal it when ready. The question is shown openly below for
reference; the spoiler formatting is part of the delivery record.

> Hi! I'm making a performance where we make a superintelligence out of a room full of strangers. Would you like to help me develop it by sending a one-minute voice note?
>
> I'll use the transcript to help generate fictional contributions for testing that reflect how people actually think aloud. It's only for development and won't be used in the performance. I'll use local AI to transcribe it and, if needed, translate it. I may then send a transcript with identifying details removed to a cloud AI service. I won't publish your recording or transcript.
>
> You can answer in whichever language feels most comfortable. Aim for roughly a minute.
>
> When you're ready:
>
> 1. Click to reveal the question.
> 2. Record straight away, without preparing.
> 3. Send your first take.
>
> **What is something you’d like to change, but can’t change on your own?**

## Recognition and representation research

See [the research note](recognition-and-representation.md) for evidence on feeling
heard, disagreement, subjective validation and collective statements. Recognition
and grounded representation are distinct; the participant-centred criteria are
not yet settled. The note records the fixed, input-independent
[recognition control](../examples/recognition-control-v1.txt) and its provenance.

## First comparison using human contributions

On 5 November 2026, three human transcripts were frozen locally and used for an
initial static comparison under the
[collective voice criteria](collective-voice-criteria.md). Original and corrected
sources are in `runs/human-contributions-2026-11-05-v1/`. The comparison record is
`runs/human-comparison-2026-11-05-v1/`; these folders are excluded from Git.

The corrected Spanish contribution was translated by the installed local
`qwen3.5:9b-q4_K_M` model with thinking disabled. The main assistant reviewed the
translation and made one British spelling adjustment, recorded separately.
Two fresh `gpt-6.1-terra` API requests, reasoning disabled, then used identical
English inputs and shared instructions, differing only in the writing brief:
straightforward condensation or freer composition. Neither saw the other output,
the horoscope, the criteria document or this conversation. Raw outputs were
retained without rewriting.

The resulting passages were 153 and 152 words; the fixed horoscope v2 was 149.
Reported API usage was 1,422 input and 936 output tokens, an estimated USD
0.006102 at standard rates before tax and caching discounts. The locally generated
translation incurred no cloud API charge. This is not a billing receipt.

`reading-copy.txt` contains all three passages without the assessment.
`assessment.txt` records a judgement, textual evidence and limitations for each
of the five core criteria, plus the diagnostics. `plan.json` preserves the exact
API requests; `manifest.json` records hashes and provenance.

The freer brief produced only a modest change from the condensation: both
largely retained a sequential summary structure. Some transitions also expanded
individual wishes into collective positions. These observations justify further
work on composition and attribution, not a model ranking. Recognition and
belonging remain untested with the contributors; performative comments are based
on text, without a timed or audible reading. The same assistant designed and
assessed the comparison, so this is not independent evaluation.

This three-person test allows close inspection but does not establish selection
quality at 64 or 100 contributions. Losing a qualification at that scale is not
automatically distortion; assess the resulting meaning and patterns of attention.
The small-group level of detail is not a universal coverage requirement.

## Correction: the collective is the speaker

The creator rejected the first comparison’s default division into individual
positions. The existing artistic brief already required a collective utterance;
the experiment over-weighted attribution safeguards and produced reports about
the group. Its assessment also wrongly treated collective phrasing itself as
evidence of unsupported agreement. A concern originating with one person can
become part of what “we” say. Assess consequential distortion and erased
differences, rather than requiring separate endorsement of every sentence.

The corrective run is `runs/human-comparison-2026-11-05-v2/`. Two fresh Terra API
requests used the same frozen contributions and settings, with revised common
instructions and writing briefs. This is a corrective iteration, not an isolated
single-variable comparison. The horoscope remains unchanged as a frozen control.
An initial failed sandboxed attempt is retained separately; the explicit rerun
completed both outputs, at 156 and 151 words.

Both now speak as “we”, but still largely sequence the three concerns. This
corrects the perspective without establishing successful collective composition.
See `reading-copy.txt` for the texts, `review.txt` for the editorial findings and
`plan.json` for the exact requests. No participant feedback or audible reading
has been collected. The original run and assessment are preserved, with a
correction appended to the assessment.

## Recovering the compositional baseline

The subsequent [prompt experiment protocol](collective-prompt-experiments.md)
crosses prompt wording with direct and planned composition, then records the
rapid iterations and the conditions for accepting a provisional baseline.

The creator challenged the sequential static outputs: a three-person baseline
should already compose a collective voice, as earlier dynamic experiments had
attempted. Inspection of `src/live.ts` and `src/composition.ts` showed that the
static experiment had replaced an explicit compositional operation with a
condensation/composition distinction and extensive attribution instructions.
The established prompts ask for a new thought from a connection or tension,
spoken from within the contributions’ differences.

The saved Terra run
`runs/composer-pilot/luna-8187bb58-d934-4063-ae4f-c95b1f8827ca/eight-1-terra.jsonl`
was inspected in full. It connects participation risks across housing and work,
among other relationships. It is evidence of prior compositional behaviour,
not a matched comparison with these human accounts: its fictional sources,
arrival structure and prompt differ.

`runs/human-baseline-2026-11-05-v3/` preserves two fresh API requests adapting
that compositional task to complete input and roughly one minute of output.
Both still place waste and political hatred in separate blocks within a frame
about collective confidence. This is not yet an adequate compositional baseline.
The subsequent lean prompt in `runs/human-baseline-2026-11-05-v4/` asks source
material to change, sharpen or complicate a developing thought, with fewer
explanatory safeguards. This is an adaptive prompt iteration, not a
preregistered confirmation experiment. Neither prompt supplies a preferred
connection between the particular human contributions.

The first v4 request failed without returning text; an explicit identical retry
is retained in `runs/human-baseline-2026-11-05-v4-retry/`. Its two outputs develop
relationships but each omits one of the three inputs. v5 adds only a requirement
that consequential material from each account shape this small-case composition.
This restores coverage but also restores much of the topic-block structure.
All six completed outputs, the failed attempt, prompts and reviews are retained.
`runs/human-baseline-2026-11-05-v5/all-iterations.txt` collects the outputs.
None of these prompts is accepted as the baseline. No production composer
behaviour was changed.

A next candidate is to separate choosing and developing a relationship from
writing its spoken form, with original inputs available at both stages. Static
input removes the arrival deadline; it does not require a single generation
call. This is a proposed follow-up, not evidence that a planning stage works.

## Fourth human contribution and scale ladder

The fourth English TXT/SRT pair supplied on 5 November 2026 was copied unchanged
into `runs/human-contributions-2026-11-05-v2/`, with file hashes and source paths.
TXT and SRT wording match after whitespace normalisation. The SRT ends at
57.23 seconds; this is a cue endpoint, not a measured audio duration. No audio
was supplied or new transcription/translation performed. The four-input English
working set is `inputs-english.json` in that directory; earlier frozen tests are
unchanged.

The [rapid screening protocol](collective-screening.md) tests 4, 8, 16, 32 and
64 fictional contributions, plus the four-human diagnostic. Each size matters;
tiny-group difficulties are not used as a gate that all larger-group work must
pass first. The same 64-slot design and contribution-v4 instructions were used
to complete the fictional corpus, reusing the original eight outputs. The final
corpus is `runs/contribution-64-screen-v1-complete/contributions.json`.
All 56 newly generated contributions and earlier failed harness attempts remain
recorded. The failures revealed concurrent budget-wrapper and ledger-lock limits,
not provider content failures; the reusable runner now serialises ledger changes
while model requests remain parallel.

The initial screen is `runs/collective-scale-screen-v1/`: eight prompt mechanisms
across six cases, 48 completed final passages and 66 model calls. Prompt maps,
private authoring assignments and reviews are kept out of composer source data.
The four human accounts are not used to generate the fictional corpus. These are
screening materials, not validated simulations of human behaviour or participant
recognition.
