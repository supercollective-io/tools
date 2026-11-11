# Composer comparison — 4 November 2026

## Decision

Keep the baseline instructions as the comparison control. Use **Terra with no
reasoning** for fast development, **Sol with low reasoning** as an alternative,
and **Astra with high reasoning** as the frontier reference. A fresh blind review
modestly preferred Terra and Sol with the candidate instructions. Carry those
candidate prompts into the next, longer comparison alongside the baseline;
the evidence does not yet justify a permanent prompt or performance-model choice.

All three cloud models produced approximately one person's speaking space,
preserved consequential differences and developed the writing without acting
as a facilitator. Astra was particularly precise about permission in the
correction scenario, but the strongest cheaper outputs handled that distinction
too. These short scores do not establish a material overall advantage for Astra.
Higher reasoning effort alone did not transform the writing under these prompts.

## Conditions

The primary comparison used the unchanged eight-person `examples/score.json`:
1,127 words, mean 140.875 per person, revealed in five 20% character slices.
Only the composer generated. Each cloud model ran both instruction variants
three times: **18 runs, 90 requests**. A separate four-person correction score
ran once per model and prompt: **6 runs, 30 requests**. Every one of those
120 requests ended naturally, with no token-budget finish, empty response or
unverified input snapshot. No writing was trimmed to a word quota.

Models and reasoning were explicit: `gpt-6.1-terra`/`none`,
`gpt-6.1-sol`/`low`, `gpt-6-astra`/`high`. Terra and Sol had 4096 completion
tokens per request; Astra had 8192, including reasoning, to avoid starving the
frontier reference. All used a 120 s timeout. The budget difference is a resource
allowance, not evidence of quality; none reached either ceiling. No temperature
or seed was overridden. The score, live synthesis prompt and configurable
baseline/candidate instructions were identical across cloud models.

All primary journals share input fingerprint
`e3a0ca228436429ce2bcfcb89cddf401ff80899c658d31022d5c53aba6a7254e`.
All correction journals share
`45a0df2a9072fa17c74a3e729df8416ddae68bab610da67e9bc63d646fa9a3b8`.
Configuration and normalised prompt fingerprints are in each audit. Identical
source inputs do not mean identical generated history or deterministic output.

Evidence is in ignored `runs/cloud-composer-2026-11-04/`. Primary journals follow
`<terra|sol|astra>-<baseline|candidate>-<1|2|3>.jsonl`; correction journals use
`<model>-<variant>-holdout-1.jsonl`. Each has a `-config.json` and `-audit.json`.
`runner.ts` records the execution procedure; `usage.json` records provider token
counts and conservative reservations. These files contain rehearsal writing and
are local evidence, not public exports.

## Primary results

Latency is the median of 15 request-to-first-saved-text observations per row.
It includes local saving overhead and host load, not just provider inference.
The laptop was also downloading models, with local inference overlapping the
later Astra work. This is an observed delivery comparison, not a controlled
provider speed benchmark.

| Model / instructions   | Words in three runs | Speaking-space ratios | Median first saved text | Estimated cost of three runs |
| ---------------------- | ------------------- | --------------------- | ----------------------- | ---------------------------- |
| Terra none / baseline  | 147, 155, 139       | 1.043, 1.100, 0.987   | 2.07 s                  | $0.0343                      |
| Terra none / candidate | 158, 154, 175       | 1.122, 1.093, 1.242   | 2.28 s                  | $0.0390                      |
| Sol low / baseline     | 144, 147, 143       | 1.022, 1.043, 1.015   | 4.36 s                  | $0.0763                      |
| Sol low / candidate    | 150, 148, 140       | 1.065, 1.051, 0.994   | 4.46 s                  | $0.0814                      |
| Astra high / baseline  | 142, 141, 143       | 1.008, 1.001, 1.015   | 5.65 s                  | $0.3848                      |
| Astra high / candidate | 150, 141, 147       | 1.065, 1.001, 1.043   | 6.19 s                  | $0.4065                      |

These results are much better than the earlier Gemma 96-token rehearsals for
proportion and repetition. Those runs used a different resource ceiling and
hit it, so this is not a controlled model-only comparison. Preserve the
[earlier report](composer-rehearsal-2026-11-04.md) as evidence of those conditions.

