# Collective Microphone

## Delivery agreement

Build a tool that turns many contributions into one evolving collective voice.
Use successive functional experiments. Complete and commit each stage, then
rehearse it with the operator before starting the next stage. The initial build
stops after Stage 1. Work directly on `main` in this checkout.

Artistic quality is a rehearsal judgement, not an exact-text automated test.
Keep completed passages append-only. Streamed text is provisional until saved.
One process owns each run, and only one collective generation runs at a time.
Keep model integrations, composition, interfaces and storage separate.

## Tooling

- One private TypeScript ESM package, with strict type checking.
- Node LTS and current stable pnpm, pinned exactly by mise. Mirror pnpm in
  `packageManager`, commit the lockfile, and use frozen installs in CI.
- Biome, Vitest and Lefthook. Add Playwright and `svelte-check` with the browser.
- pnpm project policy in `pnpm-workspace.yaml`; registry/auth settings belong in
  `.npmrc`. Default-deny dependency scripts, with narrow `allowBuilds` decisions.
- Modular LangChain integrations for OpenAI and Ollama, plus Zod validation.
  No cloud fallback, automatic model downloads, agent framework or hosted tracing.
- Credentials stay in the environment, outside source material and run records.

## Stage 1: scripted terminal composition

Load eight voices and their fragments, a score grouping fragments into batches,
and separate composition settings from JSON. Let the operator advance each
batch. Compose one or two sentences using only admitted contributions and a
bounded window of recent accepted passages. Stream output to the terminal.

Save versioned JSONL events containing source/configuration snapshots, ordered
contributions, exact prompts, model identifiers, attempts, accepted passages,
timing, available usage and sanitised failures. Retain a failed batch for explicit
retry. Recover an interrupted final line; reject corruption in earlier records.

Provide `run`, `resume`, `replay` and `rerun`. Replay never calls models. Rerun
creates a new run from recorded contributions and settings without changing the
original. Include clearly labelled demonstration material, not the actual piece.

Acceptance: the same score works with cloud or Ollama by changing configuration;
invalid inputs fail before generation; earlier passages survive interruptions;
replay needs neither credentials nor a provider. Test with deterministic model
doubles and separately verify real providers when available.

Rehearsal: compare writing across models, prompts, fragment order and memory.

## Stage 2: responsive terminal participants

Make independent model calls for eight participants, each with private voice,
position, source text and bounded history. Responses answer actual collective
passages and enter the existing contribution path; silence creates no contribution.
The composer never receives private source material. Allow stepped/automatic
rounds, configurable pauses and maximum rounds, default concurrency one, and
separate composer/participant model selection. Preserve completed responses
when another participant fails. Pause stops new calls; end cancels outstanding
calls and rejects late results. Rehearse distinct voices and meaningful dissent.

## Stage 3: projected rehearsal

Add SvelteKit with the Node adapter, operator controls and full-screen projection.
Reuse the controller and retain single-writer JSONL storage. Use HTTP commands
and SSE; restore accepted state on reload/reconnect. Separate visual reveal from
generation speed. Provide advance/run/pause/end and keep accepted text visible
during failures. Standalone CLI processes must not write to server-owned runs.
Rehearse typography, reading pace and passage length on the projection screen.

## Stage 4: typed phone participation

Add QR joining, anonymous session-scoped identities and submission feedback.
Capture the answered passage when typing begins. Introduce SQLite, Drizzle and
`better-sqlite3` for live sessions, retaining JSONL import/export and CLI runs.
Deduplicate participant-scoped submission IDs and acknowledge only saved input.
Select bounded batches round-robin across participants, preserving per-person
order. Configure interval/batch limits and do not compose from empty input.
Protect operator controls with a server credential and secure session cookie;
scope participant access to a performance join token. Closing ends submissions.
Restart restores accepted data but requires explicit operator resumption.
Rehearse with 5–10 people before introducing audio.

## Stage 5: live speech

Use OpenAI browser WebRTC transcription and short-lived server-issued credentials.
Protect and rate-limit credential issuance. Keep permanent keys server-side.
Show explicit start/stop and provisional transcripts; only finalised segments
become contributions. Deduplicate by connection/item IDs and attach the passage
visible at segment start. Retain typing after microphone denial or disconnect.
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
6. `feat(simulation): add independent responsive participants`
7. `feat(web): add operator and projection views`
8. `feat(projection): add paced reveal and reconnect recovery`
9. `feat(storage): persist live sessions in SQLite`
10. `feat(participation): add scoped phone contributions`
11. `feat(speech): submit live transcripts as contributions`
12. `feat(operations): expose performance health and status`
13. `build: package the application for Coolify`
14. `test: verify performance load and recovery`
15. `docs: add deployment backup and performance runbooks`

Include relevant tests and usage documentation with each feature. CI performs
frozen installation, Biome checks, type checking, tests and build. Later stages
add browser and image checks. Never report mocked checks as real-provider proof.
