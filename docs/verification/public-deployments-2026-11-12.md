# Public deployment review — 12 November 2026

All five public interfaces loaded successfully in a browser over HTTPS. Anonymous
HTTP checks also confirmed the service health and access boundaries below. These
are checks of the deployed services, not inferred results from local builds.

| Application | Public interface | Observed result |
| --- | --- | --- |
| Hub | [we.supercollective.io](https://we.supercollective.io) | HTTP 200; browser renders the waiting invitation. `/healthz` returns HTTP 200 with `ok: true`; `/print` renders the entrance card and QR for the canonical origin. Anonymous `/api/operator/state` returns 401. |
| Puck | [puck.supercollective.io](https://puck.supercollective.io) | Browser renders the create-room form, options and controls. `/healthz` returns HTTP 200 with `status: "ok"`. |
| Flight | [fly.supercollective.io](https://fly.supercollective.io) | HTTP 200; browser renders the performance invitation instructions and project/return links. `/healthz` returns HTTP 200 with `ok: true`. Anonymous `/status`, `/projection` and `/relay.js` return 403. |
| Hyperchat | [chat.supercollective.io](https://chat.supercollective.io) | HTTP 200; browser renders join/create-session controls. All 13 homepage-linked JavaScript/CSS assets return 200 with appropriate MIME types. The API origin referenced by deployed JavaScript, `https://api.chat.supercollective.io`, returns HTTP 200 and `status: "ok"` at `/health`, with the web origin allowed by CORS. |
| Polymind | [polymind.supercollective.io](https://polymind.supercollective.io) | Browser runs the session client and displays the expected instruction to open a session link from Rehearsing We when no session is supplied. `/healthz` returns HTTP 200 with `status: "ok"`. Anonymous `/api/operator/sessions` returns 401. |

HTTPS certificate verification succeeded for the HTTP checks. Browser pages loaded
without a certificate interstitial. The Polymind page retains its initial
“Loading question…” heading without a session; its explanatory message confirms
that the client executed, but this check does not exercise a session join.

No sessions or rooms were created, participant content retrieved, operator state
changed, providers invoked or deployments performed. Two cheaper-model subagents
assisted with read-only HTTP/source checks; browser observations were completed
by the parent agent because subagent browser surfaces were unavailable.

## What remains unverified

- Exact running source revisions, immutable images and private Coolify settings.
  The public pages do not expose enough provenance to identify the whole builds.
- Matching worker packaging and execution in the deployed Polymind image.
- Authenticated operator workflows, complete joins, contribution persistence,
  private results, return/recovery and production WebSocket rounds.
- FlightGear bridge, actual simulator response, projection and OBS.
- Hyperchat database/Redis, scheduler, provider execution and complete exchanges.
- Physical phones, QR scanning, venue networks, capacity, restart and isolated
  backup restoration, and human/artistic usefulness.

Health responses have different scopes: Polymind performs a SQLite `SELECT 1`,
and the hub checks readiness/writable storage. Puck and Flight primarily report
process readiness/liveness; Hyperchat's health handler does not check backing
dependencies. A healthy endpoint does not complete the remaining workflow gates.

The [release manifest](../../deploy/release-candidate.json) records confirmed
public deployments and HTTPS evidence while retaining unknown revision/artefact
fields and incomplete human/operational gates. Its `matching.deployed: false`
means deployed worker execution is not confirmed by this review, not that the
public Polymind service is absent. Historical local reports retain their original
scope and dates. Full release acceptance remains incomplete.