### Writing against the input available then

- Early additions usually retain the central contrast already present: gathering
  signatures can fail to change a decision, while the co-op can change its own
  contract. They do not turn all eight experiences into a single lack of agency.
- Sol baseline repetition 3 develops that contrast through bounded responsibility,
  permission to use names, differing risks of collective action, then access to
  explanations. Each addition is grounded in its current source prefixes. It is
  a useful reference for connected development without a catalogue of speakers.
- Astra baseline repetition 2, request 4, follows Ben's newly available suggestion
  of covering lost pay. It retains both the lack of spare money and the question
  of who would decide its allocation. That is a concrete development of a
  conditional proposal, rather than simply calling for solidarity.
- Astra candidate repetition 1, request 2, connects a successful school-club
  change with the burden placed on its organiser. However, request 5 compresses
  reluctance to send personal details to a fund announced in a chat into not
  trusting the fund itself. That is a small but consequential shift of emphasis.
- Some cheaper outputs also infer too freely. Sol candidate repetition 1,
  request 3, describes limited availability as different from refusing to help,
  introducing an implied accusation absent from the source. Sol baseline
  repetition 1 connects rent and affordability before Leah's later explicit fear
  of losing her home. This can be read as conditional synthesis of other available
  constraints; it is not evidence that the model saw the later text.
- Across models, repeated sentence openings and a sequence of compact points
  sometimes substitute for a more sustained argument. None of these runs is
  proof of a compelling performance text. Omitting a detail is not automatically
  a failure: the issue is whether selection changes the meaning or loses a
  condition needed by the developing proposal.

### Review blinding and its limits

The initial cheaper subagent reviewed anonymised Terra/Sol outputs before model
labels were revealed. It found no material overall winner across those repeats.
The initial Astra review was **unblinded**: its filenames disclosed the model,
and the reviewer had already seen the earlier comparison. My source-level
assessments in this report are also unblinded. Neither constitutes a blind
comparison across all models.

After that limitation was raised, a fresh subagent with no conversation history
received six randomly labelled conditions. Each contained three primary runs
and its correction holdout. It received the exact available source prefixes,
with model names, prompt variants, settings, timing, costs, journal identifiers
and original filenames removed. The identity key was stored separately. The
reviewer saved its judgement before I opened the key; it was not given the key.

The fresh review jointly preferred **Group B (Terra candidate)** and **Group E
(Sol candidate)** with modest confidence, and explicitly declined a confident
six-way ranking. This supports further candidate-prompt testing, although it
does not establish a reliable improvement or an Astra advantage. Its original
verdict is preserved in ignored
`runs/composer-blind-review-2026-11-04/blind-review.md`; `sources.json` and
`outputs.json` reproduce the anonymous material. The separate key is
`runs/cloud-composer-2026-11-04/blind-all-key.json`.

The reviewer itself has limitations. It incorrectly labels whole-run word totals
as update lengths in two sentences; the reported numbers are whole-run totals.
It also treats omission of Emil's maintenance distinction in one holdout as a
clear failure, although an omission alone does not demonstrate changed meaning
and all conditions necessarily select material. Its preference remains recorded
unchanged, with these caveats in `review-notes.md`. One blinded model review is
supporting evidence, not independent human validation or a statistical result.

## Corrections, refusals and practical limits

