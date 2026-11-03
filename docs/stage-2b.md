# Stage 2B: continuous terminal rehearsal

## Purpose

Stage 2B admits model-generated participant text while it is still arriving.
Each participant develops their own position, with the latest accepted
collective passage available as optional context. There is no round barrier:
a saved prefix can enter collective composition before its participant's
current generation finishes. Cuts follow available character positions, including
inside words or sentences. Stream lengths are unknown, so there are no
percentage cuts or semantic boundaries.

The rehearsal reuses the eight fictional people in
[`examples/simulation.json`](../examples/simulation.json). Their backgrounds and
perspectives remain private to their own model calls. These are independent
simulated model turns, not live people speaking into phones. Phone participation,
speech and projection remain later stages.

## Prepare the models

Complete the [repository setup](../README.md#set-up). Use an already installed
Ollama model or an available OpenAI model with credentials in your environment.

```sh
mkdir -p runs
cp examples/continuous-ollama.json runs/continuous-config.json
```

Replace both placeholders in `composer.model` and `continuous.participants.model`.
The roles can use different models, providers and `baseUrl` addresses. The
application does not download models or fall back to another provider.
For cloud calls, copy `examples/continuous-openai.json` instead and set
`OPENAI_API_KEY` in the environment or ignored `.env`. Never put credentials in
configuration or scenario JSON.

Both examples allow up to eight concurrent participant requests and one
separate composer request. This is a request bound, not a promise that the model
service processes nine generations in parallel. If a local service becomes
overloaded or serialises requests, reduce `continuous.concurrency` to one or two,
or place the composer on another service. Reducing concurrency changes the
rehearsal's overlap, so record that setting alongside your observations.

## Run, pause and recover

```sh
pnpm cli simulate-continuous --scenario examples/simulation.json --config runs/continuous-config.json
```

This command advances automatically. It does not wait for Enter and needs no
`--auto`. Use `--out <new.jsonl>` to select a new log path. Existing files are
never overwritten.

Ctrl+C pauses the run: active requests stop, queued journal writes drain and
saved text remains available for resume. Use the printed run path:

```sh
pnpm cli resume --run runs/session.jsonl
pnpm cli replay --run runs/session.jsonl
```

Replace `runs/session.jsonl` with the actual path. Resume selects continuous mode
from the saved run. Replay displays recorded contributions alongside collective
passages and any pending participant text without models or credentials.

A participant turn's failed or interrupted prefix remains input, with its status
recorded, and consumes that turn's slot. Resume starts the participant's next
turn rather than generating the same prefix again. Saved partial turns remain
in the participant's own bounded history. A provider token-limit cutoff is a
participant generation error, but its saved prefix remains available. This
differs from Stage 2A, which waits for a complete response from every participant.

A failed collective generation leaves its identical admitted batch pending for
retry. Provisional collective text and provider token-limit cutoffs are not
accepted into collective history. After a crash, recovery preserves a torn final
journal fragment and marks open attempts interrupted. Accepted collective
passages remain unchanged.

Frozen rerun is not implemented for continuous logs. Start a fresh
`simulate-continuous` run for another rehearsal. Stage 1 and Stage 2A retain
their existing rerun behaviour.

## Admission, pacing and limits

Every participant starts successive turns independently, up to
`continuous.maxTurnsPerParticipant`. Each turn freezes the latest collective
context at its start; that context does not change during the turn. A later turn
may see a newer collective passage, but this is not guaranteed. The context link
records what was available, not proof that the participant directly replied.
Participants do not see peers' raw text, private backgrounds or perspectives.

Each incoming token is persisted before its text becomes available for
composition. Each participant has a bounded buffer of unadmitted text. If that
buffer fills, the producer waits for consumption: text is not dropped. The
composer takes the next bounded chunk from every voice that currently has text,
using each person's oldest unadmitted turn first. It does not wait for slower
voices, so a batch can contain fewer than eight contributors. Whitespace-only
buffers drain without a composer call.

At most one composer call is in flight. The next pacing interval begins after
that call finishes, avoiding a burst of catch-up calls after a slow generation.
The composer receives admitted text and bounded recent accepted collective
history, without participants' private contexts.

| Setting                                         | Example | Meaning                                                                                |
| ----------------------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `continuous.maxTurnsPerParticipant`             | `3`     | Maximum started turns per participant, including failed or interrupted turns.          |
| `continuous.concurrency`                        | `8`     | Maximum concurrent participant requests, separate from the composer.                   |
| `continuous.composerIntervalMs`                 | `3000`  | Delay in milliseconds between a completed composer attempt and the next paced attempt. |
| `continuous.maxCharactersPerParticipant`        | `240`   | Maximum available characters admitted per participant in one composer batch.           |
| `continuous.maxPendingCharactersPerParticipant` | `12000` | Maximum unadmitted buffered characters per participant before backpressure.            |
| `continuous.history.maxTurns`                   | `3`     | Bound on each participant's own recent turns, including saved partial turns.           |
| `continuous.history.maxCharacters`              | `6000`  | Character budget for that participant history.                                         |

Character offsets and limits count Unicode code points. Character settings bound
input buffering and admission. They do not impose an output word count. Composer history remains separate: the examples retain up to
six accepted passages within 12,000 characters. Local models allow 256 output
tokens with `think: false`; cloud models allow 1024, including reasoning tokens.
Both roles have 120-second request timeouts. Participant timeouts include waiting
for buffer space; a timeout pauses the run and retains the saved prefix. Token ceilings are resource bounds,
not instructions to cut off speech.

The run completes after every participant's allowed turns have started and
settled and buffered text has been drained and composed. A fast participant can
reach their turn limit while another is still generating.

## Rehearsal checks

The checks below are a procedure, not a claim of a completed real-provider test.

1. Start a run and observe input arriving before participant turns finish.
   Compare the named admitted chunks with each collective passage. Check that
   the composer works with unfinished material without inventing continuations.
2. Compare turn-start context links and accepted collective times. Observe which
   later turns can see newer collective text. Do not require every turn to engage
   with that text or assume every voice appears in each composer batch.
3. Exercise a slow participant with deterministic model doubles. Confirm other
   voices can continue, per-person order is preserved and the composer does not
   wait for a complete round.
4. Fill a participant buffer with a deterministic producer. Confirm backpressure
   waits for consumption without losing or duplicating text.
5. Interrupt a participant turn and resume. Confirm its saved prefix remains
   input, its status is visible and it is not regenerated. Exercise truncated
   generation separately; distinguish that retained source prefix from rejected
   provisional collective output.
6. Fail a composer attempt, then resume. Confirm the pending batch is retried
   unchanged while accepted history remains intact.
7. Replay offline, with services stopped and no API key. Check recorded inputs,
   collective passages and pending text. Confirm normal completion requires
   settled participant turns and drained buffers.

Record run paths, participant and composer models, service concurrency, timing
settings and observations. Automated doubles establish ordering and recovery;
real-provider rehearsals assess pacing and writing separately. Stop for operator
feedback before building Stage 3 projection.
