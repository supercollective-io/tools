# Successive vertical slices

Each slice includes its browser-visible outcome, relevant tests and documentation. A completed technical slice does not establish decision quality.

| Slice                    | Acceptance boundary                                                                                                                            | Current state                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1. Pull together         | Two authenticated browser contexts see one authoritative puck; each has only its own live magnet; development and production server paths work | Implemented; automated production-browser test and development-browser check                             |
| 2. Complete a decision   | Create/join, countdown, continuous target dwell, timeout and host cancellation yield consistent outcomes                                       | Implemented; engine and browser tests                                                                    |
| 3. Inspect a decision    | Persist and replay applied inputs and states; authorised participants can export; engine re-simulation matches                                 | Implemented; storage, engine and replay-access tests                                                     |
| 4. Survive participation | Reconnect without multiplying influence, reject malformed input, expire stale inputs, mark interrupted rounds; responsive input surface        | Implemented baseline; broader device and assistive-technology trials remain                              |
| 5. Run a pilot           | Verify configured capacity, backup/restore and actual deployed WebSocket behaviour; observe latency and failures                               | Public interface and health checked on 12 November 2026; deployed round, recovery and human pilot remain |
| 6. Compare mechanisms    | Preserve baseline; record modes, correction and personal layouts; replay raw/mapped inputs                                                     | Implemented experimental modes; human comparisons remain                                                 |

## Next pilot work

1. Test a complete WebSocket round behind the deployed HTTPS reverse proxy; public interface and health checks have passed.
2. Rehearse graceful shutdown and restore from a backup on that host.
3. Run a small human session, observing touch ergonomics and how readily participants maintain magnet proximity.
4. Collect participant feedback separately from the puck outcome.
5. Decide whether synchronous recording writes need a worker, using tick-overrun measurements.

## Current experimental scope

Implemented: advanced mode selection, recorded centre-restoring correction, and proportional personalised layouts. See [Experimental modes](experimental-modes.md) for mechanics, limitations and recording semantics. Baseline remains the default.

Next: simplex UI prototypes. Other proposed additions remain deferred. Adaptive participant weighting and fictional expert/AI claims are excluded. Asynchronous representative agents are only a possible future experiment, with substantial concerns about replacing mutual adaptation with simulated participation.

Do not replace the baseline silently when adding a variant. Avoid building a generic plugin framework before it is needed.

## Deferred product scope

Accounts and recovery, organisations, chat, AI-generated options, anonymous anti-Sybil controls, active-round crash recovery, multi-replica ownership and unlimited participant counts are not part of this baseline. Clearing cookies currently loses the guest/host identity. A room accepts new identities only between rounds; reconnecting existing participants remain eligible only if they were in that round's starting roster.
