# Running Puck

Run package commands below from `apps/puck`; tool versions, dependency policy and the lockfile live at the monorepo root. From that root, `mise exec -- just puck <command>` selects Puck.

## Development

Use the mise commands in the README. Development mode binds to `0.0.0.0`, port `3000`, and detects private IPv4 addresses for phone invites. Localhost and those detected origins are allowed for mutations and WebSockets. QR codes and copied invitations use the preferred network address, or `PUBLIC_ORIGIN` when set. Production keeps the default bind address `127.0.0.1` and permits only `PUBLIC_ORIGIN`. Set `HOST=127.0.0.1` to keep development local to this device.

For a local network test, select the machine's reachable address and set all corresponding values explicitly:

```sh
HOST=0.0.0.0 PORT=3000 PUBLIC_ORIGIN=http://192.168.1.20:3000 mise exec -- pnpm dev
```

Replace the example address with the actual host. The same origin is required for socket upgrades and mutations. Use HTTPS when hosting beyond a trusted local network.

`.env.example` documents configuration. The application does not silently load `.env`; export variables or configure the process manager.

## Production

Prerequisites: mise, durable local storage, one application process and a reverse proxy that forwards WebSocket upgrades.

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm verify
PUBLIC_ORIGIN=https://puck.example.org HOST=127.0.0.1 PORT=3000 DATABASE_PATH=/srv/puck/puck.sqlite mise exec -- pnpm start
```

Replace the example hostname and database path. The process user must own the database directory. Keep the proxy idle timeout longer than a round and forward the WebSocket upgrade headers. Route `/api/`, `/ws/`, assets and page requests to the same instance. Do not enable multiple Node workers against this in-memory session service.

`GET /healthz` returns a readiness response. SIGTERM stops admission, records active rounds as interrupted and closes connections. Restarted clients reconnect automatically and may start a new round; ongoing decisions are not silently resumed.

HTTP mutation rate limits use the direct socket address: 240 requests per minute by default, configurable with `PUCK_HTTP_MUTATION_LIMIT` from 60 to 1000. This supports room admission behind a shared venue NAT. Behind a proxy the address is shared by clients. Configure edge rate limiting and revisit trusted-proxy address handling before opening a public service. Do not trust arbitrary client-provided forwarding headers.

## Backup and restore

Create a consistent backup with the SQLite backup API, rather than copying a live WAL database file:

```sh
mise exec -- pnpm backup -- /srv/backups/puck-2026-11-08.sqlite
```

To restore, stop the server, preserve the current database directory, and restore the backup to a fresh directory. Point `DATABASE_PATH` at that restored file and start the server. Confirm `/healthz`, room membership and an existing recording before admitting participants. Never combine a restored database with WAL/SHM files from a different database generation.

Backups contain participant names, room questions and recorded inputs. Keep them private. Guest credentials are stored as hashes; browser cookies are still needed to rejoin as the original identity.

## Verification

- `pnpm verify`: formatting/lint, types, unit tests and production build.
- `pnpm test:e2e`: two separate browser contexts, shared motion, reconnect, replay permissions and narrow-screen keyboard controls.
- `pnpm load:smoke -- http://localhost:3000 [participants]`: synthetic participants exercise HTTP admission and actual WebSocket fan-out, reconnect, stale-input expiry and completed replay. Run it at 50, 100 and 140 with default `PUCK_ROOM_CAPACITY=140`. For the 180-participant overload scenario, start a disposable server with `PUCK_ROOM_CAPACITY=180`. Snapshot-gap measurements are local transport observations, not internet latency benchmarks.

The load smoke test creates a new room and recording. It produces one recording whose size grows with participants and frames. Run it against a disposable database when persistent synthetic sessions are unwanted; it does not establish public-internet or real-device capacity.

### Coolify packaging

Use a Git-backed **Application** with the Dockerfile build strategy, Tools monorepo root as Base Directory, `apps/puck/Dockerfile` as Dockerfile Location, and internal port `3000`. Configure the domain as `https://puck.supercollective.io` targeting port 3000. Import the repository-root [`.env.sample`](../../../.env.sample) through Smart Scan, with all entries runtime-only. Enable Coolify default variables and interpolation, and configure one canonical HTTPS domain. Set runtime variables `PUBLIC_ORIGIN=$COOLIFY_URL` (resolving to `https://puck.supercollective.io`), `HOST=0.0.0.0`, `PORT=3000`, `DATABASE_PATH=/data/puck.sqlite`, and `PUCK_ROOM_CAPACITY=140`. Attach durable writable storage at `/data`; retain one application process and one SQLite database. The image health check calls `/healthz`. Verify the Coolify proxy forwards WebSocket upgrades and has an idle timeout longer than the 60-second round. Configure backups for the mounted database and practise restoration before participant use. This repository change prepares the image; it does not configure Coolify, DNS, TLS or a live deployment.

