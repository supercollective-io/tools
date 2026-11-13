# Show profile operation

## Audience and setting

The operator is also organising and performing the room. Laptop is the primary
show device; a narrow phone layout remains supported for preparation and recovery.
The named profile is for the ZKM show on 14 November 2026. Participants enter
through the public Hub invitation and remain in the destination app until they
return to Hub. The operator needs a clear current invitation, an intentional next
cue, and visible separation between Hub invitation state and each app's status.

## Profile and running order

The source profile is
[`zkm-production-show-14-11-2026`](../../apps/hub/profiles/zkm-production-show-14-11-2026.json).
Its revised sequence is Arrivals room (waiting), 1 · Record individually, 2 ·
Analogue objects, 4 · Groups of four, All · Polymind analysis, Collective Voice,
Puck, and Flight. The closing invitation is removed. Installing a new run preserves
the current waiting invitation exactly.

The profile's writing question is “What is something you’d like to change, but
can’t change on your own?” Its Collective Voice question is “What would you like
us to become capable of together that feels impossible alone?” Its Puck question
is “What shall we do with this plane?” The room proposes Puck's answers. They may
be omitted when creating the run, then entered as two to six distinct options
before the room is prepared. Its `activityBindings` maps the 1 and All cues to
one bounded Polymind session and round. Collective Voice has its own session.

## Operational decisions

- **Preparation** creates or resumes a saved run. One production run is allowed
  per profile; each fresh rehearsal receives a new run ID and new app resources.
  An interrupted request can be retried with the same settings to recover its
  existing run or resource.
- An unprepared run's questions, model settings, Puck question/options and Flight
  invitation can be edited with its current run revision. Hub checks the
  required app token and participant allowlist before it freezes settings for
  the first app preparation request. After that request may have reached an app,
  resume and retry with the same settings or create a fresh rehearsal.
- Preparation creates separate Polymind sessions for bounded writing and
  continuous Collective Voice. Hub writes only the Polymind preparation draft;
  the compatible Polymind version must support the draft API. This does not open
  writing, start voice, create a round, call a model or publish a result.
- At 1, participants record individually on their phones. Polymind needs
  `TRANSCRIPTION_MODEL` and its provider credentials (`OPENAI_API_KEY`), secure
  HTTPS and microphone permission. The operator decides timing and gives a clear
  stop-recording cue; there is no fixed duration timer. Participants choose
  **Stop recording**, transcribe, review and correct the text, apply it to their
  contribution and wait for **Saved**.
- Only after every contribution shows **Saved**, choose **Close collection without
  analysis** in Polymind. This freezes the exact saved contributions without a
  provider call. Closing collection stops an active phone recording on the next
  state refresh and excludes unsaved transcripts; it does not leave time to review
  or save after closure. Keep the round frozen through 2 (pairs with analogue
  objects) and 4 (groups of four). A late transcript cannot be added after closure.
  Successful transcription removes the raw audio. Analysis uses the reviewed
  saved text, not an audio archive. Uploads are bounded at 8 MiB as a technical
  safeguard, not a duration cap; the server does not validate decoded media
  duration. At All, use
  **Analyse frozen writing** in the same session and round. If collection remains
  open, use **Close writing and analyse**. Polymind analyses the original 1
  contributions and automatically publishes the overview. Hub cues do not invoke
  this analysis or generate model output.
- **Prepare Puck with these options** creates or recovers a room after options are
  saved. It connects the participant invitation but does not start the round.
- Flight uses the configured `karlsruhe-747-landing` scenario. The operator loads
  it and connects the bridge locally, checks readiness, and leaves FlightGear
  paused before the cue. The operator rechecks readiness before cueing, releases
  phone controls before unpausing locally, and keeps the bridge credential in
  Flight's private configuration. Hub neither launches Flight nor checks its
  simulator readiness.
- **Launch show** requires the current invitation to be waiting when
  installing a different run. It retains that exact waiting invitation. For the
  already-installed run, it can connect newly prepared, non-current invitations
  that remain unavailable while preserving the live cue and existing edits.
- **Live cues** changes only the Hub invitation. App-specific start, resume, end,
  analysis, release and round actions stay in their own operator pages. A saved
  link is not evidence that the app is reachable or ready. Flight readiness is
  checked locally.
- `state.json` stores the live programme and its run reference. `runs.json` stores
  private run settings, resource bindings and an optional Flight participant URL.
  It also stores private per-run operator notes, which appear in the authenticated
  operator view and not in the public invitation. Back up and restore both files
  together; keep them private. Existing saved runs keep their stored invitation
  sequence when the source profile changes; create a new rehearsal for the revised
  sequence.

## Interface decisions

The operator page is titled **Show controls** and separates **Preparation** from
**Live cues** with keyboard-operable tabs. Live cues identify the **Current
invitation** and a **Next activity** separately. Cue actions say **Show
invitation: …**. App status is labelled as app status; it does not replace the
Hub's saved invitation state. **Refresh app checks** checks configured apps
without changing the programme. Flight copy states that simulator readiness is
not checked in Hub.

