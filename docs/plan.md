# Collective Microphone

This staged roadmap includes historical decisions and future work. For the
implemented workspace, use [the live guide](live-rehearsal.md); for development
commands and source entry points, use [CONTRIBUTING.md](../CONTRIBUTING.md).

## Delivery agreement

Build a tool that turns many contributions into one evolving collective voice.
Use successive functional experiments. Complete each stage, then
rehearse it with the operator before starting the next stage. Stage 2B is now
authorised. Complete continuous co-writing and its local operator workspace,
then stop for operator feedback before Stage 3 performance projection. Keep
Stage 1 and Stage 2A available.

Artistic quality is a rehearsal judgement, not an exact-text automated test.
Keep writing append-only. Live writing is saved as it arrives; publication
marks collective feedback availability. Stage 1 and Stage 2A retain their
complete-passage acceptance rules.
One process owns each run, and only one collective generation runs at a time.
Keep model integrations, composition, interfaces and storage separate.

## Tooling

- One private TypeScript ESM package, with strict type checking.
- Node LTS and current stable pnpm, pinned exactly by mise. Mirror pnpm in
  `packageManager`, commit the lockfile, and use frozen installs in CI.
- Biome, Vitest and Lefthook. The current browser uses plain JavaScript, HTML
  and CSS. Playwright and Svelte tooling are future options for Stage 3.
- pnpm project policy in `pnpm-workspace.yaml`; registry/auth settings belong in
  `.npmrc`. Default-deny dependency scripts, with narrow `allowBuilds` decisions.
- Modular LangChain integrations for OpenAI and Ollama, plus Zod validation.
  No cloud fallback, agent framework or hosted tracing. Historical CLI runs
  require installed models; the current launcher prepares Qwen on demand when
  the operator starts a session, as described in the live guide.
- Credentials stay in the environment, outside source material and run records.

## Stage 1: scripted terminal composition

Load a version-2 JSON score with eight voices, each with one continuous `text`,
and a `chunkPercent` setting. Keep composition settings in separate JSON. Let
the operator advance one percentage step at a time. With `chunkPercent: 20`,
five steps each admit the next 20% of the characters of every voice. Preserve
source order and make mechanical cuts, including inside words or sentences;
do not select complete thoughts or align themes. Count Unicode code points,
preserve whitespace and round percentage positions down. Include the final
remainder, skip globally empty intervals and retain individual empty slices.
Compose approximately one participant's speaking turn. Make this a principle of
the composer's role, without enforcing a word-count limit. Synthesise a connected
thought rather than concatenating contributions. Use only the new slices and a bounded window of recent accepted collective
passages. Do not resend earlier raw slices or reveal future source text. Stream
output to the terminal.

Save versioned JSONL events containing source/configuration snapshots, ordered
contributions, exact prompts, model identifiers, attempts, accepted passages,
timing, available usage and sanitised failures. Retain failed admitted slices
for explicit retry. Recover an interrupted final line; reject corruption in earlier records.
Reject provider-reported token-limit cutoffs before accepting
a passage. Preserve the admitted inputs for explicit retry.

Provide `run`, `resume`, `replay` and `rerun`. Replay never calls models. Rerun
creates a new run from recorded contributions and settings without changing the
original. Preserve replay of version-1 logs with their recorded fragment-based
inputs. Include clearly labelled demonstration material, not the actual piece.

Acceptance: the same score works with cloud or Ollama by changing configuration;
invalid inputs fail before generation; earlier passages survive interruptions;
replay needs neither credentials nor a provider. Test with deterministic model
doubles and separately verify real providers when available.

Rehearsal: compare writing across models, prompts, percentage sizes and memory.
Verify that admitted slices reconstruct every original text exactly. Percentages
simulate finite prerecorded contributions; they are not a live-stream protocol.

## Stage 2A: round-based responsive terminal participants

