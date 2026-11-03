# Live co-writing rehearsal

## Writing model

Each participant and the collective have one growing text for the whole
rehearsal. In continuous mode they write simultaneously; chunked mode schedules
one writer at a time. A model request is an inference
continuation, not a participant turn: a request ending, reaching its token budget
or refreshing its context does not finish or replace the contribution.

Each new request receives its writer's complete saved text. After interruption,
refresh or a token-budget boundary, the text is supplied as an assistant prefill
so an unfinished word can continue. After a natural end of generation, the full
text is supplied as `existingText` data with an explicit append task, without an
assistant prefill that could immediately produce the same end marker again.
If a non-empty saved prefill yields no new output, the controller attempts this
append mode once; another empty generation pauses with an explicit error.

Append mode can insert one mechanical space at the join when the saved text ends
in a non-whitespace character and new output starts with a letter or number.
Prefill mode does not insert that separator. Saved text is never deleted,
rewritten or retrospectively repaired. Inspect joins during rehearsal: a
continuation instruction does not guarantee that a model will follow it.

The composer also receives every participant's complete prefix, with `newFrom`
marking the source offset sent on the previous request, and `newText` holding
the newly admitted suffix. Speaking-space guidance uses the average participant
addition, without rejecting or trimming model output to a word quota.
Participant background and perspective remain private. Participants receive the
published collective prefix as optional context; they primarily develop their
own positions. Neither engagement nor agreement is required.

All arriving text is saved as it is written, including unfinished words and
prefixes from interrupted requests. There is no semantic accept/reject gate for
a whole response. Continuous mode has no round barrier or percentage slicing;
fixed-text mode reveals slices as described below. Publishing marks
which saved collective prefix is available for participant feedback. It does not
certify agreement, quality or completion of a sentence.

## Start the workspace

