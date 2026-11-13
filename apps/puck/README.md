# Puck

A lightweight, real-time group decision tool inspired by UNU / Swarm AI. Participants move personal magnets to pull a shared puck towards an answer. Everyone can change direction as the group moves.

Puck is an independent experimental implementation. It reproduces the documented interaction, not an undisclosed production algorithm or a claim of equivalent decision quality.

## Run locally

Install [mise](https://mise.jdx.dev/), then run from the monorepo root:

```sh
mise trust
mise install
mise exec -- just setup
mise exec -- just hooks-install
mise exec -- just dev-puck
```

Open <http://localhost:3000>. Development mode also listens on the local network. Copy invite link and Show QR code use the detected network address, so phones on the same Wi-Fi can join even when the host uses localhost. The terminal prints that address; set `PUBLIC_ORIGIN` to override it when several networks are connected. Creating a room makes you the host without adding you as a participant. Use “Join as a participant” on the room page if you also want to pull. Open its invitation in a different browser profile or private window. Two tabs in one profile represent the same participant; the latest tab takes control of that participant's magnet.

The root `mise.toml` pins Node 26 and pnpm. `package.json` enforces the supported Node major and package-manager version. There is no separate runtime version file. All dependencies are exact and `pnpm-lock.yaml` is committed.

## What works

- Questions with 2–6 distinct options; up to 140 registered participants per room by default (configurable to 180 for explicit overload rehearsals).
- Shared countdown, server-controlled puck, 60-second rounds and continuous target dwell.
- Mouse/touch hold-and-drag and keyboard magnet controls.
- One magnet per participant, connection recovery and stale-input expiry.
- Host-only start/cancel controls and participant-only replay/export.
- SQLite session persistence, recorded states and applied inputs.
- Explicit interrupted outcomes on restart; backup command and production build.

The live arena shows only your own magnet. Replay reveals all participants' applied inputs. Participants see this disclosure before joining. The room question and options are visible to anyone with its invitation link.

## Operator access and API clients

Optional instance operators can create/list rooms and acquire host controls through
`/operator`. Its interface and API clients use the ordinary room API; standalone
room creation and guest hosts are unchanged. See [operator API and authentication](docs/operator-api.md).

## Commands

Run the commands below from `apps/puck` through `mise exec --`. From the monorepo root, use `mise exec -- just puck <command>`. Root `just verify` checks Puck, Polymind and Match; `just test-browser` checks both applications. Use `just test-browser-puck` for Puck alone.

| Command                                        | Purpose                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm dev`                                     | Development server, including the real WebSocket service         |
| `pnpm check`                                   | Biome formatting and recommended lint rules                      |
| `pnpm fmt`                                     | Format tracked source formats                                    |
| `pnpm typecheck`                               | Svelte diagnostics and TypeScript checks                         |
| `pnpm test`                                    | Engine, protocol and persistence tests                           |
| `pnpm test:e2e`                                | Build and exercise the production server in Chromium             |
| `pnpm verify`                                  | Check, typecheck, unit tests and production build                |
| `pnpm build` / `pnpm start`                    | Build / run the production server                                |
| `pnpm backup -- /absolute/path/backup.sqlite`  | Consistent SQLite backup                                         |
| `pnpm load:smoke -- http://localhost:3000 140` | Exercise HTTP admission, WebSocket fan-out, reconnect and replay |

Install the browser once with `mise exec -- pnpm exec playwright install chromium`. CI also installs its Linux dependencies. The E2E server uses an isolated temporary database.

For focused tests, disposable servers, port conflicts and failure artefacts, see
[Verification and troubleshooting](docs/operations.md#verification).

For a Coolify Dockerfile Application, see the [deployment contract](docs/operations.md#coolify-packaging). The container listens on port 3000 and stores SQLite data under `/data`.

Root pre-commit hooks run Puck lint, types and unit tests for Puck changes. Install them from the monorepo root with `mise exec -- just hooks-install`. Root CI additionally runs browser tests and the independent Puck image smoke test. Hooks do not silently modify files.

## Tooling policy

pnpm 12 reads policy from the root `pnpm-workspace.yaml` and uses the root lockfile. Dependency scripts are allowed only for `better-sqlite3` (native binding) and `esbuild` (platform binary); Lefthook builds are disabled in favour of root pre-commit hooks. Unknown builds fail. The exact `ws` release-age exception was recorded during the initial dependency resolution; future exceptions require an explicit decision.

Biome owns lint and formatting, including its opt-in Svelte support. `svelte-check` adds framework diagnostics. Changesets are unnecessary for this private application.

## Read next

- [Agent task entry points and constraints](AGENTS.md)
- [Architecture and baseline mechanics](docs/architecture.md)
- [Research and source distinctions](docs/research.md)
- [Vertical slices and remaining work](docs/implementation-plan.md)
- [Running, backing up and deploying](docs/operations.md)

## Current boundaries

Run one server process against a durable local database. A room's membership is fixed during a running round. Existing participants can reconnect. Losing all connections or stalling the simulation for more than 1 second interrupts the round.

Completed recordings are durable. Active frames are buffered in memory; a process crash preserves an interrupted round marker, not its unfinished trajectory. Clearing browser cookies loses the guest identity and host control. Anonymous join links are suitable for trusted pilots, not proof of one real person per participant. `PUCK_ROOM_CAPACITY` defaults to 140 and accepts 2–180. The 180 setting is for overload rehearsal; it is not the recommended room size. `PUCK_HTTP_MUTATION_LIMIT` defaults to 240 requests per minute per direct client address so a venue network can admit a full room; configure edge protection before public use.

The pilot capacity is a configured limit. Local synthetic tests do not establish internet-scale capacity, accessibility equivalence or improved decision quality. Positional correction and personalised layouts are implemented experiments; controlled human comparisons remain future work. Adaptive participant weighting is excluded from the current scope.

## Experimental modes

Open **Advanced settings** when creating a room to choose baseline, positional correction, personalised layouts, or both experiments together. Personalised layouts require at least four options and transfer proportional pulls by option identity. Modes, layouts and applied forces are saved with the round. Replay can show the shared simulation or a participant’s personal view. See [Experimental modes](docs/experimental-modes.md) for the precise rules and limitations.