Interpretation updated after the creator’s clarification: the observations below
are a narrow changing-input diagnostic. Explicit correction or withdrawal is
not a central performance criterion, and an individual change need not appear.
Keep these recorded outcomes, but use the current
[performance criteria](composer-experiment.md#record-the-judgement) for model
selection. The candidate prompt used here is the version frozen in these runs;
the current example now makes selective uptake explicit.

`examples/composer-corrections.json` contains four fictional contributions,
averaging 127 words. Joan retracts an offer of weekly Saturday opening; Emil
offers translation without attendance or organiser responsibility; Saira withdraws
her name when a letter adds fee collection; Tom insists on independent access
and the council's paid responsibilities.

The slice boundaries matter. Request 3 only receives the beginning of Joan's
correction, ending before its substance. Request 4 receives the first-session-only
limit and the start of Saira's withdrawal. Request 5 receives the full requirement
to check revised wording before using her name again.

| Model | Baseline words / ratio | Candidate words / ratio | Observed response                                                                                                                                                          |
| ----- | ---------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terra | 147 / 1.157            | 155 / 1.220             | Corrects the Saturday offer in request 4; request 5 removes the withdrawn name and requires checking revised wording. Retains council payment versus resident maintenance. |
| Sol   | 133 / 1.047            | 132 / 1.039             | Baseline corrects the Saturday offer in request 5. Candidate corrects it in request 4 and explicitly rejects automatic restoration of permission in request 5.             |
| Astra | 131 / 1.031            | 131 / 1.031             | Both correct the offer in request 4 and explicitly distinguish removing the fee promise from obtaining permission to restore a name in request 5.                          |

Astra's baseline is a strong example of this authority distinction. Sol's
candidate makes it equally explicit; Terra also checks revised wording before
claiming support. This is evidence that all three can respond to these controlled
corrections, not evidence of how people will respond to the collective voice.

## Interrupted writing: observed failure and fix

The first Terra pause/resume probe saved a prefix ending `which cut we` but
resumed with a new sentence. The journal preserved every byte correctly; the
writing did not continue grammatically. Sol's initial probe joined correctly.
The original journals remain unchanged as `<model>-interruption.jsonl`.

OpenAI requests now supply the exact saved text as user-message data with an
explicit continuation instruction, including after interruption. Ollama's
unfinished assistant prefill is unchanged. The controller still inserts no
mechanical space at an interrupted join, so a word can continue character for
character. Completed-sentence appends retain their existing behaviour.

Rechecks copied each actual paused prefix into a new journal and made a fresh
continuation request. Terra appended ` can live with.`; Sol also continued
grammatically. Both ended naturally without rewriting saved characters. Evidence:
`terra-interruption-data.jsonl` and `sol-interruption-data.jsonl`. These are two
successful rechecks, not a guarantee across all possible cuts. Astra was tested
across natural stops, but has not had a separate real interrupted-prefix probe.

## Laptop comparison: Gemma, Qwen 4B and Qwen 9B

All three used the same primary score, baseline instructions, 8192-token context,
`think: false`, raw prefill support and **256-token request ceiling**, on the
M1 Pro laptop with 16 GB unified memory. An isolated Ollama service on port 11437
ran one request at a time with five-minute keep-alive. This allowed warm requests
after the first request of each model. Model groups were unloaded between runs.
The context, prompt and score were not reduced to accommodate resource pressure.

| Model                    | Completion                                    | Saved words / ratio | Median first saved text    | Reported Ollama footprint |
| ------------------------ | --------------------------------------------- | ------------------- | -------------------------- | ------------------------- |
| Gemma `gemma4:12b-mlx`   | Four EOS; fifth request paused with no output | 341 / 2.421         | 18.76 s over four requests | 8.3 GB                    |
| Qwen `qwen3.5:4b-q4_K_M` | Five EOS                                      | 588 / 4.174         | 5.98 s                     | 3.4 GB                    |
| Qwen `qwen3.5:9b-q4_K_M` | Five EOS                                      | 667 / 4.735         | 10.54 s                    | 4.9 GB                    |

Every recorded request's input snapshot verified, with the same primary input
fingerprint as the cloud runs. The normalised baseline prompt fingerprint also
matches across all three local models and the cloud baseline. The Gemma result
is incomplete and must not be ranked as if it were a complete five-step run.
All five source slices had been admitted before the pause, so its denominator
is the full mean participant length. None of the completed requests hit the
256-token ceiling; their verbosity is not an artefact of output trimming.

The first requests took 21.8 s for Gemma, 6.4 s for Qwen 4B and 10.5 s for Qwen
9B. Medians above include those cold requests. These figures describe this loaded
laptop, not isolated model throughput or guaranteed performance.

There are substantive failures as well as excessive length:

- Gemma increasingly treats different questions of control, consent and refusal
  as a general lack of capacity to organise. It adds unsupported details such as
  a quiet evening at home and a council that will not pay. Its repeated general
  framing does not respond adequately to the later practical and political limits.
- Qwen 4B repeats a long passage between requests 3 and 4, invents people wanting
  to go home to their parents and a paid library job, and ends by adopting Leah's
  individual repair offer in the first-person singular. It blends distinct source
  circumstances into a new story rather than representing them faithfully.
- Qwen 9B opens with an extended game metaphor despite the style instruction,
  invents a requirement to form a committee before receiving a response, and later
  discusses named participants as examples. Its generic compromise between
  expertise and collective control loses several concrete refusals and conditions.

Gemma caused sustained low reported free memory and substantial swap churn.
Swap usage reached approximately 13.4 GB; it was paused and unloaded, after which
reported free memory recovered to 72%. Qwen 4B completed with roughly 41% free
while loaded. During Qwen 9B, free memory remained around 15–17% and swap usage
rose to about 7.7 GB. A stop was requested, but its fifth request completed before
the pause took effect. Ollama's model footprint is not total host memory usage.
These observations are specific to the current laptop load and do not establish
an intrinsic minimum RAM requirement for any model.

No pilot warranted further repetitions: all failed the writing criteria, and
Gemma/9B also encountered resource pressure. This is a failed-pilot screen,
not a statistically supported ranking of their general capabilities. Do not
promote either Qwen model as the performance composer from these results.
The older Qwen concurrency fixture remains a separate development role; changing
that fixture would not remedy the composer failures observed here.

Local journals and audits are in ignored `runs/local-composer-2026-11-04/`:
`gemma4-12b-mlx-pilot-1.jsonl`, `qwen3.5-4b-q4_K_M-pilot-1.jsonl` and
`qwen3.5-9b-q4_K_M-pilot-1.jsonl`. Their `.composer.json` files contain every
source prefix and addition. Configurations are saved alongside them. The model
downloads remain available. The temporary service on port 11437 was stopped;
the experiment did not stop or change the pre-existing service on port 11434.

## Cost

All cloud calls together accounted for **$1.415104** against the $5 experiment
allowance. Of that, **$1.306843** is calculated from returned provider token usage
at standard uncached rates; **$0.108261** conservatively retains the full request
reservations for two aborted probes whose usage was unavailable. This is not an
invoice and does not claim measured cache savings.

Terra accounts for $0.135688 including its aborted-request reservation, Sol for
$0.278926, and Astra for **$1.000490** across its eight completed runs. There were
126 paid requests: 120 fixed-score requests and six interruption/recheck calls.
The experiment runner reserved input and full completion allowances before each
request and refused calls exceeding the total. This limiter is in the ignored
experiment script; the application itself does not enforce a dollar ceiling.

Rates used were $1/$5, $2/$10 and $10/$50 per million input/output tokens for
Terra, Sol and Astra respectively. See the dated [model research](composer-models-2026-11-04.md)
and [official OpenAI pricing](https://developers.openai.com/api/docs/pricing).

## Next rehearsal

Keep the baseline cloud configuration as the control and compare the candidate
instructions on Terra and Sol, following the fresh blind review's modest
preference. Keep Astra High available as a reference when a new scenario exposes
a failure. The local workspace default is unchanged. Next test longer, uneven
arrivals and corrections with the chosen composer,
then a small group of actual people. Generated participants remain optional
test fixtures. Their realism or convergence is not the final performance target.

## Software verification

`mise exec -- pnpm run verify` passed after real inference finished: formatting
and lint checks, TypeScript, **391 tests across 22 files**, and the production
build. Regression coverage includes exact interrupted OpenAI joins and an audit
without any recorded request. Such an audit now reports no input fingerprint,
rather than treating an empty request list as verified evidence.

Verification also exposed an older timing assumption in a continuous-mode test:
a later participant can receive collective feedback before its first request.
The test now checks that its saved history retains the feedback actually received,
rather than always expecting no feedback. An unrelated CLI test timed out during
an earlier loaded run; the final full suite passed after local inference ended.
Local documentation links and `git diff --check` were checked separately.
