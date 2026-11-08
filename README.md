# Puck

A lightweight, real-time group decision tool inspired by UNU / Swarm AI. Participants move personal magnets to pull a shared puck towards an answer. Everyone can change direction as the group moves.

Puck is an independent experimental implementation. It reproduces the documented interaction, not an undisclosed production algorithm or a claim of equivalent decision quality.

## Run locally

Install [mise](https://mise.jdx.dev/), then run from this checkout:

```sh
mise trust
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm hooks:install
mise exec -- pnpm dev
```

Open <http://localhost:3000>. Create a room, then open its invitation in a different browser profile or private window. Two tabs in one profile represent the same participant; the latest tab takes control of that participant's magnet.

`mise.toml` pins Node 26 and pnpm. `package.json` enforces the supported Node major and package-manager version. There is no separate runtime version file. All dependencies are exact and `pnpm-lock.yaml` is committed.

## What works

- Questions with 2–6 distinct options; up to 32 registered participants per room.
- Shared countdown, server-controlled puck, 60-second rounds and continuous target dwell.
- Mouse/touch hold-and-drag and keyboard magnet controls.
- One magnet per participant, connection recovery and stale-input expiry.
- Host-only start/cancel controls and participant-only replay/export.
- SQLite session persistence, recorded states and applied inputs.
- Explicit interrupted outcomes on restart; backup command and production build.

The live arena shows only your own magnet. Replay reveals all participants' applied inputs. Participants see this disclosure before joining. The room question and options are visible to anyone with its invitation link.

## Commands

Run commands through `mise exec --` unless mise is activated in your shell.

| Command                                       | Purpose                                                  |
| --------------------------------------------- | -------------------------------------------------------- |
| `pnpm dev`                                    | Development server, including the real WebSocket service |
| `pnpm check`                                  | Biome formatting and recommended lint rules              |
| `pnpm fmt`                                    | Format tracked source formats                            |
| `pnpm typecheck`                              | Svelte diagnostics and TypeScript checks                 |
| `pnpm test`                                   | Engine, protocol and persistence tests                   |
| `pnpm test:e2e`                               | Build and exercise the production server in Chromium     |
| `pnpm verify`                                 | Check, typecheck, unit tests and production build        |
| `pnpm build` / `pnpm start`                   | Build / run the production server                        |
| `pnpm backup -- /absolute/path/backup.sqlite` | Consistent SQLite backup                                 |
| `pnpm load:smoke -- http://localhost:3000`    | Create a synthetic 32-participant local round            |

Install the browser once with `mise exec -- pnpm exec playwright install chromium`. CI also installs its Linux dependencies. The E2E server uses an isolated temporary database.

Lefthook checks staged files with Biome before commits and runs `pnpm verify` before pushes. CI additionally runs browser tests. No hook silently modifies staged files.

## Tooling policy

pnpm 12 reads project policy from `pnpm-workspace.yaml`, including in a single-package repository. `.npmrc` contains registry configuration only. Dependency scripts are allowed only for `better-sqlite3` (native binding), `esbuild` (platform binary) and `lefthook` (hook/binary setup). Unknown builds fail. The exact `ws` release-age exception was recorded during the initial dependency resolution; future exceptions require an explicit decision.

Biome owns lint and formatting, including its opt-in Svelte support. `svelte-check` adds framework diagnostics. Changesets are unnecessary for this private application.

## Read next

- [Architecture and baseline mechanics](docs/architecture.md)
- [Research and source distinctions](docs/research.md)
- [Vertical slices and remaining work](docs/implementation-plan.md)
- [Running, backing up and deploying](docs/operations.md)

## Current boundaries

Run one server process against a durable local database. A room's membership is fixed during a running round. Existing participants can reconnect. Losing all connections or stalling the simulation for more than 1 second interrupts the round.

Completed recordings are durable. Active frames are buffered in memory; a process crash preserves an interrupted round marker, not its unfinished trajectory. Clearing browser cookies loses the guest identity and host control. Anonymous join links are suitable for trusted pilots, not proof of one real person per participant.

The pilot capacity is a configured limit. Local synthetic tests do not establish internet-scale capacity, accessibility equivalence or improved decision quality. Geometry corrections, adaptive weighting and controlled human comparisons remain future slices.
