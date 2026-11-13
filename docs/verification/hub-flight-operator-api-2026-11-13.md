# Flight operator API and Hub profile preparation

The Flight operator page and Hub now read the same Flight session resources:
`GET /api/operator/sessions` and `GET /api/operator/sessions/current`. The relay
owns one current flight; preparation does not start or reset a simulator.

Hub uses the private `HUB_FLIGHT_TOKEN` and its profile's `connections.flight`
resource declaration. The service uses a distinct `FLIGHT_OPERATOR_TOKEN`.
Preparation retrieves and validates the audience invitation; showing it retains
Hub's separate cue action. The existing manual invitation override remains.

## Evidence

- Full Tools `mise exec -- just verify`: passed.
- Focused Hub verification: 29 tests passed, including automatic Flight
  preparation, token separation, rejected destination, missing configuration,
  retry, audience-key rotation and saved binding recovery.
- `mise exec -- just test-browser-hub`: both ordinary and show-profile flows passed
  using fake upstream services. The profile launches without manual Flight input.
- Flight Python suite: 148 tests passed. After tightening Bearer parsing, the
  focused operator API and relay tests passed again (15 tests).
- Flight JavaScript phone, projection and relay suites: passed.
- Disposable Flight browser check: wrong-token feedback, successful sign-in,
  shared resource retrieval, participant invitation, sign-out and mobile overflow
  check passed at 1200 × 850 and 390 × 844. The synthetic relay was stopped.
- Inspected Flight desktop/mobile screenshots and Hub profile preparation/mobile
  and live-cue/desktop screenshots. Flight's invitation and connection status are
  readable; Hub retains its existing components and preparation hierarchy.
- Source review used the current Vercel Web Interface Guidelines. The Impeccable
  detector reported an existing Helvetica font parsing warning in Hub; the
  established type system is unchanged. No setup changes were made.

Flight screenshots are under `test-results/design/hub-flight/` (ignored). Hub's
browser scripts print their temporary screenshot directories. Evidence applies to
this source patch, not a deployed release or actual simulator/phone rehearsal.

## Deployment boundary

No services were deployed and no live programme was changed. Enable the shared
operator token and allow the Flight origin once at installation, after deploying
the compatible API. The operator token never enters a participant invitation.
Flight readiness is a connection observation; aircraft handling, pause and reset
remain local. A repeated preparation refreshes the saved run's audience link, but
an installed ready invitation is not silently replaced following key rotation.
