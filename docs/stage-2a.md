# Stage 2A: responsive terminal rehearsal

The [3 November local rehearsal record](stage-2a-rehearsal-2026-11-03.md)
documents the completed three-round exchange, verification and observed limits.

## Purpose

Stage 2A gives eight fictional participants independent model calls to share
and develop their own positions. The latest accepted collective passage is
available context. A participant can engage with it when useful, continue their
own thought or introduce another concern from their circumstances. This is a
round-based experiment: every participant completes one actual text response
before the composer runs.
It does not implement continuous streams, projection or live participation.

The [scenario](../examples/simulation.json) uses the same collective-power topic
and everyday situations as the Stage 1 score: Sam's shift rotas, Leah's rented
flat, Chris's bus, Nadia's school club, Ben's delivery pay, Rosa's housing co-op,
Alex's mother's care and Mo's library campaign. These are original fictional
demonstration contexts, not the user's actual source pieces or real recordings.

Each participant's `background` is private initial context, not a prewritten
response to be read out. `perspective` supplies motivations, tone and practical
limits. There is no mandatory thematic agenda or synchronised progression.

## Prepare the models

Complete the [repository setup](../README.md#set-up). Start an Ollama service
with an already installed model, or prepare an OpenAI account and API key.

```sh
mkdir -p runs
cp examples/simulation-ollama.json runs/simulation-config.json
```

Edit both model names in `runs/simulation-config.json`: `composer.model` and
`simulation.participants.model`. Replace each placeholder with an installed
model's exact name. The two roles can use different models. Both local roles
set `think: false`, allow 256 output tokens and time out after 120 seconds.
Optional `baseUrl` selects a different service address for each role; Ollama
defaults to `http://127.0.0.1:11434`.

For cloud calls, copy `examples/simulation-openai.json` instead, replace both
cloud placeholders and set `OPENAI_API_KEY` in the environment or ignored `.env`.
Both cloud roles allow 1024 output tokens, including reasoning tokens, and time
out after 120 seconds. Keep credentials out of scenarios and configuration JSON.
No model downloads or automatic provider fallback occur.

## Run and recover

Start a manual rehearsal:

```sh
pnpm cli simulate --scenario examples/simulation.json --config runs/simulation-config.json
```

Enter advances one round. `q` pauses. Ctrl+C interrupts an in-flight attempt;
completed participant responses remain saved. Resume the printed run path to
continue without regenerating responses that already completed.

```sh
pnpm cli resume --run runs/session.jsonl
pnpm cli replay --run runs/session.jsonl
```

Replace `runs/session.jsonl` with the printed path. Replay displays saved inputs
and accepted collective passages without contacting either model or needing
credentials. Standard resume and replay apply to scripted and simulation runs.
Use `--out <new.jsonl>` on `simulate` to choose a new log path; existing files
are never overwritten.

Add `--auto` to `simulate` or `resume` for automatic rounds. The example waits
1000 ms between rounds and stops after three rounds. `simulation.concurrency: 1`
limits participant generation to one call at a time. In automatic mode, use
Ctrl+C to interrupt and pause; `q` is a manual-prompt command. This serial call order does
not give later participants access to earlier participants' responses.

To compose again from recorded participant responses, create a separate rerun:

```sh
pnpm cli rerun --run runs/session.jsonl --config runs/other-composer-config.json
```

Replace the configuration path with a prepared composer configuration. A
simulation rerun makes no participant calls. It freezes recorded responses and
builds a new collective history, labelled as recorded input. It includes only
rounds in which every participant has completed a text response, including
rounds awaiting a successful composer attempt. An unfinished round with partial
responses is excluded; those responses remain in the original source log.

Recorded `respondingToPassageId` links identify the original collective passage
available as context, not proof that a participant directly replied to it.
These links remain unchanged in a rerun. The source scenario and settings
remain frozen in the run record; a configuration override changes the composer.
The recorded responses were generated in the original run's context.
Start a new `simulate` run to generate new participant contributions.

## What each model receives

Every participant in a round sees the same previous accepted collective passage,
or the opening invitation when none exists. A participant also receives their
own private perspective, background and bounded recent turn history. They do
not see peers' raw responses, private perspectives or backgrounds.

The composer receives every participant's completed text and its bounded recent
collective history. It does not receive participant backgrounds or perspectives.
Stage 2A has a round barrier and no percentage cuts: participants finish their
responses before the composer receives them.

Empty, truncated or failed participant generations are errors. The round waits
for one actual text response from every participant. Completed responses remain
saved while unfinished work is retried.

Whether participants maintain mostly independent threads or sometimes engage
with the collective is a rehearsal hypothesis, not an established finding about
human participation. Stage 2A sets no engagement parameter or required reply
rate. Judge whether the optional shared context changes what people contribute
without turning every round into a scripted reaction or full conversation.

The example configuration retains up to three recent turns per participant
within a 6000-character history budget. Composer history is separate: up to six
recent accepted collective passages within 12,000 characters. Model output token
settings are resource ceilings, not requested speaking lengths. Provider-reported
token-limit cutoffs are not accepted as complete speech.

## Rehearsal checks

These are checks to perform, not a claim that a real local or cloud rehearsal
has already passed.

1. Run three manual rounds. Look for participants developing their own positions
   and practical concerns. Note when shared collective context is useful, when a
   participant continues an independent thought and when a direct engagement
   feels forced. No particular balance is required.
2. Compare perspectives. Check that practical constraints remain different and
   no participant claims knowledge of another participant's private context.
3. Pause, resume and replay. Confirm saved responses and accepted passages remain
   unchanged. Repeat replay with both services stopped and no API key.
4. Interrupt during participant generation. Resume and confirm completed responses
   are reused while unfinished work is retried.
5. Exercise empty, truncated and failed participant generations with deterministic
   model doubles. Confirm unfinished work remains retryable and the composer
   waits until every participant has completed a text response.
6. Try automatic mode. Confirm the maximum rounds and pause behaviour before
   leaving it running for a rehearsal.

Record run paths, both model identifiers, changed settings and observations.
Automated doubles can verify ordering, recovery and complete-round admission;
they cannot establish artistic quality. Record real-provider results separately, then stop for
operator feedback before Stage 2B.

Stage 2B is a future continuous-stream experiment. It will admit rough sequential
text as it becomes available, without waiting for complete responses or assuming
known final lengths. Projection remains Stage 3, after that experiment.
