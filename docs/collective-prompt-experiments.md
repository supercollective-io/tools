# Static collective voice: prompt experiments

Working protocol, 5 November 2026. Develop a useful baseline on the three human
contributions before scaling. Use the existing
[collective voice criteria](collective-voice-criteria.md); this is a practical
screen, not a validated scoring instrument.

## Goal

A roughly one-minute voice speaking as “we”, in which contributions acquire
meaningful relationships and carry as much of their range as the passage can
meaningfully hold. A participant's meaning may shape a question, qualification,
tone or direction without receiving a separate mention. No participant-count
rule, topic checklist, prescribed connecting theme or compulsory agreement.

## First experiment

Cross three prompt emphases with two methods. Keep model, original inputs,
shared faithfulness instructions and requested final speaking space fixed.

| Prompt      | Emphasis                                                                                                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connection  | Develop a connection or tension; adapted from the existing composer.                                                                                                                                                                           |
| Range       | “Compose a developing collective thought that carries as much of the range of contributions as it meaningfully can. Let connections bring different perspectives into the same thought, while keeping consequential differences intelligible.” |
| Development | Let contributions sharpen, complicate or redirect one another.                                                                                                                                                                                 |

Each prompt generates directly, and through a short composition plan followed
by writing. Both stages see the original contributions. Planning is an
experimental condition, not the assumed solution. It adds computation as well
as an intermediate text; an advantage would not isolate which caused it.

Start with one draft per cell: six texts, nine API calls. Use Terra with
reasoning disabled, as in the earlier static experiments. The exact prompts,
settings, inputs and requests are saved in the private run directory
`runs/collective-prompt-screen-2026-11-05-v1/`. Failed attempts and all outputs
remain available. No generated human-derived passages belong in public docs.

## Assessment

Assess the final text before using its plan to diagnose a failure. Keep concise
judgements with specific output passages and source evidence. Use clear, mixed
or weak where helpful; do not add them into a total score.

1. **Collective composition:** What thought develops through the relationships?
   Does material change what we can say, or merely appear in successive blocks?
   Paragraph boundaries and topic order alone do not settle this judgement.
2. **Range and recognition opportunities:** Which consequential meanings shape
   the text? What is absent, diluted or only named? A broad sentence counts only
   if its meaning connects to the sources. Examine repeated exclusion across
   drafts without imposing equal mentions or universal inclusion.
3. **Faithfulness and plurality:** Identify changed meaning, flattened stakes,
   erased uncertainty, invented shared experience, decisions or agreement.
   “We” alone does not imply unanimity. Allow interpretation and new connections;
   distinguish them from source claims. Do not invent a conflict to test plurality.
4. **Spoken quality:** Is it followable and worth hearing as a collective voice?
   Word count is a guide. Text review indicates potential; read finalists aloud
   before claiming they work in delivery.

Recognition and belonging remain participant questions, not model scores. These
three accounts do not strongly test direct opposition between participants.
The prompt author also reviewing outputs is a limitation: creator review of
finalists is required before treating artistic fit as accepted. Show finalists
under opaque labels before revealing their prompt/method when practical; this
reduces preference cues but does not make familiar material fully blind.

## Iteration and stopping

Repeat up to two promising conditions twice, unchanged. For each next revision,
record the observed failure, the proposed explanation, and one change to test.
Change wording and method in separate comparisons. Do not rewrite raw outputs,
select only a favourite, or change the success rule after seeing results without
recording that amendment. When results are mixed, retain the uncertainty.

A **provisional baseline ready for creator review** requires:

- At least two of three drafts clearly develop a collective thought and carry
  a meaningful range, with evidence for both judgements.
- No serious meaning distortion, invented agreement or shared biography in any
  of those three drafts; no recurring disappearance of a perspective hidden by
  fluent generalities. An omission is examined, not automatically disqualifying.
- The remaining draft's weaknesses are recorded, rather than hidden. If it
  reverts to a catalogue, the method is not yet consistently usable.
- Finalists are intelligible on an actual aloud reading, and the creator finds
  the result suitable as a baseline for the piece.

