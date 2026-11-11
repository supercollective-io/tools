# Remaining work before the first release

Tools has never been deployed. Repository consolidation is complete; source
history remains in Git. Start deployment with fresh data. No legacy session
migration, old-cookie transition or production cutover is required.

Use [implementation status](docs/implementation-status.md) for current
capabilities, [architecture](docs/adr/0001-boundaries.md) for ownership and
[operations](docs/operations.md) for the operator workflow. Polymind and Match
share an image; Puck and the hub each have their own image and data volume.
The hub lives in `apps/hub`; Flight remains a separate repository and deployment.

## Deployment and recovery

- [ ] Select hosting and public HTTPS domains; configure authenticated operator
  access and participant destinations using the [deployment guide](deploy/README.md).
- [ ] Build and verify the exact candidate images. Record deployed revisions and
  immutable artefacts in [the release manifest](deploy/release-candidate.json).
- [ ] Check join, save, same-browser return, new-browser recovery, private result
  release, projection and restart on mobile data and venue Wi-Fi.
- [ ] Rehearse [backup and isolated restore](docs/ops-backup.md) on the chosen host.
  Retain a verified backup before future state changes; an image rollback alone
  does not reverse database changes.
- [ ] Verify Puck WebSockets, graceful shutdown and restore behind the real proxy.
- [ ] Verify Flight controls against actual FlightGear, including stale controls,
  connection loss, local override, OBS/projection and recovery.
- [ ] Configure hub destinations and rehearse the complete entrance/return sequence.

Deployment is a separate authorised action. Local builds and synthetic trials
are preparation, not evidence that a public deployment exists.

## Participant and provider rehearsal

- [ ] Test bounded recording, playback, transcript correction and confirmation on
  physical iOS and Android phones in representative noise. Keep typed input available.
- [ ] Define and disclose audio/text retention before capturing real participants.
- [ ] With an explicit provider budget, measure full analysis and matching latency
  at the real roster size. Choose the criterion from the input and artistic goal;
  review trio handling, pair reasons and meeting locations before release.
- [ ] Test recognition, missing differences, useful questions and participant
  understanding of saved versus confirmed contributions. Software tests cannot
  establish artistic quality.
- [ ] Run a human Puck round and assess touch ergonomics, responsiveness and clarity.
- [ ] Verify target-scale behaviour with the chosen hosts and venue network; local
  loopback measurements do not establish venue capacity.

## Score, space and fallback

Keep the detailed score, floor plan and equipment list in `rehearsing-we/performance`.
The opening invitation remains “What is something you’d like to change, but can’t
change on your own?” unless deliberately revised as a programme choice.

- [ ] Rehearse a timed sequence with entry/exit cues, operator and audience actions,
  transitions and explicit fallbacks. Allow time for finding partners and conversation.
- [ ] Make an earlier activity consequential for a later one and give participants
  a real bounded choice about the process. Do not present majority motion as unanimity.
- [ ] Select one analogue exercise after trying the actual equipment and accessible
  variants: Helium Stick or a representation/power exercise. Avoid adding both by default.
- [ ] Inspect the usable venue floor. Mark exits, seating, accessible circulation,
  projection, operators and meeting zones. At 140 participants, plan for 70 pairs,
  including seated rendezvous and absent-partner assistance.
- [ ] Use high-contrast signs and symbols/numbers; avoid colour-only identification.
  Assign locations from verified space, never model-invented coordinates.
- [ ] Verify the booked projection/audio setup and walk through movement at realistic
  density. Prepare clear alternatives for late matching, network loss and dropped blocks.
  Disclose manual or random fallback pairings as such.
- [ ] Run the full show with phones, people, movement and projection before release.

Freeze programme scope before the final rehearsal. Live speech, camera control,
connection graphs, a Pi display and Hyperchat remain deferred unless explicitly
selected with their own time, equipment and rehearsal gates. Hyperchat requires
an exchange block, not an unplanned extra activity.

## Release acceptance

Complete the evidence in the release manifest and run
`mise exec -- just release-check`. Its checks validate recorded fields, not the
truth of human-entered evidence. The release needs verified public access,
phone return, audio, provider budget/latency, private encounters, backup/restore,
FlightGear, projection, accessible locations and a timed human rehearsal.

After the event, use observed needs to choose further work. Extract shared
modules only when multiple real consumers justify them; preserve independent
fast control loops and slow model jobs. Public source publication also requires
an explicit licence and release-policy review.
