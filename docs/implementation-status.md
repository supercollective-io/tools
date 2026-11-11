# Current implementation and release gates

Tools has never been deployed. Initial deployment starts with fresh session data;
no legacy data import or cutover is required. Existing local research journals
remain readable through the voice CLI. Private research data stays outside Git.

| Area | Implemented and checked | Remaining gate |
|---|---|---|
| hosting | Exact HTTPS Host/Origin checks, authenticated operator controls, secure guest cookies, single-writer locking, health, Dockerfile and Coolify settings | Actual Coolify resources, DNS/TLS, public phones, deployed artefact |
| sessions and contributions | Identity without composer; recovery codes; independent rounds; 140 capacity/180 ceiling; revision conflicts/idempotence; confirmed snapshots; fresh session creation | Real participant comprehension |
| operations | Durable jobs, explicit retry/interruption/cancellation, model/context budgets, source validation, separate analysis and bounded voice, private completion and reveal | Representative human-input model rehearsal and artistic review |
| matching and encounters | In-repository Match package; generic weighted allocation; disclosed trio heuristic; collaboration and embedding similarity; prior-pair exclusions; private persistent partner results, verified-zone suggestions and assistance queue | Real provider latency/cost at capacity; reviewed criterion and physical encounters |
| bounded audio | Browser recording/playback, private bounded uploads, four-worker queue, transcript correction, explicit confirmation, retention cleanup and typed fallback | Physical iOS/Android, venue acoustics and real provider burst/quotas; server validates bytes/container signature, not decoded duration |
| Puck | Configurable capacity, count distinctions, unchanged force denominator, return link, verified production image; 50/100/140/180 synthetic WebSocket trials | Public deployment and human round |
| Flight | Authenticated hosted relay, outbound simulator bridge, generations/freshness, independent expiry, explicit Join/Observe, local override, projection status, return link | Public controls driving actual FlightGear, OBS and venue recovery |
| hub | In-repository, independently deployed service in `apps/hub`; authenticated phase control, atomic revisions, mobile polling entrance, waiting/analogue/closing, return navigation and printable QR | Verified participant destinations and whole-show phone transitions |
| Score and space | Timed score, equipment/accessibility draft and disabled zone proposal in `rehearsing-we/performance` | Venue floor inspection, chosen analogue exercise, timed human rehearsal |

## Verification evidence

Run `mise exec -- just verify` for current lint, types, synthetic tests, worker
contracts and builds. Run `mise exec -- just test-browser` for all three applications.
See [deployment](../deploy/README.md) for container checks and
[backup and restore](ops-backup.md) for isolated recovery checks.

Saved reports describe the revisions and synthetic conditions recorded in them:

- [Polymind 140-client load](verification/polymind-140.json) and
  [180-client overload](verification/polymind-180-overload.json).
- [Matching benchmark](verification/matching-benchmark.json), excluding provider time.
- [Polymind container baseline](verification/polymind-container.json).
- [Match package and container integration](verification/match-monorepo.json).
- [Puck workspace and container integration](verification/puck-monorepo.json).

These reports are historical evidence, not verification of every subsequent
revision. Synthetic tests do not establish model usefulness, human comprehension,
venue networking or physical-device behaviour.

## First release

The [release manifest](../deploy/release-candidate.json) keeps local candidates
separate from deployed artefacts. `mise exec -- just release-check` must continue
to fail until real evidence and exact deployed revisions/images are recorded.
Follow the [remaining work](../IMPLEMENTATION_PLAN.md); deployment and paid
provider rehearsals require explicit authorisation.