After the [repository setup](../README.md#set-up), run `pnpm start`. The browser
opens with mode, model and participant choices. Nothing generates until **Start**.
Starting a session freezes those choices in its journal; use **New** to compare
another combination. **Open saved…** lists previous sessions by time, mode, model
and status, and opens their saved text. **Resume** continues paused writing.

The default Qwen 3B choice is prepared on demand. The launcher starts its own
local-only Ollama service on port 11435 and downloads the model if necessary.
Continuous mode uses one inference slot per writer; chunked and fixed-text modes
use one. Switching settings restarts only this owned service when necessary.
Installed `gemma4:12b-mlx` on the existing service at port 11434 is offered for
serial modes. A missing model or unavailable service is an explicit, retryable
setup error. The original service is never stopped by the launcher.

Gemma uses `rawPrefill: true`: for unfinished writing, the adapter requests
Ollama's canonical open chat template and appends the exact saved prefix before
raw generation. This avoids the Gemma chat renderer closing that prefix as a
finished message. It requires Ollama's render-only support; it was exercised with
version 0.40.14. Unsupported services fail explicitly. Other model configurations
retain the standard LangChain chat path.

`COLLECTIVE_OLLAMA_PORT` can select a different managed Qwen port when another
workspace is already running. Use the same setting when resuming those sessions.

`pnpm start --config <file>` exposes that configuration's models as a choice.
Cloud credentials stay in the environment or ignored `.env`, never in browser
settings. Explicit configuration durations, context capacity and refresh settings
are preserved. A saved session always resumes its frozen configuration.

`--scenario <file>` chooses other participant starting contexts. `--score <file>`
chooses other fixed source texts; when no scenario is supplied, those texts also
provide the corresponding participant identities and starting context. `--all`
preselects the full participant count, `--port` chooses a fixed browser port,
and `--no-open` leaves the browser closed. `--run <file>` remains available for
opening a particular saved journal directly, though normal reopening is in the UI.

Ctrl+C pauses and closes the workspace, drains saved writes and stops its owned
model service. Offline `pnpm replay` reads the most recently modified live journal.
The `pnpm resume` shortcut has been removed; browser Resume and the historical
`pnpm cli resume --run <file>` remain available.

## Scheduling modes

**Continuous** uses independent concurrent requests. Each writer pauses briefly
between requests while its full prefix and newer feedback are processed. The
waiting indicator reports computation, not simulated silence. Default active
duration is one minute; the refresh interval is 2 s for a pair or 5 s for eight.

**Chunked** schedules a continuation for each participant in order, then one for
the composer. The next participant cycle receives the latest collective prefix.
Every participant still has one growing contribution. Prompts do not assign
short responses, thematic fragments or a fixed number of turns. Each request has
a maximum 96-token computation budget; reaching it advances the scheduler and
preserves unfinished words for that writer's next continuation. A five-minute
active-time ceiling stops the default session. End can stop it earlier.

**Fixed text** admits successive percentage slices from the complete frozen score,
using its `chunkPercent` (20 in the demonstration). Cuts need not align words,
sentences or themes. Every participant's revealed prefix remains visible beside
the collective. Participant models are never called. The composer continues after
each slice, and the session ends after the final slice is composed. This permits
comparisons with identical source inputs; generation itself is not deterministic.

The serial scheduler is journalled. A completed request advances the cursor
atomically, so reopening does not replay completed participant work. Interrupted
writing retains its exact prefix; fixed sources are not admitted twice. A crash
between composer completion and publication recovers the saved feedback before
proceeding. Full-text context capacity guards remain in all modes.

The manual service setup below is optional for advanced configurations.

## Isolated local pair setup

The original service on port 11434, using Gemma's MLX backend, did not provide
actual parallel generation in the local check. Overlapping client requests were
not evidence of simultaneous writing. Ollama's
[MLX serialisation report](https://github.com/ollama/ollama/issues/17666) describes
that backend limitation; [PR 19197](https://github.com/ollama/ollama/pull/19197)
proposes concurrent MLX generation and was still open when checked. Do not assume
that setting `OLLAMA_NUM_PARALLEL` changes an installed MLX runner's behaviour.

For a reproducible pair rehearsal, run a separate local Ollama service on port
11435. Leave the existing service's settings unchanged. In one terminal:

```sh
OLLAMA_HOST=127.0.0.1:11435 \
OLLAMA_NUM_PARALLEL=3 \
OLLAMA_CONTEXT_LENGTH=8192 \
OLLAMA_MAX_LOADED_MODELS=1 \
OLLAMA_NO_CLOUD=1 \
OLLAMA_KEEP_ALIVE=60s \
ollama serve
```

This requests three slots for two participants and the composer, with one loaded
model and cloud features disabled. Memory demand increases with parallelism and
context length; sufficient memory is still required. See the official
[Ollama concurrency FAQ](https://docs.ollama.com/faq#how-does-ollama-handle-concurrent-requests)
and [local-only setting](https://docs.ollama.com/faq#how-do-i-disable-ollamas-cloud-features).

In a second terminal, install the
[official Qwen 2.5 3B Q4_K_M model](https://ollama.com/library/qwen2.5:3b-instruct-q4_K_M)
on that service if it is not already present:

```sh
OLLAMA_HOST=127.0.0.1:11435 ollama pull qwen2.5:3b-instruct-q4_K_M
OLLAMA_HOST=127.0.0.1:11435 ollama list
```

With this manual setup, install the model yourself. The `pnpm start` launcher
performs that check and download automatically. The runnable `examples/live-local-pair.json` selects this model and
`http://127.0.0.1:11435` for both roles, with `numCtx: 8192` on each request.
Keep the request context size aligned with the service setup. To use it directly:

```sh
pnpm cli rehearse --scenario examples/simulation-pair.json --config examples/live-local-pair.json
```

Use a new run rather than changing an existing journal's configuration. Observe
both participants and the composer producing text during overlapping intervals;
record that evidence separately from request start times. This setup specifies
a two-participant rehearsal. The [dated audit](live-rehearsal-2026-11-03.md) also
records nine-stream and eight-participant checks, including their throughput and
writing-quality limitations. Eight participants require nine inference slots;
using the three-slot setup queues requests.
Stop the isolated service with Ctrl+C in its own terminal when finished.

## Feedback and controls

`live.feedbackIntervalMs` controls publication of the latest saved collective
prefix. A publication can end inside a word or sentence. A participant request
can refresh when newer collective context is available, but only after it has
produced output and the minimum `live.refreshIntervalMs` has elapsed. The
composer refreshes on newly available participant text under the same rule.
Waiting for initial output prevents repeated refresh cancellation from starving
a slow first token. All saved prefixes survive refresh and become continuation
context for the next request.

**Pause** cancels active requests, drains saved writes and retains all writing.
**Resume** continues each prefix. **End** closes the rehearsal
permanently; its text remains readable. Continuous and chunked sessions also end at
`live.maxDurationMs` of active rehearsal time; fixed-text sessions finish after
the final source slice. Request token ceilings are
resource budgets, not output word limits or stopping rules for a contribution.
Model or storage errors are shown explicitly; saved writing remains available.

The full text is not silently shortened to fit a context window. If a request
would exceed `live.maxContextCharacters`, all writers pause with an explanation.
Prepare a new rehearsal with a suitable context budget or shorter duration;
changing an input file does not change a saved run's frozen configuration.

## Resume and replay

Stop the server before opening its journal elsewhere. Reopen the same workspace:

```sh
pnpm cli rehearse --run runs/session.jsonl
```

Replace the path with the printed journal path. Select **Resume** in
the browser. Use `--port <number>` if the default local port is unavailable.
For terminal continuation or offline reading:

```sh
pnpm cli resume --run runs/session.jsonl
pnpm cli replay --run runs/session.jsonl
```

Replay needs no models or credentials. Crash recovery preserves a torn final
journal fragment and marks unfinished requests interrupted. Earlier text is
retained. An ended rehearsal can be read but cannot restart. Frozen `rerun` is
not implemented for live logs; create a new rehearsal to compare settings.

## Verify a rehearsal

These are operator checks, not a claim that a real-provider audit has passed.

1. Start the pair scenario. Confirm participant writing overlaps with collective
   writing, and requests continue the same text without repeating its prefix.
2. Compare highlighted source text, sent context versions and first-token waits.
   Confirm publication changes available feedback without forcing an immediate
   reply or cancelling a request before it has written anything.
3. Pause while text is arriving. Read the saved prefixes, resume and inspect the
   joins. End another run and confirm it cannot restart.
4. Replay offline. Compare saved text with the browser. Record model identifiers,
   service settings, elapsed time and any repeated joins or ignored differences.

Keep deterministic lifecycle checks separate from judgement about the writing.
Record actual provider results in a dated rehearsal report. This local monitor
does not implement the performance projection, phone participation or deployment.