The participant room page links back to [Rehearsing We](https://we.supercollective.io). The hub and Puck remain separately deployed.

### Focused checks and diagnostics

Run from `apps/puck`, using the root-pinned tools:

```sh
mise exec -- pnpm test tests/engine.test.ts
mise exec -- pnpm build
mise exec -- pnpm exec playwright test tests/e2e/round.spec.ts
```

The direct Playwright command uses the existing build; rebuild after application
changes, or use `pnpm test:e2e` to build and run the entire browser suite. Unit
tests do not need a running server. Browser tests start their own server, refuse
to reuse an existing one and remove their temporary database on normal exit.

The default E2E port is 4173. If it is occupied, select a free port with
`E2E_PORT=4273 mise exec -- pnpm test:e2e`. Separate worktrees need different
ports; do not run simultaneous builds or test runners in the same checkout,
because build output and `test-results/` are shared there. Do not stop unrelated
processes to free a port.

Failures retain traces and screenshots under `test-results/`. Inspect the error
and artefacts before retrying. Open a trace with
`mise exec -- pnpm exec playwright show-trace <path-to-trace.zip>`.
These are Playwright's [test artefact options](https://playwright.dev/docs/test-use-options).
If Chromium is missing, run `mise exec -- pnpm exec playwright install chromium`
(Linux CI uses `--with-deps`). A socket `EPERM` in a restricted runner is an
environment failure: local server sockets and browser execution must be allowed.
Do not count skipped browser tests as passed.

### Disposable manual and load checks

After building, run the existing test server in one terminal:

```sh
HOST=127.0.0.1 PORT=4273 PUBLIC_ORIGIN=http://localhost:4273 mise exec -- pnpm exec tsx scripts/test-server.ts
```

It creates a temporary SQLite database and deletes it on normal exit. It ignores
an inherited `DATABASE_PATH`. Check `http://localhost:4273/healthz` for
`{"status":"ok"}`, then use the interface or run, in another terminal:

```sh
mise exec -- pnpm load:smoke -- http://localhost:4273
```

Expect a successful exit and JSON reporting the requested participant count and an agreed result.
Stop only this server with Ctrl-C when finished. Forced termination can leave its
`puck-e2e-*` temporary directory behind. This exercise does not verify backups or
production deployment.

### Agent readiness trial

Instruction discovery and agent performance require a separate fresh-session
trial; the software checks above do not measure them. In a disposable checkout
with the pinned tools and Chromium installed, start a fresh agent at `apps/puck`,
then repeat from `apps/puck/src/lib/core`. Give each session this task with a 10-minute
limit: “Find the repository guidance, run the focused engine tests and the round
browser tests on port 4273, and explain the limits of that evidence. Do not edit
files or use persistent participant data.”

Check the tool transcript for discovery of root and Puck `AGENTS.md` files, correct mise
commands, a build before Playwright, successful test exits and no writes to
`data/`. Require the answer to distinguish software behaviour from decision
quality. Record revision, agent/model, elapsed time, failures and interventions;
compare equivalent before/after checkouts before claiming improved agent outcomes.

## Known operational limits

Completed recordings are written as one JSON value. Active frames are buffered until the round ends. A crash preserves the interrupted round marker but not buffered frames. There is no automatic retention/deletion policy yet. The host's browser cookie is the host capability; there is no account recovery.

The service logs round completions and simulation overruns. It does not yet provide historical latency dashboards or managed alerting. An actual host deployment, load profile and human pilot remain necessary before claiming production readiness.

## Dependency audit

On 8 November 2026, `pnpm audit --prod` reported one low-severity [deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), with no patched release listed. It enters the dependency graph through SvelteKit's Vite plugin; the inspected use merges build configuration in the plugin's `src/utils/options.js`. Puck's request handlers do not call deepmerge. The advisory remains tracked rather than suppressed or described as resolved.