These are practical screening thresholds, not estimates of reliability. A
baseline is not evidence of participant recognition or success at 64/100 inputs.
Freeze a promising prompt and check fresh generations with reordered inputs
before expansion; judge meaning and quality, not identical wording. Use new
human contributions as a later transfer test rather than tuning indefinitely to
these three. Participant feedback then tests recognition and belonging.

If no condition is promising, identify the common failure and run a small next
comparison. Do not expand the matrix or add a pipeline merely to keep searching.

## First rapid screen: findings

Fourteen final drafts were generated through 17 successful Terra calls. All
source inputs stayed fixed. The private records are
`runs/collective-prompt-screen-2026-11-05-v1/`, `v2/` and `v3/` under that same
directory naming pattern. Each has exact requests, raw outputs and assessments.

- **v1: three prompts × two methods.** All six remained largely sequential.
  Planning did not establish an advantage; a locally stronger connection in
  one planned draft did not carry through the whole passage.
- **v2: add a performance-monologue instruction.** Range and development each
  ran twice, directly. This mainly added questions to the same block structure.
- **v3: shorten the common instruction block.** The same four conditions ran
  again with only shared instructions changed. Development produced more
  interesting relationships, including questioning whether confidence precedes
  action. Separate topic blocks persisted, and unsupported phrasing appeared.

The development direction is a candidate for further work, not an accepted
baseline or a statistically established winner. Direct generation remains the
reference; this screen does not justify adopting an extra planning stage.
Neither recognition nor belonging has been tested with participants. No actual
aloud reading was performed. The prompt author assessed the drafts, unblinded.

The v3 `review-pack.txt` contains three texts under opaque labels for creator
calibration: a range-prompt reference and two development candidates. Selection
is deliberate to show the trade-off; all 14 outputs remain available. The
separate `review-key.json` identifies their conditions. The next revision should
target development through the whole passage while retaining source meaning,
rather than introduce another participant-count requirement.

## Diagnostic: earlier versus human inputs, dynamic versus static

The creator requested a comparison to explain why earlier dynamic writing
appeared stronger. The frozen design and full private record are in
`runs/static-dynamic-diagnostic-2026-11-05-v1/`.

Two repetitions of each of four conditions completed: eight outputs through
24 API calls. All used Terra with reasoning disabled and the same 4,096-token
per-request ceiling. Dynamic conditions used the actual existing controller,
five admissions of 20% of each source's characters, and the original saved
configuration. The first earlier-source request exactly matched the historical
reference, including model settings. All dynamic input prefixes were verified.
Static conditions used the same frozen current development prompt and complete
input in one call. No further wording was tuned during this comparison.

| Inputs                           | Dynamic process                                                                         | Static process                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Earlier eight fictional accounts | Both develop connections between participation, control, responsibility and risk.       | Both also make meaningful connections; the first is more example-led.                   |
| Three human accounts             | Both remain largely additive, gathering different concerns under collective confidence. | Mixed; the second develops a relationship more substantially than either dynamic draft. |

This repeated pattern points away from a general static-generation disadvantage
and towards a substantial source-set difference. The earlier fixture provides
closely related tensions across accounts; the human inputs combine more distant
concerns with a broad account of collective capacity. That explanation remains
an interpretation: topic breadth, invitation, number of contributors and writing
style change together. The comparison does not isolate any one of them.

The workflow factor also bundles prompt, continuation, input availability and
number of calls. The historical dynamic reference is frozen-source replay, not
responsive participant interaction. Mean source lengths were similar (140.9
versus 138.0 words); final outputs ranged from 135 to 164 words. The difference
is not explained by a dramatically larger output allowance.

The same assessor applied the same criteria across all cells, unblinded. Some
static human writing develops interesting relationships but still introduces
unsupported specificity. No baseline has been artistically accepted, read aloud
or tested for recognition with participants. See `findings.txt`,
`assessment.json` and `reading-copy.txt` in the run directory. Full-input static
composition remains viable; these results do not justify restoring an
incremental pipeline as the presumed solution.
