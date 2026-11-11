# Architecture

## One process, explicit ownership

The custom Node HTTP server serves the SvelteKit application and handles `/api/` requests and `/ws/rooms/:id` upgrades. Development mounts Vite into that same HTTP server. Production imports the Node adapter's built handler. Both use one `SessionService`; there is no duplicated bundled-module singleton.

- `src/lib/core/engine.ts`: pure fixed-step mechanics, independent of browser, transport and storage.
- `src/lib/core/protocol.ts`: shared types and runtime input schemas.
- `server/service.ts`: membership, live connections, round lifecycle, input application and broadcasting.
- `server/store.ts`: SQLite schema and round persistence.
- `server/index.ts`: HTTP, cookies, origin checks, socket upgrade and shutdown.
- `src/lib/components/Arena.svelte`: rendering and pointer/keyboard input; no authoritative physics.

One process can own several rooms. There are at most 4 active rounds, 140 registered participants per room by default (configurable from 2 to 180), and 100 cached rooms. Idle rooms can be evicted from memory and loaded from SQLite. These are configured resource bounds, not measured production capacity promises.

## Baseline v1

All values below are Puck implementation choices unless the research notes identify an external source.

| Parameter                | Value                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| World                    | 1000 × 1000 normalised arena units; square on every display                                        |
| Simulation               | 50 ms fixed steps; approximately 20 broadcasts per second                                          |
| Countdown / active limit | 3 seconds / 60 seconds                                                                             |
| Selection                | Entire puck inside a target for 1.5 continuous seconds while at least one applied input is engaged |
| Influence                | Equal maximum contribution, normalised by participants connected at round start                    |
| Distance response        | Linear decrease beyond the puck/magnet rims; zero beyond 170 units of rim separation               |
| Motion                   | Semi-implicit velocity update, exponential damping, speed and boundary caps                        |
| Missing input            | Disengaged after 750 ms without an accepted update                                                 |
| Option layout            | 2–6 equally spaced targets around a circle; stable throughout a round                              |

A stationary magnet remains a stationary point in arena coordinates. It does not automatically follow the puck. Participants must hold the pointer or Space to engage. The browser sends the current magnet position every 50 ms, including when it has not moved. Pointer release, blur and hiding the page disengage input. Keyboard arrows move the magnet; holding Space pulls.

A countdown, active round and terminal result are server-owned. Terminal outcomes are `selected`, `timed-out`, `cancelled` and `interrupted`. Centre deadlock never selects an option. Re-entering a target starts a new dwell period. Selection is not labelled unanimity.

The round freezes its starting roster from the registered participants with live sockets. The `participantCount` in the recorded configuration remains the force normalisation denominator for the full round; later disconnects do not change it. Room status distinguishes registered, connected, recently engaged, and frozen starting-roster counts. The client interpolates snapshots for display. Reduced-motion mode removes interpolation. Baseline uses the same server coordinates for force and selection regardless of screen dimensions. Experimental personalised modes project those coordinates and map local inputs by option proportions; selection remains canonical. See [Experimental modes](experimental-modes.md).

## Network and authority

Each participant has an opaque credential in an HttpOnly, SameSite cookie. The database stores its SHA-256 hash. HTTPS origins use Secure cookies. The server requires the configured origin for HTTP mutations and WebSocket upgrades.

The socket identity comes from the credential, not the message payload. One current connection supplies one participant's input. A replacement connection closes its predecessor, whose subsequent messages are ignored. Sequence numbers reject duplicate/old inputs. Coordinates, numeric finiteness, message shape, frame size and message rate are bounded. Slow clients are disconnected instead of accumulating unbounded output.

Live messages include the shared state and membership; they do not contain other participants' magnet inputs. Completed recording endpoints require membership in the original room. The host capability is separate from the shared invitation.

## Recording and failure

Each step records the inputs actually applied, including disengaged missing participants, and its resulting state. A recording also includes options, initial participant roster, engine version, full parameters and start time. JSON export omits credentials. Cancellation and interruption are explicit terminal overrides recorded in `result`; the last physics frame may precede that override.

Replay displays recorded states. Re-simulation tests use the same version of the engine and ordered inputs. Cross-version or cross-runtime bit-for-bit identity is not promised.

SQLite records a round's start before it runs and commits the full bounded recording when it finishes. Recording frames are released from memory after the final write. A crash leaves an active marker; startup converts it to `interrupted`. Graceful shutdown persists the available partial recording. Active crash recovery is deliberately not implemented.

SQLite uses WAL. Recording writes occur after simulation completion, but they are synchronous in this version. Measure finalisation pauses before increasing concurrent capacity; a storage worker is the next step if those pauses approach the 50 ms budget.

## Growth criteria

Keep this architecture until measurements justify a change. Multiple replicas require a room ownership/routing design; replacing SQLite with Postgres alone is insufficient. Python can support offline research without joining the runtime path. Consider Rust only after profiling identifies a substantial CPU bottleneck.