Make independent model calls for eight fictional participants. Load a scenario
with `title`, `openingInvitation` and voices containing `id`, `name`, `perspective`
and private `background`. The example retains the broad collective-power topic
and everyday circumstances from Stage 1. Backgrounds provide initial context;
they are not prewritten output or a mandatory agenda.

Participants primarily share and develop their own positions. Each round gives
every participant the same previous accepted collective passage as optional
context, alongside their own bounded history. Engagement with the collective is
not compulsory. No participant sees peers' raw responses or private context.
Default participant concurrency is one. Every participant completes one actual
text response, saved before the round barrier releases all responses to the
composer. The composer never receives private background or perspective.
Stage 2A uses completed responses, not percentage cuts or continuous admission.

Configure participant and composer models separately. Provide manual rounds and
`--auto`, configurable intervals and a maximum round count. The example uses
three rounds, concurrency one and 1000 ms intervals. Empty, truncated or failed
generations are errors; the composer waits for every participant's completed
text response. Preserve completed responses when another call fails or the
operator interrupts. Resume reuses completed work; replay is offline.

Simulation rerun freezes recorded participant responses and builds a separate
collective history without participant calls. Include rounds with a completed
text from every participant, including pending composer work. Exclude unfinished rounds
with partial responses and retain them in the source log. Preserve original
`respondingToPassageId` links as available-context links, not proof of a direct
reply, and label recorded inputs. Freeze the source scenario
and settings in the record; allow a composer configuration override. Use a fresh
`simulate` run to generate new contributions in its own collective context.

Acceptance: deterministic tests cover private prompt boundaries, common previous
collective context, one completed text per participant, failure recovery and
bounded automatic execution. Rehearse independent development, optional
engagement with the collective and meaningful dissent separately
with real providers. Follow [the Stage 2A procedure](stage-2a.md), record which
checks actually passed and stop for feedback after this stage. The range from
independent threads to direct replies is a rehearsal hypothesis, not a research
finding or a parameter with a forced rate.

## Stage 2B: continuous co-writing and local workspace

Each participant and the collective have one growing text for the whole session.
Inference requests continue that text; they are not participant turns. Save all
incoming writing, including interrupted prefixes. Budget boundaries and context
refreshes continue the same contribution without a semantic acceptance gate.
Preserve Stage 1 and Stage 2A. The previous bounded-turn experiment remains
historical documentation in [stage-2b.md](stage-2b.md).

Give each writer its full saved prefix. Give the composer every participant's
full text and `newFrom` offsets identifying newly available source. Keep private
participant background and perspective out of composer and public browser data.
Participants receive the published collective prefix as optional context, while
primarily developing independent positions. Do not force replies or agreement.

Publish collective feedback at `live.feedbackIntervalMs`, even inside words or
sentences. Refresh requests only after their first output and the minimum
`live.refreshIntervalMs` when newer context exists. Preserve every saved prefix
and continue at its exact join. Never repeatedly cancel before the first token.
One request per writer may be active; actual service parallelism remains a
provider-dependent rehearsal observation.

Provide `rehearse` with a local browser monitor, Start/Resume, Pause and End.
Show full growing texts, source prefixes sent to the composer, newer available
context, first-token waits and recent output age. “Sent” records request input,
not a guarantee of semantic representation. Pause drains writes and retains text;
End is permanent. End automatically at the configured active duration. Context
capacity pauses all writers with an explicit reason rather than dropping full
prefixes. Resume the browser with `rehearse --run`; retain terminal resume and
offline replay. Frozen rerun is not implemented for live journals.

Acceptance: test refresh starvation, exact prefix joins, cancellation, concurrent
controls, publication offsets, context capacity, crash recovery and public-data
redaction. Follow [the live rehearsal guide](live-rehearsal.md). Record actual
provider and browser observations separately from deterministic checks. Stop for
feedback before performance projection, phone participation or deployment.

## Stage 3: projected rehearsal

