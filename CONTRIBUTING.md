# Development guide

## Set up and verify

Follow [repository setup](README.md#set-up). `mise.toml` pins the runtime and
package manager; `package.json` supplies commands; `pnpm-workspace.yaml` supplies
dependency-build policy. Use the committed `pnpm-lock.yaml` for installations.
Git hooks are optional for an ephemeral agent checkout; CI runs independently.

Run commands from the repository root:

| Purpose                                  | Command                                                  |
| ---------------------------------------- | -------------------------------------------------------- |
| Same checks as CI                        | `mise exec -- pnpm run verify`                           |
| Biome checks without rewriting           | `mise exec -- pnpm run check`                            |
| Type checking                            | `mise exec -- pnpm run typecheck`                        |
| One test file                            | `mise exec -- pnpm test tests/live.test.ts`              |
| One named test                           | `mise exec -- pnpm test tests/live.test.ts -t 'refresh'` |
| Build TypeScript and copy browser assets | `mise exec -- pnpm run build`                            |
| Compiled CLI smoke check                 | `mise exec -- node dist/cli.js --help`                   |

`verify` is the canonical CI sequence. `fmt` rewrites formatting across the
repository; prefer `mise exec -- pnpm exec biome format --write <files>` when
only changed files need formatting. Biome and TypeScript configuration define
the mechanical code conventions. Source imports use `.ts` extensions; the
build rewrites them for compiled ESM execution.

Tests are in `tests/` and `src/models.test.ts`. They use deterministic model
doubles and fake providers. HTTP/subprocess tests need permission to bind
loopback sockets and create disposable files. `listen EPERM` indicates an
environment restriction, not evidence that Ollama is missing. Report blocked
checks separately from failing assertions. Do not use personal run logs as test
fixtures: create minimal fictional data in temporary directories.

For changes to runtime behaviour, add or update tests at the affected boundary.
Use focused tests while editing, then run `verify`. For documentation-only
changes, run the Biome check and verify the commands, links and claims that
changed. Browser rendering still needs visual inspection when layout or
interaction changes; HTTP tests alone do not establish visual quality. The
TypeScript check covers `.ts` files, not the browser's plain JavaScript.

## Find the implementation

The application is one Node process, with plain browser assets and versioned
JSONL storage. It has no Svelte application. Typed participation also uses SQLite for durable
contribution revisions and the admission queue.

| Task                                          | Source entry points                                                                           | Test entry points                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Launcher, model setup and shutdown            | `src/start.ts`, `src/local-models.ts`                                                         | `tests/start.test.ts`                                                                              |
| Session selection and browser controls        | `src/workspace.ts`, `src/live-server.ts`, `src/web/`                                          | `tests/workspace.test.ts`, `tests/live-server.test.ts`                                             |
| Current scheduling, prompts and continuations | `src/live.ts`, `src/live-schema.ts`                                                           | `tests/live.test.ts`, `tests/modes.test.ts`                                                        |
| Live event contracts and state reconstruction | `src/live-runs.ts`                                                                            | `tests/live-runs.test.ts`                                                                          |
| Journal locking, ordered writes and recovery  | `src/journal.ts`                                                                              | `tests/journal.test.ts` and affected mode's run tests                                              |
| Model adapters and native prefill             | `src/models.ts`                                                                               | `src/models.test.ts`, `tests/native-prefill.test.ts`                                               |
| Focused offline run outcomes                  | `src/inspect.ts`, `src/cli.ts`                                                                | `tests/inspect.test.ts`                                                                            |
| Composer experiments and request evidence     | `src/composer-experiment.ts`, `src/composer-audit.ts`, `src/live-cli.ts`                      | `tests/composer-experiment.test.ts`, `tests/composer-audit.test.ts`                                |
| Rapid static prompt screening                 | `src/collective-screen.ts`, `scripts/collective-screen.ts`, `scripts/prepare-human-screen.ts` | `tests/collective-screen.test.ts`, `tests/human-screen.test.ts`, `tests/experiment-budget.test.ts` |
| Contribution corpus preparation and pilot     | `src/contribution-corpus.ts`, `src/contribution-cli.ts`                                       | `tests/contribution-corpus.test.ts`                                                                |
| Scripted Stage 1 and percentage slicing       | `src/controller.ts`, `src/composition.ts`, `src/runs.ts`                                      | `tests/core.test.ts`, `tests/slices.test.ts`, `tests/cli.test.ts`                                  |
| Round-based Stage 2A                          | `src/simulation.ts`, `src/simulation-runs.ts`                                                 | `tests/simulation.test.ts`, `tests/simulation-cli.test.ts`                                         |
| Historical bounded-turn compatibility         | `src/continuous.ts`, `src/continuous-runs.ts`                                                 | `tests/continuous.test.ts`, `tests/continuous-cli.test.ts`                                         |

`src/cli.ts` dispatches to mode-specific CLI modules. New
`simulate-continuous` runs use `live-*`; the similarly named `continuous-*`
modules retain historical log support. Input schemas live in `src/schema.ts`,
`src/live-schema.ts` and `src/continuous-schema.ts`; event schemas live beside
their state reconstruction in the run modules. If a persisted shape changes,
check its reader, recovery, CLI and public projection together.

Offline human reasoning comparisons use `scripts/prepare-human-reasoning-screen.ts`
and `src/screen-responses.ts`, covered by `tests/screen-responses.test.ts`. The
explicit Responses transport saves provider reasoning summaries separately from
spoken text; it does not change the live adapter. See the
[human experiment protocol](docs/human-composition-experiments.md#creator-feedback-and-reasoning-comparison).

## Inspect outcomes

Use [run inspection](docs/run-inspection.md) for concise text, machine-readable
JSON and full saved writing. Inspection is read-only and offline. Use an
explicit run path when comparing changes; the default newest-file selection
is a convenience, not a reproducible experiment identifier.

## Find the relevant documentation

| Need                                      | Document                                                                                                                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current operator workflow                 | [README](README.md), [live rehearsal](docs/live-rehearsal.md)                                                                                                                                                        |
| Artistic intent and example source        | [Rehearsing We](docs/rehearsing-we.md), [examples](examples/README.md)                                                                                                                                               |
| Proposed assessment criteria              | [Collective voice criteria](docs/collective-voice-criteria.md)                                                                                                                                                       |
| Current test question and corpus design   | [Agreed question](docs/rehearsing-we.md#current-test-question), [human-six experiments](docs/human-composition-experiments.md), [synthetic revision](docs/representation-corpus.md#revision-after-human-comparisons) |
| Supported historical CLI procedures       | [Stage 1](docs/rehearsal.md), [Stage 2A](docs/stage-2a.md)                                                                                                                                                           |
| Superseded bounded-turn design            | [Historical Stage 2B](docs/stage-2b.md)                                                                                                                                                                              |
| Future stages and delivery scope          | [Roadmap](docs/plan.md)                                                                                                                                                                                              |
| Observations from particular local runs   | Dated `docs/*-2026-11-03.md` reports                                                                                                                                                                                 |
| Why the agent guidance has this structure | [Agent-readiness research](docs/agent-readiness.md)                                                                                                                                                                  |

Keep observed rehearsal results distinct from software guarantees. Update the
current user guide and relevant examples when behaviour changes; preserve dated
reports as historical evidence rather than rewriting their observations.

Typed phone sessions enter through `src/participation-cli.ts`, with the HTTP and
controller integration in `src/participation.ts` and SQLite admission queue in
`src/participation-store.ts`. See `tests/participation.test.ts` and the
[typed rehearsal guide](docs/typed-participation.md). Participant assets are in
`src/web/participant.*`; the participant server never serves operator assets.

Timestamped human-input prompt iteration uses `src/prompt-rehearsal.ts` and
`src/prompt-rehearsal-cli.ts`, with tests in `tests/prompt-rehearsal.test.ts`.
See the [CLI prompt rehearsal guide](docs/prompt-rehearsal.md) for simultaneous
replay, frozen plans and source-linked JSON inspection.

`src/prompt-experiments.ts` prepares the four-condition prompt/recency batch and
creates anonymous reading copies; `tests/prompt-experiments.test.ts` covers the
comparison structure, source revisions and fail-fast dispatch.


Admission scaling uses `src/participation-admission.ts`, `src/participation-load.ts`
and `src/participation-load-inspect.ts`. The load command uses local HTTP and a
streaming model double, never a provider. See [the scale experiment](docs/live-scale-experiment.md).
The live journal uses the same reducer for incremental appends and offline replay;
`tests/journal.test.ts` checks state isolation across validation and I/O failures.

The two-condition natural-continuation comparison uses
`src/natural-comparison.ts` and `tests/natural-comparison.test.ts`. Its authored
100-account fixture is in `examples/natural-comparison/`. Preparation is offline;
provider dispatch requires an explicit run command and budget. See the
[scale experiment](docs/live-scale-experiment.md#real-model-comparison-one-exploratory-pair)
for the questions and follow-up criteria.
