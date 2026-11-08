# Running Puck

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

HTTP mutation rate limits currently use the direct socket address: 60 requests per minute. Behind a proxy this may be shared by clients. Configure edge rate limiting and revisit trusted-proxy address handling before opening a public service. Do not trust arbitrary client-provided forwarding headers.

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
- `pnpm load:smoke -- http://localhost:3000`: 32 synthetic participants, capacity enforcement, host-only controls and a shared selected result. Snapshot-gap measurements are local transport observations, not internet latency benchmarks.

The load smoke test creates a new room and recording. Run it against a disposable database when persistent synthetic sessions are unwanted.

## Known operational limits

Completed recordings are written as one JSON value. Active frames are buffered until the round ends. A crash preserves the interrupted round marker but not buffered frames. There is no automatic retention/deletion policy yet. The host's browser cookie is the host capability; there is no account recovery.

The service logs round completions and simulation overruns. It does not yet provide historical latency dashboards or managed alerting. An actual host deployment, load profile and human pilot remain necessary before claiming production readiness.

## Dependency audit

On 8 November 2026, `pnpm audit --prod` reported one low-severity [deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), with no patched release listed. It enters the dependency graph through SvelteKit's Vite plugin; the inspected use merges build configuration in the plugin's `src/utils/options.js`. Puck's request handlers do not call deepmerge. The advisory remains tracked rather than suppressed or described as resolved.
