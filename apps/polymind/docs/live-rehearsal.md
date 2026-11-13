# Live co-writing rehearsal

The intended experience is for each participant to feel both **represented in
the collective** and **in conversation with it**. The writing and feedback loop
rehearses a unified process of dynamic representation: contributions shape the
collective voice, which participants can encounter, respond to and reshape.
See the [participant experience](rehearsing-we.md#participant-experience) for the
goal. The mechanisms below make feedback available; responsive AI-participant
and human rehearsals assess the resulting experience. Human rehearsal tests
transfer to the actual audience.

Context refresh makes contributions available for selection. It does not oblige
the composer to acknowledge each contribution or each change of mind. Judge
responsiveness across the evolving performance, rather than per-person uptake.

## Writing model

Each participant and the collective have one growing text for the whole
rehearsal. In continuous mode they write simultaneously; chunked mode schedules
one writer at a time. A model request is an inference
continuation, not a participant turn: a request ending, reaching its token budget
or refreshing its context does not finish or replace the contribution.

Each new request receives its writer's complete saved text. For Ollama, after
interruption, refresh or a token-budget boundary, the text is supplied as an
assistant prefill so an unfinished word can continue. OpenAI receives the exact
saved text as `existingText` data with an explicit continuation task, including
after interruption: a final assistant message is not a native unfinished prefix.
After a natural end of generation, both providers receive `existingText` data
with an explicit append task, without an assistant prefill that could immediately
produce the same end marker again.
If a non-empty saved prefill yields no new output, the controller attempts this
append mode once; another empty generation pauses with an explicit error.

Append mode can insert one mechanical space at the join when the saved text ends
in a non-whitespace character and new output starts with a letter or number.
Interrupted continuation does not insert that separator, including OpenAI's
data-based continuation. Saved text is never deleted,
rewritten or retrospectively repaired. Inspect joins during rehearsal: a
continuation instruction does not guarantee that a model will follow it.

The composer also receives every participant's complete prefix, with `newFrom`
marking the source offset sent on the previous request, and `newText` holding
the newly admitted suffix. Speaking-space guidance compares total collective writing with average total
participant writing, without a per-update word target or output trimming.
Input updates are not sentence boundaries: the collective can continue the same
sentence across requests. Sentence-ending punctuation starts a new grammatical
sentence, without requiring it to be independent of the preceding thought.
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

Mode and model remain visible during a session. **New run** unlocks these choices
for the next session. Prewritten participant cards show the complete source:
green highlighting marks text already sent to the composer; the rest is muted.
The highlight follows the composer's recorded input position, including an
in-flight request; it does not mean that
the collective has represented or agreed with that text. Showing the remaining
source in the browser does not send it to the model early.

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

## Projection rehearsal (slice 1)

Run the explicit Luna preset with reasoning off:

```sh
mise exec -- pnpm start --config examples/live-projection.json --all --port 3100
```

This starts with the fictional demonstration score. Add `--score <private-score.json>`
to use a version-2 score with real contributions. For the current local human-six
rehearsal, the prepared score is `runs/human-projection-score.json` (ignored by Git).
Models are called only after Start.

Choose **Open projection**, move that window to the HDMI display, then choose
**Full screen**. Escape leaves full screen. The audience view contains only the
published collective text; the full-screen button disappears in full screen.
The operator workspace retains the sources and session controls. Use an extended
desktop, with the projection in a separate window rather than a background tab.

The projection displays the complete published collective text immediately on each
server update, matching the operator's published view. There is no separate pacing
or reveal cursor. Reloading or reconnecting shows the latest published text without
replaying it. During disconnection the last received writing remains visible.
Long text scrolls to keep the latest words visible. Pause and End do not delay text
already published. Reopening a saved session remains an explicit operator action.

`live.composerStyle: "configured"` uses the preset's artistic instructions with
only the live speaking-space and continuation contract appended. The preset uses
variant C, selected from the recorded human-input experiments (text-015 and
text-016): direct collective speech and relationships between the voices, with
the extra qualification paragraph and prescribed movement removed. It retains
complete source text and new-text markers. New sessions use C; reopening an
existing session retains its frozen artistic instructions. Older configurations retain their
previous artistic wrapper. Live generation uses the existing model adapter;
offline Responses-screen results are not a guarantee of live writing quality.

The layout was inspected at a 3840 × 2160 browser viewport. Actual HDMI projection,
macOS display scaling and readability from the audience's distance still need
rehearsal on the 16-inch M1 MacBook Pro and venue projector.

Local evidence, 6 November 2026: the human-six rehearsal in
`runs/0e9e235b-c5ad-4be2-82a3-25cb8b69a55b.jsonl` completed all five source steps
with Luna, no failures or unfinished attempts, and all 947 collective characters
published. Recorded active generation time was 16.756 seconds. Inspection found
clean continuation joins but recurring corrective qualifications; this is a
working live preset, not a claim that live artistic quality matches G. Browser
checks exercised full screen, paced display, reload recovery and the 4K viewport.
Historical pacing tests covered paused/disconnected reveal, bounded resumption, final
word handling, checkpoint identity and audience-data separation. Physical HDMI
and audience testing were not performed.

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

**Prewritten** (stored as `fixed` in configuration) admits successive percentage slices from the complete frozen score,
using its `chunkPercent` (20 in the demonstration). Cuts need not align words,
sentences or themes. Every participant's revealed prefix remains visible beside
the collective. Participant models are never called. The composer continues after
each slice, and the session ends after the final slice is composed. This permits
comparisons with identical source inputs; generation itself is not deterministic.
New `compose` runs and custom fixed-mode browser sessions freeze their configured
composer budget in `live.serialRequestTokens`, including any reasoning tokens.
The effective ceiling is the smaller of that value and the writer's model budget.
Older journals without the field retain their original 96-token scheduler ceiling
on resume; default browser presets and chunked sessions also retain 96 tokens.
For an automatic composer-only run and per-request assessment,
use the [composer experiment](composer-experiment.md).

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

## Collective Microphone in an event session

In the event operator interface, open **Collective Microphone — separate activity**.
Set the microphone question and choose **Open contributions**. Participants can
write before the model starts. **Start voice** begins a new continuous voice and
selects it for projection; the operator status identifies the projected activity.
The text model and budget come from session setup.

**Pause voice** stops generation and retains the same saved voice and participant
writing. Contributions remain open. **Resume voice** continues that run, including
after a server restart. **End round** closes contributions and ends generation.
It also closes a round whose voice never started or already ended. Retrying the
end request is safe; restart recovery completes an interrupted end.

After ending, **Start a new microphone round** opens fresh contributions with the
same question, which the operator can edit first. Participant identities remain.
Saved earlier writing remains available privately under **Your earlier contributions**;
it is read-only and does not populate the new editor or enter the new voice's
model context. Earlier journals and frozen revisions remain intact. See the
[session API](session-api.md#microphone-rounds-and-private-history) for retry and
history contracts.

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
Record actual provider results in a dated rehearsal report. The projection rehearsal is described above. This protocol does not verify phone
participation or hosting. The current session service is deployed; see the
[public deployment review](../../../docs/verification/public-deployments-2026-11-12.md)
for the checks completed and the remaining rehearsal gates.
