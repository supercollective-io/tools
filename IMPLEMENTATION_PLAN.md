# Supercollective Tools implementation plan

Prepared on Wednesday 11 November 2026 for Rehearsing We at ZKM on Saturday 14 November 2026. Scheduling uses Europe/Berlin time. Status: implementation is in progress. See [verified work and remaining gates](docs/implementation-status.md); unchecked human and deployment gates are not completed by code alone.

Build Polymind in `supercollective-io/tools`, starting from the current Collective Microphone implementation. Separate participant sessions and contributions from operations that consume them. Maintain Match as a Python package in this monorepo, borrow selected interactions from the earlier Supermind/Polymind prototype, and keep Puck and Flight by Committee independent. Build the performance hub in `rehearsing-we/hub`.

This is the canonical plan in `tools/IMPLEMENTATION_PLAN.md`. The original `rehearsing-we/TOOLS_IMPLEMENTATION_PLAN.md` now links here.

This is an implementation checklist, not an assertion that every feature can be completed before Saturday. Complete the first end-to-end experience early. Optional branches have explicit gates. Record actual completion evidence beside each phase.

## Contents

1. [Decisions and scope](#1-decisions-and-scope)
2. [Ownership and architecture](#2-ownership-and-architecture)
3. [Git and source migration](#3-git-and-source-migration)
4. [Tooling with mise and just](#4-tooling-with-mise-and-just)
5. [Ordered implementation phases](#5-ordered-implementation-phases)
6. [Performance and spatial development](#6-performance-and-spatial-development)
7. [Verification and release](#7-verification-and-release)
8. [Work after Saturday](#8-work-after-saturday)
9. [Decision register](#9-decision-register)
10. [Source references](#10-source-references)

## 1. Decisions and scope

### Agreed direction

- Toolkit: **Supercollective Tools**; intended remote: `supercollective-io/tools`.
- Application: **Polymind**. **Collective Microphone** remains the name of its live collective-voice mode.
- Purpose: tools for collective understanding, coordination and action. Future logistics fits this purpose, but is not a Saturday deliverable.
- A separate toolkit repository is intentional. Import existing work, rather than rewriting it.
- Audience: expected 50–100; room maximum 140. Verify support for 140, with separately recorded overload testing above that number.
- Polymind owns event-scoped guest identity. No compulsory accounts or shared sign-in across all tools.
- Public HTTPS audience interfaces are preferred, usable through mobile data or venue internet. FlightGear remains local, connected through an outbound bridge.
- Puck and Flight retain independent repositories and deployments. Hyperchat development is paused; reconsider only if the emerging score needs it.
- Use `mise` for pinned tools/runtime environments and `just` for the human and CI command interface.
- The performance favours playful short experiments and a sense of possibility. Tool count, order and prompts remain programme decisions.

### Delivery categories

| Category | Work |
|---|---|
| Foundation required now | Safe import; reproducible tooling; session/contribution boundaries; preserved continuous mode; event identity; hosted deployment |
| Main new experience | Bounded contributions; analysis; collective voice from a bounded set; matching; private partner reveal and meeting locations |
| Independent tools | Puck capacity/deployment; Flight internet bridge/projection; hub links and returns |
| Optional before Saturday | Built-in continuous speech; productive-disagreement matching; connection graph; camera flight input; Raspberry Pi display; additional rule-changing controls |
| Programme decisions | Exact order, invitations, analogue exercise, spatial arrangement, voice modes, possible Hyperchat return |
| After Saturday | General workflow editor, broad shared identity, package publishing, logistics applications, substantial frontend migration |

Bounded audio recording is a priority, but typed input must work throughout. If recording/transcription fails the device gate, use an explicitly typed flow, optionally with tested keyboard dictation. Do not present that fallback as implemented in-app speech capture.

### Evidence and limits

Source review found live typed participation and projection in Collective Microphone, despite stale README claims. Built-in speech capture was absent from the inspected source. Flight has phone controls and projection despite its stale overview. Puck has a 32-person bound. Match's pilot has a 100-person bound; allocation requires even numbers and complete pair assessments. Hyperchat normally targets 24–60 and human validation remains pending.

The creator reports Supermind/Polymind has run successfully with 87 people. This is evidence about that experience, not proof of the replacement implementation. Its local embedding-similarity pairing is different from Match's model-scored collaboration rubric.

As inspected, `/Users/jo/Documents/dev/tools` is an empty directory without local Git metadata. Verify the user-created remote before initialisation/import. Collective Microphone and Match contain substantial modified and untracked work. Never migrate from committed HEAD alone.

## 2. Ownership and architecture

### Source of truth

| Repository | Responsibility |
|---|---|
| `supercollective-io/tools` | Polymind; reusable session, contribution, voice and analysis modules; matching adapter; deployment and verification |
| `tools/packages/match` | Authoritative Python `conference_match` package; scoring/allocation, research and tests; standalone interface remains usable |
| Existing `supermind` | Reference interactions and selected algorithms; no second expanded Polymind to develop in parallel |
| `rehearsing-we` | Hub, running order, prompts, floor plan, equipment and show runbook |
| Existing `puck` | Decision engine, participant app, recordings and deployment |
| Existing `flight-by-committee` | Simulator, control aggregation, hosted relay, local bridge and projection |
| Existing `hyperchat` | Parked unless explicitly restored to the programme |

The old Collective Microphone checkout becomes a retained reference after successful cutover. Add a relocation notice only once the new home works. Do not delete its history, branches or private data.

### Minimal toolkit layout

| Path | Purpose |
|---|---|
| `apps/polymind/` | Initially the largely intact microphone app; participant/operator/projection interfaces |
| `packages/contracts/` | Versioned schemas and cross-language fixtures actually needed by consumers |
| `packages/session/` | Session lifecycle and participant identity |
| `packages/contributions/` | Authored revisions and immutable snapshots |
| `packages/collective-voice/` | Existing composer behind an explicit interface |
| `packages/analysis/` | Bounded analysis with source-linked results |
| `packages/match/` | Match source and complete imported history; standalone CLI, research and tests |
| `deploy/` | Container build, health, deployment and rollback instructions |
| `docs/adr/` | Short architectural decisions |
| `docs/migration/` | Source manifests and cutover evidence without private data |
| `tests/integration/` | Cross-module and Node/Python contract tests |
| `mise.toml`, `justfile` | Root tool pins and canonical commands |

This is a target layout, not a demand for empty packages. First import to `apps/polymind`. Establish boundaries as local modules before extracting packages if that reduces risk. No broker, general plugin registry or additional monorepo build orchestrator is required.

### Data and lifecycle boundaries

1. **Session:** a gathering with participants, prompts and rounds; not a composer run.
2. **Participant:** event-scoped ID and name/badge; credentials remain separate from display identity.
3. **Contribution:** authored material with prompt, round, source and revision.
4. **Snapshot:** a fixed selection of contribution revisions and eligible participants.
5. **Operation:** analysis, composition or matching linked to frozen inputs/configuration.
6. **Result:** output with source references and publication status.
7. **Meeting allocation:** participants, meeting location and release state.

Distinguish drafts, confirmed text, snapshots and published voice. Edits do not retroactively erase a published collective utterance. Audio, transcript and participant corrections are distinct linked records. Avoid a universal schema for Puck forces or Flight controls.

Finite operations can be `queued`, `running`, `succeeded`, `failed`, `cancelled` or `interrupted`. Publication is separate: job completion does not reveal results. The continuous composer retains its own start/pause/resume/end lifecycle and journal. Stopping it must not end the entire participant session.

## 3. Git and source migration

### Conventional commits

Use `type(scope): imperative description`. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`. Scopes identify capabilities/applications.

- One coherent change per commit; include meaningful tests and necessary documentation with the behaviour.
- Separate import, mechanical relocation, dependency changes and feature work.
- Preserve imported history; do not squash the history-preserving migration merge.
- Use short-lived branches such as `chore/import-microphone`, `feat/session-rounds`, `feat/bounded-analysis`, `feat/matching-jobs`.
- Merge dependencies first. Puck, Flight and hub work can proceed independently once their link/configuration contract is known.
- Cross-repository changes are not atomic: release a compatible Match package first, then change the consumer pin.
- No destructive reset, force-push, blanket staging or cleaning untracked files during migration. Stage inspected paths.
- Do not commit unrelated creator work. Prepare the reviewed imported snapshot in a disposable checkout.
- Keep credentials, recordings, participant data and private run journals out of commits.
- No Codex attribution.

Proposed plan commit: `docs(plan): record toolkit and performance implementation sequence`.

### Preserve current work

1. Record HEAD, branch, status, tracked changes and untracked filenames for each source. Never print secret values.
2. Save binary-safe staged/unstaged patches, a Git bundle, and selected untracked source files to a private migration backup outside the public source tree. A bundle alone does not preserve working changes.
3. Back up runtime data separately. Exclude `.env`, audio, logs, databases, caches, dependencies, models and generated output from the source import.
4. Check source history for secrets/private material before publishing it. If unsuitable, import a reviewed source snapshot with provenance rather than exposing history. Do not rewrite the original repository silently.
5. Verify the backup and inventory. Run the existing checks and record pre-existing failures separately from migration regressions.

### Import sequence

1. Verify `supercollective-io/tools` and any remote branch. Initialise/clone without overwriting this plan or other destination content. If the directory is non-empty, use a temporary clone or initialise in place; do not delete documents to make cloning easier.
2. Commit the destination plan/scaffold.
3. Create a disposable migration checkout of Collective Microphone. Overlay reviewed working changes, including required untracked source, and commit there: `chore(migration): capture reviewed microphone working state`.
4. Import under `apps/polymind` with a non-squashed Git subtree import or equivalent history-preserving merge: `chore(import): preserve collective microphone source and history`.
5. Compare the resulting tree to the reviewed snapshot, with documented exclusions.
6. Run the old application commands in the new location before restructuring.
7. Record original HEAD, snapshot/import commits, exclusions and results in `docs/migration/collective-microphone.md`.
8. Rename the application and adapt tooling in separate commits.
9. Reconcile changes made in the original checkout during migration before declaring cutover. Maintain one authoritative development home.

**Gate:** current functionality and old run readers work; needed untracked files are present; original source and private records remain intact.

## 4. Tooling with mise and just

### Responsibility and pinning

`mise` selects exact tool versions and environment. `just` provides commands. pnpm handles JS workspace dependencies; uv handles the Python worker. Do not duplicate the task graph in mise tasks and just recipes.

Start with the inspected microphone pins: Node `26.13.0`, pnpm `12.16.1`. Choose and pin exact compatible Python (at least 3.12), uv and just versions after checking availability; do not invent pins or upgrade unrelated dependencies during import. Puck's pnpm pin is currently `12.18.0` and remains its own repository's concern.

Preserve dependency-build allowlists. Retain the imported lockfile initially; migrate to the root workspace lockfile in a separate reviewed commit and compare resolved dependencies. Remove contradictory nested runtime pins only when root commands work. Match is imported with full ancestry into `packages/match` after committing its required working changes. The worker uses that in-repository source and locked dependencies; no sibling absolute path, floating branch or vendored wheel is needed. See [migration evidence](docs/migration/match.md).

### Recipes to implement

The following are target commands, not commands claimed to exist. Canonical invocation is `mise exec -- just <recipe>`. With mise activated, `just <recipe>` is sufficient.

| Recipe | Behaviour |
|---|---|
| `doctor` | Check pins, native dependencies, ports and missing variable names without exposing values |
| `setup` | Frozen JS/Python installation; no live model calls |
| `dev` | App and required workers; stop only processes it started |
| `dev-voice` | Continuous voice without analysis/matching |
| `dev-bounded` | Capture/analysis/matching without starting a composer |
| `check` | Non-mutating formatting/lint checks |
| `typecheck` | TypeScript/Python checks |
| `test` | Unit/integration checks with fake providers and disposable data |
| `test-browser` | Browser checks against production-like builds |
| `build` | App/packages/worker artefacts |
| `verify` | Check, typecheck, tests and build; CI additionally runs browsers |
| `load-polymind participants=140` | Synthetic transport/storage load; no silent provider costs |
| `rehearse-models` | Explicit real-provider rehearsal with chosen model/data/budget |
| `backup`, `restore-check` | Consistent backup and isolated restoration verification |
| `deploy-staging`, `smoke-staging` | Deploy/exercise exact candidate artefact |
| `release-check` | Validate release versions/configuration and rehearsal evidence |

Use scripts for complex logic, called by just. Safely pass structured input through files/process arguments, not executable shell interpolation. CI installs the same pinned tools and calls the same recipes. A clean clone must work without developer-specific paths. Keep Python dependencies isolated from the system interpreter.

Commits:

- `build(tooling): pin monorepo runtimes with mise`
- `build(workspace): configure pnpm packages and locked Python worker`
- `chore(dev): add just recipes for development and verification`
- `ci(checks): run reproducible workspace and browser checks`

## 5. Ordered implementation phases

For each phase record branch, commits, checks, observed outcome, remaining limits and rollback route. Do not mark complete based solely on code existing. Suggested commits can be split when necessary, keeping each coherent and verified.

### Phase 0 — Inventory and preserve

**Depends on:** nothing. **Repos:** source repositories and `tools`.

- [ ] Execute section 3's preservation and import steps.
- [ ] Read applicable AGENTS.md and carry relevant invariants into destination guidance.
- [ ] Record implemented source separately from roadmap claims and verified deployment separately from configuration files.
- [ ] Keep artistic source notes in `rehearsing-we`.

**Commits:** migration/import titles above; `docs(architecture): record repository ownership and initial boundaries`.

**Gate:** recoverable source snapshot and working imported app. If blocked, preserve the reason; rehearse from the existing verified checkout rather than an incomplete copy.

### Phase 1 — Establish Polymind without changing behaviour

**Depends on:** 0. **Repo:** `tools`.

1. Implement section 4 tooling.
2. Rename application-facing identity to Polymind; retain Collective Microphone as the mode name and old CLI aliases where useful.
3. Keep the existing plain browser frontend. Adapt selected Supermind interactions without making a Svelte migration a dependency.
4. Document commands, storage, operator/participant separation and explicit model configuration.
5. Add README, contributor and agent guidance with ownership and verification entry points.

**Commits:** tooling titles above; `refactor(polymind): establish application home and preserve microphone mode`; `docs(dev): document workspace workflows and module ownership`.

**Gate:** fresh setup/build; source tests pass or unchanged baseline issues are recorded; saved continuous session reopens; local browser smoke succeeds.

### Phase 2 — Deploy a baseline early

**Depends on:** 1. **Repo:** `tools`.

1. Select host, domains and deployment method from actual available infrastructure. Record real values privately; do not treat example domains as chosen deployments.
2. Build an immutable artefact containing Node and the pinned Python worker, or co-deploy two processes if that fits the host better. No repository checkout at runtime.
3. Replace the source's explicit HTTP LAN-origin restriction with configured external origins. Preserve Host/Origin validation and support trusted HTTPS termination.
4. Add hosted operator authentication or private authenticated operator access. Keeping a control URL obscure is insufficient.
5. Configure secure cookies, HTTPS, streaming proxy behaviour, durable volumes, health/readiness and restart policy. Respect SQLite/journal single-writer assumptions.
6. Deploy synthetic staging. Test outside the developer LAN using mobile data and Wi-Fi: join, save, project, restart, return.
7. Restore a consistent backup in isolation; distinguish code rollback from schema/data rollback.

**Commits:** `feat(hosting): support configured HTTPS origins and operator access`; `build(deploy): package Polymind with durable storage and matching runtime`; `test(hosting): verify public sessions and recovery`; `docs(ops): document staging and restoration`.

**Gate:** external phone joins and returns, projection streams, operator permissions hold, backup restores. Deploy later phases incrementally.

### Phase 3 — Separate sessions from collective-voice runs

**Depends on:** 1; integrate with hosted baseline as soon as available. **Repo:** `tools`.

1. Introduce a session ID, session lifecycle and round IDs independent of `LiveLog`'s run ID. Preserve existing participant IDs when adapting saved sessions.
2. Move guest joining, credential lookup and display identity behind the session boundary. Support chosen name and unique visible badge; names are not keys or credentials.
3. Make opening participation possible without constructing `LiveController` or starting model work.
4. Attach existing continuous composer runs to sessions through an adapter. Preserve input admission semantics, prefix persistence, journal ownership, explicit provider choice and interrupted-prefix recovery.
5. Separate session closure from composer end and round closure. Participants can return for results after contribution collection closes.
6. Define participant recovery when a browser session is lost: use a private recovery credential or an authenticated operator-assisted process, not guessing by badge/name. State that same-browser return is the normal path.
7. Version and migrate persisted state safely. Take a consistent backup before migration, test old readers or a documented adapter, and never silently overwrite source journals.
8. Make participant capacity configurable with an explicit bound suited to 140 plus testing overhead. Apply consistent bounds at UI/API/storage layers; retaining resource limits is intentional.
9. Keep credentials and private operator data out of AI prompts, public projection and participant responses.

**Commits:**

- `refactor(session): decouple participant sessions from composer runs`
- `feat(identity): add event names badges and recoverable guest sessions`
- `feat(session): support independent rounds and configurable capacity`
- `test(session): preserve legacy recovery and mode isolation`

**Gate:** join with no composer; create/start/pause/end a voice run without losing participant identity; restart preserves state; another participant cannot edit/read private material; old run inspection still works. Continuous and bounded modes can be selected independently.

### Phase 4 — Establish contributions, confirmation and snapshots

**Depends on:** 3. **Repo:** `tools`.

1. Define versioned contribution and snapshot contracts. Include session, round, participant, prompt, revision, source kind, text, timestamps and confirmation state.
2. Preserve continuous autosave and revision acknowledgement. Duplicate delivery is idempotent; concurrent edits remain detectable rather than silently overwriting one another.
3. Add bounded capture UI with explicit confirm/submit, editing before closure and clear saved status. Do not change the live mode to require submission.
4. Keep audio/transcription metadata separate from participant-confirmed text; model inference must not silently become authored text.
5. Add an atomic snapshot operation selecting exact revisions and an explicit eligible roster. Distinguish registered people, contributors, confirmed contributors and people opting into matching.
6. Treat empty/withdrawn contributions, late arrivals, late submissions and closure retries explicitly. Do not silently match someone without relevant input.
7. Provide an internal authorised read/export interface; do not make raw texts public just because modules need them.
8. Add cross-language fixtures so the Python worker and TypeScript app agree on identifiers, Unicode, revisions and schema versions.

**Commits:** `feat(contributions): add confirmed rounds and immutable snapshots`; `feat(contracts): define versioned contribution and operation exchanges`; `test(contributions): verify snapshot consistency and idempotent capture`.

**Gate:** bounded capture works with voice disabled; a frozen snapshot remains unchanged by later edits; duplicate requests do not duplicate input; the same snapshot can independently feed two consumers.

### Phase 5 — Add bounded analysis and bounded collective voice

**Depends on:** 4. **Repo:** `tools`.

1. Implement a durable operation record with input snapshot/hash, operation kind, configuration, model identity, prompt version, start/end times, progress and sanitised failure state.
2. Persist queued/running work so a restart yields an explicit recoverable or interrupted operation, not an invisible second job. Define retry behaviour and deduplication keys.
3. Add bounded analysis returning themes, similarities, tensions, conflicts, outlying concerns and candidate questions with contribution references. Do not collapse all of these into one collective utterance.
4. Validate output structure and referenced IDs. Permit uncertainty and absence of evidence; do not manufacture conflict or agreement.
5. Add bounded collective composition using the existing composer/model work where appropriate. Preserve the live mode's different acceptance/persistence rules.
6. Support the artistic alternatives: many simultaneous contributions, or sequential contributions accumulated into one round. The capture order must not imply higher influence unless explicitly configured.
7. Adapt Supermind's useful operator controls and projection ideas. Distinguish paraphrase from quotation and avoid presenting a similarity measure as factual agreement.
8. Add independent start, cancel/retry where supported, review and reveal controls. The performer may reveal analysis while matching is pending, or skip an unavailable result.
9. Make public projection readable at distance: one primary idea at a time, substantial type, bounded text density and clear transitions. Keep diagnostics on the operator screen.
10. Store prompts/results for private inspection with appropriate retention, not in public logs. Explicitly select providers and budgets; no silent fallback to another model.

**Commits:** `feat(operations): persist bounded jobs and result publication state`; `feat(analysis): derive source-linked themes tensions and questions`; `feat(voice): compose a collective utterance from a frozen round`; `feat(projection): add operator-controlled analysis and voice reveals`.

**Gate:** fake-provider lifecycle tests pass; a real human-input rehearsal is reviewed for representation, grounding and usefulness. Invalid references fail visibly. Bounded analysis does not start the continuous composer. Provider failure leaves inputs recoverable and other activities usable.

### Phase 6 — Reuse Match through a background worker

**Depends on:** 4; can proceed alongside 5. **Repo:** `tools`; Match source lives in `packages/match`.

1. Preserve/release the needed current Match working state using the migration precautions. Retain its standalone CLI and pilot interface.
2. Establish a package boundary between scoring and allocation. The current allocator is coupled to three metric names and complete pair assessments; it is not already generic.
3. Define an allocator input of participant IDs, candidate edge weights and explicit constraints, retaining score provenance separately. Existing collaboration mode must preserve its previous semantics.
4. Add a policy for odd numbers: form an intentional trio or allow an explicit, visible alternative. Do not fabricate an extra person, drop a participant or claim an optimum for a heuristic trio selection. Show how trios are formed and reviewed.
5. Choose the initial matching criterion using representative human material. Existing modes differ:
   - Collaboration: directional help and shared inquiry using Match's current rubric.
   - Similarity: Supermind-style embeddings and local comparisons; this is a fast baseline, not a nemesis detector.
   - Productive disagreement: optional separate rubric based on evidenced contrast on a shared question; do not negate similarity.
6. Measure provider latency, total cost and completion time on realistic snapshots. Current complete scoring needs 1,225 pairs at 50, 4,950 at 100 and 9,730 at 140. Raising concurrency must respect provider limits and actual service behaviour.
7. If complete scoring does not fit the show, implement a disclosed alternative: embeddings/local scoring for that round, or candidate selection plus expansion and a coverage check. A sparse candidate graph can leave people unpaired; expand it until the allocation policy is satisfied, or report a failure. This changes the optimisation and needs review.
8. Define a worker request carrying schema version, job ID, snapshot reference/hash, eligible roster, full authorised texts, mode/configuration and output location. Do not send credentials or unnecessary names/contact details to providers.
9. Worker returns structured progress/result/error data using atomic file output or a local API. Launch with structured process arguments, never a constructed shell string from participant content. Logs and machine-readable output must be separate.
10. Persist job ownership, retries, timeouts and interruption state. Reuse saved successful assessments for the same frozen run. Do not rerun paid work simply because the page refreshed.
11. Install the in-repository Match package using its own lockfile. Build it into the deployment; do not depend on a sibling checkout at runtime.
12. Add a Polymind adapter mapping stable participant IDs, snapshot source references and result IDs. Matching requires no separate participant registration and no running composer.

**Matching capability commits (originally in `match`, now preserved in `packages/match`):**

- `refactor(allocation): separate edge allocation from collaboration metrics`
- `feat(allocation): handle odd rosters with an explicit trio policy`
- `feat(scoring): add configurable matching modes` — only the selected modes
- `feat(worker): expose structured resumable matching jobs`
- `test(matching): retain standalone behaviour and verify complete allocations`

**Commits in `tools`:**

- `build(matching): pin the reusable Python matching package`
- `feat(matching): run snapshot-based jobs independently of composition`
- `test(integration): verify matching progress restart and participant mapping`

**Gate:** matching-only works; old collaboration checks remain meaningful; results contain every eligible participant exactly once under the chosen pair/trio policy; no ineligible participant appears; measured completion fits the available processing window. A proposed target is completion within six minutes at 140 people, to be accepted or revised before testing, not assumed from code.

### Phase 7 — Deliver matches and support physical encounters

**Depends on:** 3, 6. **Repo:** `tools`; meeting configuration in `rehearsing-we`.

1. Add organiser review showing roster count, unmatched/error conditions, pair/trio proposals and meeting assignment. Do not reveal proposals while scoring is incomplete.
2. Add an explicit release action. Result access is participant-scoped; organiser access is separately authenticated. Unlike the old prototype, do not broadcast the entire private allocation and rely on browser filtering.
3. Show partner name/badge, meeting zone/marker and a concise, source-grounded conversation invitation. A reason is a suggestion participants can contest, not an authoritative personality diagnosis.
4. Keep results available until deliberately replaced. Do not copy Supermind's disappearing 15-second match notification as the only delivery mechanism.
5. Handle late joiners, absent partners, declining a match and odd counts. Default to an operator-visible recovery queue with a transparent manual alternative, not silent reassignment of released pairs.
6. Allow someone to remain seated and have a partner come to them. Keep location assistance separate from unnecessary personal profile disclosure.
7. Make a second round explicit: which prior pairs should be avoided, which inputs changed and which matching objective applies. Previous releases remain inspectable.

**Commits:** `feat(encounters): review and release private matches with meeting locations`; `feat(encounters): support absent partners and accessible meeting arrangements`; `test(encounters): verify release boundaries and rejoining`.

**Gate:** participants can find one another with real phones in a room, including a trio and a failed/late join. Nobody sees another person's private result merely by changing an ID. Reset/retry does not silently overwrite a released encounter.

### Phase 8 — Add bounded speech recording and transcription

**Depends on:** 4 and HTTPS baseline; can proceed alongside 5–7. **Repo:** `tools`.

1. Select and benchmark a transcription provider against actual languages/accent conditions, mobile recordings and venue noise. Provider choice remains open; no Soniox or other implementation was found in the reviewed source.
2. Add microphone permission, visible recording state/timer, stop, playback or review, retry and typed alternative. Target the proposed approximately one-minute contribution; duration is configurable.
3. Verify actual iOS/Android browser recording formats and upload handling. Persist upload state; distinguish local recording, successful upload, transcription and confirmed contribution.
4. Use idempotent upload/transcription IDs and background jobs. Handle interruption, oversized files, silence, invalid audio and timeout without duplicating submissions.
5. Present the transcript for correction/confirmation. Do not send an unreviewed machine transcription to matching as if the person confirmed it.
6. Choose and disclose audio/text retention and provider processing in plain language. Retain only what is needed; keep recordings private. Include capture failures in the operator status without projecting personal details.
7. Test a burst of up to 140 bounded recordings, accounting for upload volume and provider queueing. Keep useful progress and let the performance continue while jobs finish.
8. Rehearse simultaneous speech acoustically: nearby voices may affect transcription. Test spacing, speaking close to phones, short staggered groups or typed contribution. Record the choice in the score.

**Commits:** `feat(capture): record bounded phone contributions with typed fallback`; `feat(transcription): process recordings with retries and transcript review`; `test(capture): verify mobile uploads recovery and concurrent completion`.

**Gate:** tested physical iOS/Android capture and corrected transcripts; expected-scale burst handling; no hidden duplicate or missing input; clear fallback for denied microphone access. If it fails, use typed capture without blocking the rest of the pipeline.

#### Optional branch 8A — Built-in simultaneous live speech

Keep this distinct from bounded recording. Implement only after the main end-to-end path is rehearsable.

1. Select a supported streaming transcription transport with short-lived browser credentials or a server relay; provider secrets remain server-side.
2. Model provisional/final segments, correction, ordering, deduplication, reconnect and source context. Do not blindly append every partial transcript.
3. Feed revisions into the existing continuous admission pathway, retaining typed fallback and the voice journal's persistence semantics.
4. Rehearse transcript latency and acoustic cross-talk with real humans; synthetic stream tests are insufficient.

**Commits:** `feat(transcription): add live segment reconciliation`; `feat(voice): admit live speech revisions into collective composition`.

**Gate:** participants can hear/see the developing voice and respond through reliable transcription. Otherwise retain bounded speech or typed continuous mode.

### Phase 9 — Adapt Puck to the room and internet deployment

**Depends on:** agreed audience capacity and link conventions. **Repo:** `puck`; independent of Polymind extraction.

1. Read its AGENTS.md and experimental-mode documentation. Preserve baseline mechanics and historic recording compatibility.
2. Replace the hardcoded 32 bound with an explicit configured room capacity and validate 140. Distinguish registered, connected, active and frozen starting roster counts.
3. Test the existing force normalisation: maximum individual force divides by starting participant count. Raising capacity preserves the fully aligned collective maximum, but inactive participants can dilute movement. Do not alter that mechanic accidentally while lifting the bound.
4. Rehearse baseline and any chosen experimental mode with human groups. Personalised layouts and centre correction are optional, disclosed experiments; modes are currently immutable per room. Changing mode requires a new room unless explicitly implemented otherwise.
5. Load test actual WebSocket server, fan-out, stale-input expiry, reconnects, recording size and restart behaviour at 50, 100, 140 and an overload scenario. Local 32-client smoke is not enough.
6. Deploy a single authoritative server with durable SQLite and HTTPS/WebSocket proxy support. Verify origins, guest/host boundaries and backups.
7. Add the shared return link and concise join instructions. No integration with Polymind identity is needed.
8. Choose the performance question, options and round outcome behaviour. A timed-out swarm is an outcome, not a fabricated decision. If a decision changes a later activity, make that consequence real and visible.

**Commits:** `feat(capacity): configure and verify larger Puck rooms`; `test(load): exercise room-scale fanout and reconnects`; `build(deploy): document hosted Puck persistence and websocket routing`; `feat(navigation): add the Rehearsing We return link`.

**Gate:** 140-client test and physical-phone round complete acceptably; recording/replay/restore work; no unsupported claim of better decision quality. If capacity is insufficient, explicitly choose smaller groups/delegates or omit Puck; independent rooms are not one shared swarm.

### Phase 10 — Host Flight controls while keeping the simulator local

**Depends on:** host/network decision; independent of Polymind. **Repo:** `flight-by-committee`.

1. Preserve the working local control route as a tested fallback and reference. Record the simulator version, aircraft, scenery, approach and projection configuration that actually work.
2. Extract/encapsulate aggregation and control semantics from the current LAN transport. Preserve bounded axes, throttle behaviour, resets and input expiry.
3. Add a hosted HTTPS participant interface with a real-time authenticated connection. Use distinct participant and bridge/operator credentials, rate limits and origin validation; never expose FlightGear's property socket publicly.
4. Add a local bridge opening an outbound authenticated connection to the hosted service. Deliver validated aggregate control frames, not arbitrary simulator property paths or commands.
5. Define server-received freshness, sequence/generation IDs and stale-frame rejection. Match reset generations between local simulator and hosted session. Do not replay queued old controls after reconnect.
6. Independently expire stale aggregate frames at the local bridge. Make loss of control visible on phones, projection and operator view. Explicitly decide whether simulation pauses on loss or continues; current behaviour releases momentary controls, retains throttle and continues flight.
7. Clarify participation semantics. Centred input currently counts in the average; leaving the pad is not abstention. Decide whether to keep this, add an explicit spectator/abstain state, or support delegated controls. Test denominator and join/rejoin behaviour; do not change physics invisibly.
8. Keep phone controls legible and support the existing observer mode. Joining or opening projection must not create an active control participant.
9. Load test phone traffic, aggregation and bridge latency with 140 simulated clients, measured jitter and induced disconnects. Tune only from evidence. The current 10 Hz per-phone transport implies substantial traffic; HTTPS hosting alone does not validate it.
10. Rehearse local FlightGear plus OBS plus hosted control input. Configure runway visibility, overlay readability, capture permissions, scene switching and reset. Begin with one audience view; add a second camera only if actual performance remains acceptable.
11. Record a known approach reset, manual local override and a graceful way to end a failed attempt. Never conceal operator intervention as autonomous collective success.
12. Add the hub return link. Retain separate Flight participant identity unless a selected later feature actually needs shared roles.

**Commits:**

- `refactor(controls): separate aggregation from LAN transport`
- `feat(relay): host authenticated participant control sessions`
- `feat(bridge): connect local FlightGear through an outbound relay`
- `fix(controls): expire stale commands across resets and reconnects`
- `feat(controls): make active and observing roles explicit` — if selected
- `test(flight): verify crowd load network loss and generation recovery`
- `feat(projection): show relay state and collective controls`
- `docs(ops): document flight deployment reset and fallback`

**Gate:** actual aircraft responds through the public interface; loss/reconnect/reset are correct; projection performance and legibility are acceptable; local override works. Hosted control capacity is supported by measurements, not the absence of an explicit cap.

#### Optional branch 10A — Camera/body control

1. Choose one conductor, a few marked control positions, or a room-level aggregate gesture. These are different participation models. Do not assume reliable tracking of 100 overlapping bodies.
2. Prototype locally with fixed camera framing/lighting. Map a small deliberate gesture vocabulary to bounded axes; retain other controls on phones/operator as appropriate.
3. Show what is recognised and the resulting control, with confidence/loss state. Add calibration, neutral state, tracking-loss expiry and operator inhibit.
4. Keep camera processing local where practical. Define how any camera channel combines with phone inputs; do not silently give a conductor the weight of the whole crowd.
5. Rehearse occlusion, seated participation, different bodies and switching between people. Compare the audience experience with phone control.

**Commits:** `feat(camera): map visible gestures to bounded flight controls`; `test(camera): verify tracking loss calibration and manual fallback`.

**Gate:** demonstrably legible and robust in the actual camera geometry. Drop this branch if it competes with a functioning Flight/public control path.

### Phase 11 — Build the Rehearsing We hub

**Depends on:** known destination format; can start early. **Repo:** `rehearsing-we`, path `hub/`.

1. Build a small mobile page with permanent short URL/QR, performance identity, current instruction and one prominent activity link.
2. Store an activity manifest with ID, label, participant destination, status and optional waiting/phones-down instruction. Keep operator URLs and credentials out of public manifests.
3. Provide authenticated operator controls to select the active activity and update session links. Use polling or server updates while the hub is open; a simple versioned state document is sufficient.
4. Make phases include analogue activities, waiting and closing. Avoid making participants choose from a catalogue during a timed transition.
5. Add a consistent return link to each selected app. Spoken cues/manual return are the baseline. Automatic notices require a small client integration in each app; do not promise that the hub can remotely navigate unrelated pages by itself.
6. Use full-page navigation, not iframe embedding. Preserve app sessions when returning in the same browser. Test actual camera/QR browser behaviour and avoid unnecessary new tabs.
7. Deploy independently with HTTPS. An app failure should leave the hub and other app links usable. Provide a printed short address in addition to the QR.
8. Add a private operator launch page or documented bookmarks for each app's controls and projection. Keep this separate from the participant hub.
9. Test a whole transition sequence from clean phones, including a late arrival and a return to an existing Polymind match.

**Commits:** `feat(hub): add the performance entrance and current activity`; `feat(hub): add authenticated phase and destination controls`; `feat(navigation): connect participant tools to the performance hub`; `test(hub): verify transitions and return-session continuity`; `build(hub): deploy the independent public entrance`.

**Gate:** one stable entrance reaches every selected session; people understand where to go next; no public operator credential; Polymind return restores identity; unavailable activities can be skipped immediately.

### Phase 12 — Optional visualisation and physical system display

**Depends on:** stable result/event interfaces. **Repos:** `tools` and `rehearsing-we`.

**Connection graph:** adapt the useful Supermind visualisation with readable projection and a precise legend. Similarity edges do not prove agreement, and a visual contradiction edge requires an explicit evidenced relation. Include representation of missing input and avoid forcing a graph edge merely to make the display look connected. Keep private material private. Commit: `feat(visualisation): display source-linked collective relationships`.

**Raspberry Pi:** give it a modest genuine role: read-only phase, received/confirmed counts, processing and connection status. It may symbolically embody the system without claiming all computation happens on it. A physical pause button must have real, bounded semantics and appropriate credentials; pressing it should not ambiguously kill every tool. Keep it off the critical processing path and test disconnection. Commits: `feat(display): add a physical session status display`; optional `feat(controls): add a bounded physical pause control`.

**Gate:** each addition improves legibility or theatrical experience and can fail without interrupting the core show. Otherwise defer.

## 6. Performance and spatial development

Technical development and dramaturgy proceed together. Do not wait for every feature before trying the experience with people. A simple interface can be learned quickly, but matchmaking encounters, conversation and collective adaptation still need time.

### 6.1 Develop the score today and tomorrow

1. Read `rehearsing-we/README.md`, `notes.md` and `original-proposal.md` alongside the microphone artistic brief. Distinguish the public description, the existing agreed test question and new proposed prompts.
2. Begin from the current invitation, unless deliberately revised: “What is something you’d like to change, but can’t change on your own?” A new topic is a programme choice, not a hidden default change in the engine.
3. Compare three shapes: a progression in collective capacity; an idea travelling through contributions and encounters; or an explicit sequence of short experiments. Preserve the playful science-museum quality rather than forcing a fictional narrative.
4. Treat Match as central because the creator has observed its strong audience effect. Capture/collective representation is the other central experience; Flight supplies shared physical stakes; Puck can be brief. Hyperchat remains parked.
5. Make at least one earlier activity consequential for a later one: a question from analysis becomes a Puck choice; a match creates a pair that later acts together; an audience-chosen coordination protocol changes the next flight attempt. Do not claim a data connection where there is only a verbal juxtaposition.
6. Ensure at least one real bounded choice about the process belongs to participants. Do not pre-script success or treat majority motion as unanimous consent.
7. Define each activity's entry cue, instructions, duration, operator action, audience action, visible outcome, exit cue and fallback. Make failure an understandable end to an experiment, not prolonged public debugging.
8. Measure transitions, including walking and finding partners. Preserve the option to omit a block without breaking the rest of the performance.

A starting four-tool score, to rehearse rather than assume:

| Time | Activity | Processing/transition purpose |
|---|---|---|
| 0–4 min | Welcome, one entrance, brief invitation | Joining and expectations |
| 4–12 min | Bounded contributions and first collective account | Upload/transcription/confirmation; freeze matching input |
| 12–18 min | Puck or physical experiment | Matching runs in background; choose a question already ready, not a result that may still be pending |
| 18–30 min | Pair reveal, find partners, exchange | Allow actual movement and conversation |
| 30–38 min | Analogue coordination or representation exercise | Phones down; organisation becomes visible |
| 38–54 min | Flight: explain, attempt, reorganise, retry | Real consequences of a changed arrangement |
| 54–60 min | Return to voice/reflection and close | Human interpretation, including disagreement |

This is a 60-minute allocation, not a measured running time. If matching is delayed, switch explicitly to a bounded analogue activity or an announced alternative pairing; do not label random/manual pairs as model-derived. If Hyperchat returns, reserve a substantial exchange block and remove/shorten another block rather than adding a sixth activity invisibly.

**Commits in `rehearsing-we`:** `docs(score): draft a timed sequence of collective experiments`; `docs(score): record rehearsal timings cues and fallback branches`.

### 6.2 Analogue options

**Helium Stick:** try lightweight rods with small groups, approximately 8–12 each, supporting each rod on fingers and trying to lower it while maintaining contact. Test the actual rods and physical arrangements first. At 100 people, plan enough groups/equipment or a deliberate observed demonstration. Let people try and change their coordination without announcing a prescribed correct leader. Offer an accessible variation that does not require everyone to reach the floor. Its connection to Flight is common intention producing an unexpected aggregate result.

**1–2–4–All with power reflection:** preserve individual contributions, then pair/group accounts. Let participants identify what survived, changed or disappeared and who did the interpretive work. A later computer analysis can be an additional contestable account, not the judge of whose interpretation is correct. This needs more time than a brief physical puzzle.

Select one based on rehearsal, room layout and the rest of the score. Do not add both merely because they are available. Commit: `docs(facilitation): specify analogue exercises and accessible variants`.

### 6.3 Spatial design and meeting locations

1. Inspect the actual usable floor and seating arrangement with venue staff. Maximum capacity does not establish an open floor suitable for 70 simultaneous pair locations.
2. Mark projection orientation, exits, accessible circulation, seating, operator position, equipment and camera sightlines. Do not infer floor dimensions from speaker coordinates alone.
3. Choose a coarse zone scheme or fine grid. Fifty pairs are possible at 100 participants; 70 at 140. Coarse zones with multiple distinct pair identifiers may be easier than taping every pair cell.
4. Use signs visible above the crowd, high-contrast labels and matching symbols/numbers on both phones. Avoid colour-only identification.
5. Reserve seated rendezvous locations and a procedure for an absent partner or a person unable to move through the crowd.
6. Assign pair locations deterministically from the released allocation and available locations, not by asking a language model to invent floor coordinates.
7. Place rods/analogue equipment without blocking circulation. Ensure people can look up at projection from their current positions.
8. Position a Pi/display where it can be addressed and seen without becoming a bottleneck. If camera input is selected, mark its effective control area and show what is sensed.
9. Produce a simple floor plan and equipment list, then walk through the match transition at realistic density.

The supplied technical questionnaire describes 3840 × 2160 front projection through HDMI and a 48 kHz audio system. Verify the booked setup and available interfaces; a technical questionnaire is not a confirmed production arrangement. Test rendering at the actual output resolution, and prepare any audio path for the venue's sample rate. The loudspeaker dome is optional creative infrastructure, not a dependency on full spatial-audio implementation.

**Commits:** `docs(space): define zones circulation and meeting locations`; `docs(technical): record projection audio and equipment requirements`.

### 6.4 Optional return to Hyperchat

Only reopen this branch if the score needs cross-room circulation of ideas. Reassess its human pilot and intended-scale readiness rather than assuming its existing synthetic rehearsal suffices. Decide whether it is an independent linked activity or whether human-authored messages feed matching. For the latter, map stable source participant IDs and exclude surrogate/system posts; preserve provenance. No event-wide SSO is required merely to provide a link.

**Commit if selected:** `docs(scope): restore Hyperchat with a bounded integration and rehearsal gate`. Until then, no implementation work or deployment dependency.

## 7. Verification and release

### 7.1 Dependency and priority map

| Track | Order | Can proceed alongside |
|---|---|---|
| Foundation | Preserve/import → tooling → baseline hosting → session/contribution boundaries | Score and floor planning |
| Main experience | Snapshot capture → analysis and matching → release/encounter | Recording implementation |
| Continuous mode | Preserve old voice → attach to session → optional live speech | Main bounded experience |
| Puck | Capacity → hosted load → human round | All Polymind work |
| Flight | Relay/bridge → failure handling → projection/crowd trial | All Polymind work |
| Hub | Static entrance → phase control → actual links → transition rehearsal | Tool implementation |
| Optional | Graph, Pi, camera, additional matching modes | Only after core paths are rehearsable |

Do not treat parallel tracks as an instruction to have several agents modify the same files. Allocate module ownership or isolated worktrees if parallel implementation is chosen. Shared contract changes should land before consumers.

### 7.2 Required verification

| Area | Automated verification | Human/operational verification |
|---|---|---|
| Migration | Tree comparison, source suite, legacy fixtures | Existing app starts; saved sessions inspect/reopen |
| Identity | Participant/host separation, duplicate joins, recovery boundaries | Same browser returns; new phone recovery procedure |
| Contributions | Revisions, Unicode, retries, closure, frozen snapshots | Participants understand saved/confirmed status |
| Modes | Voice-only without matching; bounded-only without composer | Each mode is usable independently |
| Analysis | Schema/reference validation, failures, retries | Recognition, accuracy, missing differences, useful questions |
| Matching | Allocation coverage, odd count, job resume, source mapping | Pair reasons and encounters are meaningful; measured waiting time |
| Audio | Upload/segment idempotence and failure cases | Physical phones, noisy room, corrected transcripts |
| Hosting | Health, restart, isolated restore, access boundaries | Mobile data and venue network access |
| Puck | 140-client protocol/load/replay | Responsive round and legible interaction |
| Flight | Aggregation, stale/reset generations, synthetic traffic | Actual simulator, projector, jitter/loss and operator override |
| Hub | Manifest permissions, destination changes | Complete phone-to-phone transition sequence |

Use fake providers for ordinary tests. Real provider tests are explicit and budgeted; measure model performance and artistic quality separately from transport. Avoid creating tests that merely mirror trivial implementation details. Preserve all source-mandated verification when changing code.

### 7.3 Performance budgets and load evidence

Before testing, record provisional pass thresholds in the runbook, then measure and revise them deliberately. Suggested starting targets, not claims of current performance:

- 140 simultaneous participants supported, with a separate 180-client synthetic overload/recovery scenario. Do not confuse test headroom with room occupancy.
- Text save acknowledgement p95 within 2 seconds under expected load; no loss of acknowledged revisions after an app restart.
- Bounded analysis/matching completes within its allocated score window; initially budget no more than six minutes for matching and show progress rather than indefinite waiting.
- Puck and Flight end-to-end input-to-visible-response latency measured on the actual network; target p95 below 250 ms as a starting usability threshold, then assess with humans. Any timeout/freshness tuning must not mask stale control.
- Audio uploads/transcription account for a simultaneous completion burst and real provider quotas.
- Hub transitions target less than one minute including re-entry, measured rather than assumed; physical meeting time is separately included in the score.

Record client count, duration, server resources, network conditions, latency/error distribution, database growth, model spend and observed failure/recovery. Stop widening load tests after agreed gates pass unless new changes or evidence justify repetition. Simulated clients cannot validate venue Wi-Fi/mobile congestion or human understanding.

### 7.4 Date-based delivery gates

These are prioritisation gates for the short runway, not a promise that the entire plan fits three days.

**Wednesday 11 November:** preserve/import; settle ownership/tooling; deploy a baseline; establish a first score and candidate layout. Begin session/capture separation. Resolve infrastructure access early.

**Thursday 12 November:** achieve typed contribution → analysis → match → private reveal in staging. Run a small real-person pilot. Advance bounded recording, Puck capacity and Flight relay in their independent tracks. Review the story and select optional branches based on what improves the experience.

**Friday 13 November:** freeze programme scope; complete target-scale tests, actual-device checks, projection and a timed full run. Select tested alternatives for anything still failing. Publish the rehearsal-tested release candidate and backup/restore procedure. No new architectural migration after this gate.

**Saturday 14 November:** verify venue network, power, projector, sound, camera if used and operator controls. Reset demonstration data into a clean event; join with several actual phones; inspect capacity/status; open the entrance before the show. Only fixes to observed blocking problems should change the release; recheck affected paths.

If the core integrated flow is not ready Thursday, first drop camera, graph, Pi extras, extra matching modes and live speech. Use typed capture if audio is unreliable. Omit a failing independent app rather than force it into the programme. Preserve meaningful encounters and analogue activity. A failed experiment can be part of the performance; broken navigation and missing participant contributions should not be its unplanned organising principle.

### 7.5 Release, rollback and operational runbook

1. Record the exact commit/image for Polymind, Match, hub, Puck and Flight; chosen models/prompts; runtime versions; session links; operator access route; and configured capacity.
2. Tag the candidate/release only after verification, for example `v0.1.0-rc.1` and `v0.1.0`. Record the multi-repository release manifest in `rehearsing-we`; a single tag cannot identify all independent deployments.
3. Build once and promote the tested artefact. Keep secret values out of the manifest. Verify chosen hosting has durable volumes and required streaming/WebSocket support.
4. Take a consistent snapshot before migrations/show reset. Use a database backup API or stop writers and copy the complete state including required WAL/journals; do not copy only a live SQLite main file.
5. Practise restoration on isolated data. A rollback after schema migration may require data restoration; rolling back only the image is not necessarily safe.
6. Verify private model/API configuration and budget without exposing credentials. Make provider outages visible and avoid silent provider changes.
7. Prepare operator bookmarks, projection scenes, reset commands, printed URLs, a short equipment checklist and a paper running order.
8. Define per-tool fallback: Polymind → typed input/human synthesis; Match → announced manual/analogue pairing; Puck → disclosed physical decision exercise; Flight → bounded physical coordination/ending or explicit demonstration. Do not present recorded output as live audience work.
9. Keep synthetic rehearsal data clearly separate from the audience session. Confirm the public QR points to the clean correct event.
10. After the show, stop intake, preserve agreed records, apply retention/deletion policy and record outcomes/failures privately. Do not automatically publish participant writing or recordings.

**Commits:**

- `test(rehearsal): add cross-tool recovery and scale verification`
- `docs(runbook): record deployment projection and fallback procedures`
- `docs(release): pin the rehearsed multi-application release`
- `chore(release): prepare the first Polymind performance release`
- After the event: `docs(rehearsal): record observed outcomes and next priorities`

## 8. Work after Saturday

Do not build these merely to fulfil an abstract toolkit architecture. Use observed repeated needs to prioritise them.

1. Review what participants actually experienced: recognition, meaningful encounters, shared action, exclusions, waiting and which transitions mattered. Keep technical success separate from artistic claims.
2. Consolidate modules that now have genuine multiple consumers. Remove duplicated code and temporary migration adapters once their replacements are verified.
3. Improve frontend consistency or adopt a common framework only with a deliberate migration plan and preservation of working modes.
4. Match joined the monorepo on 11 November; maintain one authoritative implementation in `packages/match` and preserve the worker contract. Further shared-package extraction should follow demonstrated needs.
5. Develop reusable session recipes with explicit inputs, operations, transitions and publication gates. Start with a few real recipes before a visual workflow editor.
6. Support shared identity for selected cross-application workflows only when needed. Use established authentication standards for independently hosted sign-in; keep account identity distinct from event participant identity and data permissions.
7. Add source formats/adapters for Hyperchat and other tools, preserving authorship and correction rather than inferring identity from names.
8. Consider open-source package publication, licensing, contributor guidance, compatibility/versioning, examples and independent deployment documentation.
9. Extend towards logistics when there is a concrete group need: offers/needs → potential collaborators → agreed project → availability/resources → proposed schedule → accepted responsibilities → review. A shared concern is not a project, a match is not a team, and an AI schedule is not a commitment.
10. Keep Puck/Flight fast control loops separate from slow model jobs. Split deployments further only for demonstrated hardware, scaling, isolation or team needs.

Potential future commits: `refactor(toolkit): extract proven shared capabilities`; `feat(recipes): compose verified session workflows`; `docs(toolkit): publish standalone and combined examples`; `feat(planning): model proposed responsibilities and explicit acceptance` — the last only after real requirements exist.

## 9. Decision register

Resolve decisions at the relevant phase, not all upfront. Record selection, reason, owner, date and consequence. No pending optional decision should block an independent core task.

| Decision | Default/proposal | Resolve before |
|---|---|---|
| Toolkit destination | `supercollective-io/tools`; verify remote and writable checkout | Import |
| Root runtimes | Preserve known Node/pnpm pins; select exact compatible Python/uv/just | Frozen setup |
| Hosting/domains | Public HTTPS on available infrastructure; no assumed host | Baseline deployment |
| Operator access | Authenticated hosted controls or private authenticated access | Public deployment |
| Participant identity | Event-scoped, recoverable, only in Polymind | Session implementation |
| Main capture | Bounded audio with review; typed always available | Capture pilot |
| Continuous speech | Optional and separate from bounded recording | Programme freeze |
| Opening invitation/topic | Existing question unless deliberately revised | First human rehearsal |
| Matching criterion | Choose from actual input and artistic goal; no silent mix of objectives | Worker performance benchmark |
| Odd participant handling | Explicit reviewed trio or announced alternative | Encounter pilot |
| Matching latency strategy | Benchmark complete scoring; use disclosed alternative if needed | Target-scale gate |
| Puck mode/capacity | Baseline; test 140; mode changes disclosed | Puck human rehearsal |
| Flight centred/abstaining input | Retain existing semantics unless explicitly changed | Control instructions |
| Flight connection loss | Explicitly choose continue/neutral versus pause | Relay release |
| Camera control | Optional; few visible bodies or clearly defined aggregate | Programme freeze |
| Meeting grid | Coarse zones or fine grid after floor inspection | Pair reveal rehearsal |
| Analogue block | Helium Stick or representation/power exercise | Timed rehearsal |
| Pi | Optional read-only status object first | Equipment freeze |
| Hyperchat | Parked | Only if score requires it |
| Audio/text retention | Clear short policy and participant disclosure | Real participant capture |
| Publication/licence | Verify existing licences and desired release policy | Public source release |

### Final acceptance checklist

- [ ] Source changes and history preserved; no private data imported.
- [ ] `tools` is the authoritative Polymind home and clean setup uses mise/just.
- [ ] Continuous microphone runs independently.
- [ ] Bounded contribution → analysis → matching runs without a composer.
- [ ] People keep identity across rounds and recover their own results.
- [ ] Shared inputs retain provenance; snapshots and publication gates are explicit.
- [ ] Matching handles the real roster and completes within the allocated window.
- [ ] Public deployments and backups work outside the developer LAN.
- [ ] Selected Puck/Flight versions meet their capacity and recovery gates.
- [ ] One hub entrance and return links work across selected apps.
- [ ] Real phones, humans, physical movement and projection have been rehearsed.
- [ ] Spatial plan, analogue equipment and accessible alternatives are ready.
- [ ] Optional features are explicitly selected or dropped.
- [ ] Release manifest, operator runbook and graceful fallback score are complete.

## 10. Source references

Local source paths refer to the inspected workspace; after migration, record the corresponding destination paths in the migration manifest. These are evidence/navigation references, not deployment dependencies.

| Source | What to inspect |
|---|---|
| `../collective-microphone/AGENTS.md` and `CONTRIBUTING.md` | Runtime commands, journal/model/privacy invariants and module entry points |
| `../collective-microphone/src/participation.ts` | Current coupling to LiveController/LiveLog, origin restrictions and participant routes |
| `../collective-microphone/src/participation-store.ts` | Participant credentials, 100-person limit, revisions and durable state |
| `../collective-microphone/docs/typed-participation.md` | Current actual typed flow and remaining human rehearsal needs |
| `../collective-microphone/docs/rehearsing-we.md` | Artistic intent, representation and existing invitation |
| `../collective-microphone/docs/live-scale-experiment.md` | Existing scaling work; inspect actual results before making claims |
| `packages/match/pyproject.toml` and `packages/match/src/conference_match/` | Importable Python package, rubric, scoring, runs, allocation and pilot |
| `../supermind/src/lib/server/actions/` | Earlier analysis and embedding-based matching |
| `../supermind/src/routes/input/+page.svelte` | Earlier contribution and match-reveal experience |
| `../puck/AGENTS.md`, `README.md`, `docs/operations.md`, `docs/experimental-modes.md` | Engine constraints, deployment, modes and verification |
| `../flight-by-committee/docs/phone-controls.md` and `docs/projection.md` | Actual controls, freshness, local bridge and OBS setup |
| `../hyperchat/docs/10-first-human-pilot.md` | Pending human-pilot gates if reintroduced |
| `README.md`, `notes.md`, `original-proposal.md` in `rehearsing-we` | Performance description, options and artistic intent |
| `zkm-kubus-tech-rider/` in `rehearsing-we` | Venue questionnaire, projection/audio information, floor and speaker references |

Official tooling references: [mise configuration](https://mise.jdx.dev/configuration.html), [just manual](https://just.systems/man/en/). Verify commands against the pinned versions when implementing. The division adopted here is deliberate: mise owns tools/environments, just owns project commands.

Architectural background, not additional implementation requirements: [modular development before service proliferation](https://martinfowler.com/bliki/MonolithFirst.html), [OpenID Connect](https://openid.net/specs/openid-connect-core-1_0.html), [CloudEvents 1.0.2](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md). No universal identity service or event broker is required for the Saturday scope.