Add SvelteKit with the Node adapter, operator controls and full-screen projection.
Reuse the controller and retain single-writer JSONL storage. Use HTTP commands
and SSE; restore accepted state on reload/reconnect. Separate visual reveal from
generation speed. Provide advance/run/pause/end and keep accepted text visible
during failures. Standalone CLI processes must not write to server-owned runs.
Rehearse typography, reading pace and passage length on the projection screen.

## Stage 4: typed phone participation

Add QR joining, anonymous session-scoped identities and submission feedback.
Capture the collective context visible when typing begins. Introduce SQLite, Drizzle and
`better-sqlite3` for live sessions, retaining JSONL import/export and CLI runs.
Deduplicate participant-scoped submission IDs and acknowledge only saved input.
Select bounded batches round-robin across participants, preserving per-person
order. Admit rough available sequential text without waiting for a complete
thematic statement. Use interval and character limits, not percentages of an
unknown final text. Do not compose from empty input.
Protect operator controls with a server credential and secure session cookie;
scope participant access to a performance join token. Closing ends submissions.
Restart restores accepted data but requires explicit operator resumption.
Rehearse with 5–10 people before introducing audio.

## Stage 5: live speech

Use OpenAI browser WebRTC transcription and short-lived server-issued credentials.
Protect and rate-limit credential issuance. Keep permanent keys server-side.
Show explicit start/stop and provisional transcripts; only finalised segments
become contributions. Preserve rough sequential wording rather than assembling
curated complete themes; finalised transcription segments can still be incomplete
thoughts. Do not assume a known final stream length. Deduplicate by
connection/item IDs and attach the passage visible at segment start. Retain typing after microphone denial or disconnect.
Store transcripts, not raw audio. Test real iOS/Android devices and venue noise.

## Stage 6: Coolify and performance readiness

Deploy a single Git-backed Coolify Dockerfile Application. Use a multi-stage
image with a non-root runtime, `0.0.0.0:3000`, explicit public origin, managed
HTTPS, and durable `/data` storage. No Compose is needed for this single process.
Keep Ollama external and explicitly configured. Container localhost is not the
developer's computer. Add readiness independent of provider availability.

Migrate before serving traffic; avoid overlapping SQLite writers during deploys.
Resume manually after restart. Document consistent backups, restoration, secrets,
storage permissions and rollback constraints. Show connection/queue/provider
status, retain accepted projection text during outages, and export full runs.

Test 100 text participants, bursts, provider failure, display reconnection,
graceful shutdown, persistence and backup restoration. Verify transcription
capacity separately against the intended microphone count. Rehearse on venue Wi-Fi.
The Coolify target/domain and GitHub destination will be established at that stage.

## Commit sequence

1. `docs: record staged delivery and rehearsal criteria`
2. `build: initialise pinned TypeScript tooling`
3. `ci: enforce reproducible installs and project checks`
4. `feat(cli): compose scored voices with cloud and Ollama`
5. `feat(runs): add recovery replay and rerun`
6. `feat(simulation): add round-based responsive participants`
7. `test(simulation): verify private context complete rounds and recovery`
8. `docs: add Stage 2A examples and rehearsal procedure`
9. `feat(simulation): admit continuous participant text` — include streaming,
   persistence, CLI, deterministic tests, example configurations and procedure.
10. `docs: record the Stage 2B continuous rehearsal` — actual provider evidence
    and remaining limitations.
11. `feat(web): add operator and projection views`
12. `feat(projection): add paced reveal and reconnect recovery`
13. `feat(storage): persist live sessions in SQLite`
14. `feat(participation): add scoped phone contributions`
15. `feat(speech): submit live transcripts as contributions`
16. `feat(operations): expose performance health and status`
17. `build: package the application for Coolify`
18. `test: verify performance load and recovery`
19. `docs: add deployment backup and performance runbooks`

Include relevant tests and usage documentation with each feature. CI performs
frozen installation, Biome checks, type checking, tests and build. Later stages
add browser and image checks. Never report mocked checks as real-provider proof.
