# Live co-writing rehearsal

## Writing model

Each participant and the collective have one growing text for the whole
rehearsal. They continue writing simultaneously. A model request is an inference
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
marking the source offset sent on the previous request.
Participant background and perspective remain private. Participants receive the
published collective prefix as optional context; they primarily develop their
own positions. Neither engagement nor agreement is required.

All arriving text is saved as it is written, including unfinished words and
prefixes from interrupted requests. There is no semantic accept/reject gate for
a whole response, no round barrier and no percentage slicing. Publishing marks
which saved collective prefix is available for participant feedback. It does not
certify agreement, quality or completion of a sentence.

## Start the local workspace

After the [repository setup](../README.md#set-up) and installing Ollama, run:

```sh
pnpm start
```

The launcher starts its own local-only Ollama service on port 11435, uses the
installed Qwen 3B model or downloads it once, and opens the browser on an available
port. It leaves the original service on 11434 untouched. Press **Start** in the
browser to begin. Ctrl+C pauses the rehearsal and stops both owned processes.

The default is two fictional participants and one minute of active writing.
`pnpm start --all` uses eight participants, nine inference slots, and a 5 s context
refresh interval. `pnpm resume` selects the most recently modified unfinished
live journal; `pnpm replay` reads the latest live journal offline. Ended runs are
excluded from automatic resume. Run files stay in `runs/`.

Use `pnpm resume --run runs/session.jsonl` to choose a saved run. Use
`pnpm start --scenario <file>` for another topic, `--config <file>` for a custom
model configuration, `--port <number>` for a fixed browser port, or `--no-open`
to leave the browser closed. Custom configurations manage their own services;
the launcher does not download models or start Ollama for them. Saved custom
runs keep those settings. An occupied model-service port is reported explicitly
rather than silently reusing a service with unknown parallelism.

The automatic setup replaces the manual commands below for normal use. The
manual setup remains useful when configuring your own model services.

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
**Resume rehearsal** continues each prefix. **End** closes the rehearsal
permanently; its text remains readable. The session also ends at
`live.maxDurationMs` of active rehearsal time. Request token ceilings are
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

Replace the path with the printed journal path. Select **Resume rehearsal** in
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
