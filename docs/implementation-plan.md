# Successive vertical slices

Each slice includes its browser-visible outcome, relevant tests and documentation. A completed technical slice does not establish decision quality.

| Slice                    | Acceptance boundary                                                                                                                            | Current state                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1. Pull together         | Two authenticated browser contexts see one authoritative puck; each has only its own live magnet; development and production server paths work | Implemented; automated production-browser test and development-browser check |
| 2. Complete a decision   | Create/join, countdown, continuous target dwell, timeout and host cancellation yield consistent outcomes                                       | Implemented; engine and browser tests                                        |
| 3. Inspect a decision    | Persist and replay applied inputs and states; authorised participants can export; engine re-simulation matches                                 | Implemented; storage, engine and replay-access tests                         |
| 4. Survive participation | Reconnect without multiplying influence, reject malformed input, expire stale inputs, mark interrupted rounds; responsive input surface        | Implemented baseline; broader device and assistive-technology trials remain  |
| 5. Run a pilot           | Verify configured capacity, backup/restore and actual deployed WebSocket behaviour; observe latency and failures                               | Local preparation; real deployment and human pilot remain                    |
| 6. Compare mechanisms    | Preserve baseline and assign recorded variants; collect private ballots and acceptance; analyse position sensitivity                           | Planned                                                                      |

## Next pilot work

1. Test on the chosen host behind its actual HTTPS reverse proxy.
2. Rehearse graceful shutdown and restore from a backup on that host.
3. Run a small human session, observing touch ergonomics and how readily participants maintain magnet proximity.
4. Collect participant feedback separately from the puck outcome.
5. Decide whether synchronous recording writes need a worker, using tick-overrun measurements.

## Later experimental slices

- Counterbalanced option layouts, with layout assignment recorded.
- A separately versioned centre-restoring correction based on disclosed mechanisms.
- Personalised layouts with input mapping by option identity.
- Alternative force curves and dwell thresholds.
- Adaptive weighting only with a stated hypothesis and explicit participant treatment.

Do not replace the baseline silently when adding a variant. Avoid building a generic plugin framework before the first variant exists.

## Deferred product scope

Accounts and recovery, organisations, chat, AI-generated options, anonymous anti-Sybil controls, active-round crash recovery, multi-replica ownership and unlimited participant counts are not part of this baseline. Clearing cookies currently loses the guest/host identity. A room accepts new identities only between rounds; reconnecting existing participants remain eligible only if they were in that round's starting roster.
