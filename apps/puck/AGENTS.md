# Working on Puck

## Start with the task

| Task                                      | Authoritative starting points                                                                                                                      | Completion evidence                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Change mechanics, protocol or persistence | [Architecture](docs/architecture.md), `src/lib/core/`, `server/`                                                                                   | Relevant unit tests, `pnpm verify`; browser tests for transport or lifecycle changes                                       |
| Change the interface or replay            | `src/routes/`, `src/lib/components/`; [experimental recording semantics](docs/experimental-modes.md#recording-and-replay)                          | `pnpm verify`, relevant browser tests and inspection of changed visual states                                              |
| Add or assess an experiment               | [Experimental modes](docs/experimental-modes.md), [research evidence categories](docs/research.md), [scope decisions](docs/implementation-plan.md) | Tests for implemented mechanics; primary-source support for research claims; human comparisons for decision-quality claims |
| Run, back up or troubleshoot the service  | [Operations](docs/operations.md)                                                                                                                   | Readiness and relevant room/recording checks on disposable data; restoration needs its own rehearsal                       |

## Commands

Run package commands from `apps/puck` through `mise exec --` unless mise is activated.
Use the versions in root `mise.toml` and the root pnpm lockfile; the ambient Node
or pnpm may differ. Follow [setup](README.md#run-locally); root hook installation is
optional for a disposable agent checkout. Root `just verify` checks every package;
`just test-browser-puck` runs Puck's browser suite. No credentials or external service are
needed for local checks.

- Install: `mise exec -- pnpm install --frozen-lockfile`.
- Fast feedback: `mise exec -- pnpm check` and `mise exec -- pnpm test tests/engine.test.ts`.
- Before handing off code changes: `mise exec -- pnpm verify` (lint, types, unit tests, build).
- UI, HTTP, WebSocket or round-lifecycle changes: also run `mise exec -- pnpm test:e2e`.
  This builds and starts the real server with a temporary database. Chromium must
  be installed. See [focused checks and diagnostics](docs/operations.md#verification).

## Constraints that are easy to miss

- Start with `pnpm dev` or build then `pnpm start`. Vite alone does not provide
  the HTTP API and WebSocket session service. `.env` is not automatically loaded.
- The server owns physics, identity, permissions and round state. Keep mechanics
  in the pure core and transport/lifecycle in `server/`; client rendering is not
  authoritative. Run only one server process per database.
- Live views expose only the viewer's magnet. Replay/export expose recorded
  inputs to authenticated room members. The host can be a non-participant;
  separate browser contexts are needed to exercise separate identities.
- Preserve baseline as the default. Before changing experiments or recording
  formats, read [mode and replay semantics](docs/experimental-modes.md). Record
  applied inputs and mode/layout configuration; keep historical recordings viewable.
- Build output in `build/` and `.svelte-kit/` is generated. Edit source, then use
  `pnpm build` or `pnpm typecheck` to regenerate it. Keep dependency policy in
  the root `pnpm-workspace.yaml`; do not bypass its build-script allowlist.
- Use disposable databases for trials and load smoke tests; they write rooms and
  recordings. Never substitute real participant data for fixtures. Deployment and
  restoration are separate operational actions, not part of ordinary verification.
- Keep research distinctions intact: documented product behaviour, disclosed
  mechanisms and Puck choices are different evidence categories. Passing tests
  or replaying inputs does not establish improved group decisions.

Use British English, Latin American Spanish and metric units in prose. Arena
coordinates are normalised units, not physical measurements.