Polymind and Collective Voice have separate session-scoped controls links. Puck's
operator link remains separate from its participant invitation. Links open app
controls in a new tab and do not start activity or transfer a role. Use the
canonical participant invitation returned by Polymind; do not reconstruct it from
a session identifier.

## Verification

Checked on 13 November 2026 in the `show-profile-operation` worktree:

- `mise exec -- just verify` passed: lint, types, unit/integration tests and builds.
- `mise exec -- just test-browser` passed: Polymind participation and show flows,
  seven Puck browser tests, Hub invitation/navigation checks and the new profile
  preparation/resume flow. All providers and upstream resources were synthetic.
- The final `mise exec -- just hub verify` passed 25 tests, including upgrade of
  incomplete saved invitations, uncertain creation responses, settings edits,
  concurrent option revisions and delayed Puck preparation during another cue.
- Desktop (1440 × 1000 px) and mobile (390 × 844 px) captures were inspected.
  Reproduce them with `mise exec -- just test-browser-hub`; retained local evidence
  is in `test-results/design/show-profile-operation/`. Independent rendered
  critique led to moving general app links below live cues and showing the Puck
  question and pending room options in the run summary.
- The repository Web Interface Guidelines review used the fetched rules with
  SHA-256 `d246b026f4f29b5823a9cc857f9edf3d2507002e055e32040cadeaf3b38e0234`.
  Labels, keyboard tabs, focus, error feedback, URL view state and overflow were
  checked. Impeccable's detector reported existing palette/type-ramp advisories
  and a font-parser warning; the existing design system was retained.

The Hub container build was attempted but Docker was not running. Image build
and container smoke verification remain outstanding. Nothing was deployed and
no paid model call was made. Actual-phone behaviour, venue networking, performer
usability and FlightGear readiness remain unverified.

The revised 1/2/4/All sequence was checked on 13 November 2026:

- Root `just verify` passed, including 609 Polymind, 33 Puck, 26 Hub and
  84 Match tests, types, lint and builds.
- The Polymind browser flow now closes collection without an analysis call,
  then analyses the frozen round through the separate control. Both Polymind
  browser scripts and all seven Puck browser tests passed.
- `just test-browser-hub` passed after correcting a new test assertion to count
  the separate Collective Voice session. It checks the shared 1/All invitation,
  cue changes without upstream mutations, private notes and mobile overflow.
- Revised desktop and mobile captures were inspected, including the phone
  recording cue. Evidence is retained in the local design evidence directory.

These are synthetic checks. Actual-phone recording, live transcription, venue
networking and FlightGear readiness still require a rehearsal. Container checks
remain unavailable because Docker is not running; nothing was deployed.

The operator-timed recording revision also passed root `just verify` (612
Polymind tests) and the complete `just test-browser` suite. Focused browser-script
tests advance recording past one minute, stop it explicitly, and verify that
closing either the round or session stops active capture. The fixed cutoff and
its participant label are removed; elapsed time remains visible.

## One-action launch refinement — 13 November 2026

Operate mode: the primary task is selecting a profile and launching its programme.
Keep the established typography, controls and colours. Show the profile selector
and **Launch show** first; disclose overrides, fresh rehearsals, saved-run recovery
and manual invitation editing only when needed. Launch combines create/resume,
app preparation and revision-checked programme installation. It keeps the waiting
invitation; returning to Live cues does not select the first activity.

Retain creation request identity until the whole launch succeeds. Retry partially
prepared runs without duplicating resources. A concurrent cue must reject programme
installation. Puck without audience answers and Flight without an invitation remain
explicitly unavailable; neither can be invented from a profile. Analysis and voice
have separate model settings and preserve their reasoning effort through Polymind.

Verification for this refinement: root `just verify`, focused Hub verification
(27 tests) and full `just test-browser` passed. The profile browser check exercises
one-click defaults, repeat production launch, later Puck answers, and an upstream
creation that commits but loses its response, followed by browser reload and retry.
All providers were fake; no paid model trial or deployment was run.

Rendered launch views at 1440 × 1000 and 390 × 844 were inspected and retained in
`test-results/design/show-profile-launch/`. The independent critique identified
app links above the primary task; moving them below preparation resolved it.
Existing keyboard tab navigation and visible focus remain covered by browser tests.
The changed controls use labels, native buttons/selects and live status messages.

The Vercel guideline source review used `command.md` with SHA-256
`d246b026f4f29b5823a9cc857f9edf3d2507002e055e32040cadeaf3b38e0234`.
No blocking issue was found in the changed controls. Impeccable's detector flagged
the unchanged Helvetica Neue stack as undeclared, despite its explicit declaration
in DESIGN.md; this was treated as a font-name parsing false positive.

The analysis budget is a 16,000-token ceiling including reasoning, not a validated
140-person allowance. The 500,000-character input limit averages about 3,570
characters per person at profile capacity. Model quality, actual usage and latency
at that scale still require a representative, separately authorised trial.
