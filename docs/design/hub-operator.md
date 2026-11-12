# Hub operator: preparation and live cues

## Audience and job

The operator is also performing and organising the room. Laptop is the confirmed
primary device; mobile remains supported. The job during the show is to recognise
what the entrance currently offers, choose the next invitation deliberately, and
recover quickly when a tool or connection fails. Typing deployment addresses is
preparation work, not a live cue.

This redesign centres on Hub, with a small Polymind session-link correction. Existing app documentation is the source of the
workflow below. The exact artistic running order and Flight's controls are not
specified in this repository and are not invented here.

## Workflow review

| Moment | Operator needs | Responsibility and interface |
| --- | --- | --- |
| Before arrival | Sign in; prepare permanent entrance and QR | Existing private Hub authentication and print page; links remain available without leaving the control tab |
| Prepare writing | Create/select a Polymind session, question, models and budgets; check participant page and projection | Polymind operator; save its participant link in Hub preparation |
| Prepare a decision | Create Puck room and question/options; retain host browser identity | Puck; save its participant invitation in Hub |
| Prepare other digital work | Obtain and check a participant destination | Named website must already be allowed by deployment configuration; no guessed Flight URL |
| Welcome / between activities | Show a waiting instruction | Direct saved waiting cue; quick return to waiting |
| Invite participation | Change the entrance and give a spoken cue | One explicit Show action; people inside another app are not remotely navigated |
| Writing → analysis | Close writing, authorise analysis, review outputs | Polymind; changing Hub invitation does not perform these actions |
| Matching / personal results | Choose criterion, start matching, review and explicitly release encounters | Polymind; no publication or model calls in Hub |
| Puck round | Start/cancel and supervise the shared decision | Puck host browser; Hub only changes the invitation |
| In-person work | Put phones away, retain a route back | Prepared analogue invitation with room instruction |
| Tool failure | Stop offering the failing activity | Return to waiting or another prepared in-person cue; this does not stop the failing app |
| Connection / conflicting edit | Know whether a cue saved; reconcile before another write | Mark preview as last known, disable changes until refresh, preserve unsaved setup text |
| Closing | Replace entrance with closing instruction | Explicit confirmation before showing a closing cue; no app data deletion |
| After show | Retention, backups and shutdown | Existing operational procedures; not mixed into live controls |

## Problems in the previous page

- One large form mixed editing, availability, invitation selection and publication.
  Choosing a radio did nothing until a distant Save programme button was pressed.
- Six configuration forms competed for attention, even during a simple cue change.
- Internal kinds and readiness flags were exposed as implementation vocabulary.
- Every digital destination required a complete HTTPS URL, without showing which
  websites the server would actually accept.
- The saved/current invitation had no distinct audience preview. Errors and
  revision numbers supplied little useful recovery guidance.
- There was no clear account of which operations still belonged in Polymind/Puck.

## Concepts and direction

Three compositions were compared against the same task, “show Polymind, then return
to waiting”: a compact all-in-one editor; a sequential next-cue wizard; and separate
preparation plus a direct live cue list. The editor still couples configuration and
performance. A wizard assumes a fixed running order and makes deviations harder.
The selected list supports jumping to any prepared invitation and keeps the current
entrance alongside the available choices on a laptop.

These are source-level concept comparisons, **not rendered studies**. The sandbox
refused local HTTP listening and Chromium launch, so comparative rendering and
visual approval remain outstanding. No screenshot or human usability claim is made.

Retain the established Helvetica stack, square controls, paper/ink palette, lime
current-state accent and blue keyboard focus. Use restrained 1–1.8 rem section/type
hierarchy, flat divided cue rows and a two-column desktop composition. Collapse to
one column at 760 px. No imagery, external fonts, decorative animation or new
runtime dependency. Preparation uses a single labelled editor, not six open forms.

## Interaction and backend decisions

- Show publishes only saved configuration. Unsaved edits are identified in the live
  list; showing that same invitation warns that its saved version will be used.
- Saving a non-current invitation never changes the active invitation. Saving a
  current one warns and confirms its immediate public effect.
- No destination means a digital activity needs preparation. A saved link means it
  can be selected, not that the service is healthy or the page has been checked.
  The saved page opens separately for the operator's manual check.
- App controls remain visible across both views. Each prepared Polymind/Puck
  invitation has a matching controls link; the top shortcuts prioritise the current
  invitation, then the first prepared invitation and label that choice. Polymind
  opens its selected session, including after sign-in. Missing sessions fail visibly
  rather than selecting another session. Puck opens the saved room with the existing
  host browser cookie, or the creation page when no room is prepared. Neither link
  grants a role or shares credentials. Origins can be overridden in deployment;
  this does not widen the participant allowlist. No Flight operator route is guessed.
- A private configuration endpoint supplies allowed website choices. Existing URLs
  become website + path in the editor; pasted full links use their own website and
  disable the unrelated selector. Missing HTTPS is supplied in the browser. All
  existing server validation, origin allowlisting and credential/path rejection
  remain authoritative.
- Refresh retains dirty fields and fetches the new revision. The operator explicitly
  reviews and saves the retained draft; there is no automatic conflict overwrite.
- Network uncertainty blocks mutation and labels the preview as last known. A
  timed-out write might have committed, so refresh is required before retrying.
- All saved state remains schema version 1. No migration, provider request,
  deployment, cross-app authentication or private bookmark storage is introduced.

## Review and verification

Independent read-only source critique identified five issues: draft loss on
refresh, ambiguous website selection for full links, silent use of an older saved
invitation, stale live-impact guidance, and focus loss after a cue. All were
addressed in the implementation. The follow-up source review confirmed all five source corrections and caught
Polymind ignoring a linked session. That was corrected in Polymind, with five
browser-script tests covering non-first selection, sign-in, missing/empty session
links and the unscoped default. A final read-only source check found no significant issue in the session-routing fix. The actual-browser script also covers selecting a
second session and refusing a missing one; execution remains blocked.

Browser smoke coverage now exercises preparation without publication, path and
scheme-free destinations, cue switching, narrow-screen overflow, saved-link checks,
retained drafts, rejected control URLs, connection failure and recovery, and the
existing participant navigation/identity/print flows. Tests use disposable synthetic
state and fake destinations. The script saves desktop preparation/live and mobile
screenshots when run in a permitted environment.

Evidence and recoverable pre-change source are under
`test-results/design/hub-operator/` (ignored). Browser rendering, keyboard execution,
zoom/reflow, demanding text states and actual screen-reader/phone/venue checks are
unverified. Reduced-motion behaviour is inapplicable: no animation is added.

Source accessibility review used the Vercel web-interface-guidelines `command.md`
retrieved on 12 November 2026. Native labelled controls, focus styles, live feedback,
inline errors, draft navigation protection and wrapping were checked. The existing
project's sentence case and typography take precedence over generic style advice.

### Check results

- Hub syntax checks passed.
- Five focused Hub tests passed: participant URL boundaries, corrupted-state handling,
  public manifest field boundaries, private website configuration exposure, and independently configured app-control origins.
- Root verification passed lint/format and type checks, then failed in Polymind
  HTTP/subprocess tests under the sandbox: 523 passed, 69 failed, including socket
  EPERM failures and subprocess timeouts/early exits. Later package tests and build
  gates were not reached. Full success is not established. The initial cache-access
  failure was resolved with a writable `UV_CACHE_DIR` under test-results.
- Five focused Polymind operator browser-script tests passed (Node VM, not Chromium).
- Mechanical design audit found a selected-mode hover contrast issue, corrected
  with an explicit dark hover rule. Font parsing/type-ramp advisories concern the
  established stack and deliberate compact operator scale; they are not rendered
  evidence. No system-wide typography change was made.
- Direct Hub browser smoke blocked before opening a page: `listen EPERM` on localhost.
- Root browser recipe built Polymind and Puck, then stopped at Match packaging:
  restricted DNS prevented fetching `uv-build==0.13.4` from PyPI. Browser scripts
  were not reached through that recipe. No dependency or lockfile was changed.
- Direct Chromium rendering also blocked: macOS Mach port permission failure.
- Human usefulness and venue readiness are unmeasured.

## Follow-up: API preparation

The subsequent operator review identified manual session-link copying as the main
remaining burden. The approved direction keeps all show-specific coordination in
Hub and uses generic tool resource APIs. No “use in Hub” action exists in either
tool. Hub preparation now offers existing-session selection and creation, retains
recoverable request settings across reloads, and saves the destination through the
existing invitation revision check. Manual links remain an advanced fallback.

Polymind’s normal operator interface and Hub share session creation, metadata and
status. Puck’s normal operator page and Hub share room creation/listing/detail;
Puck's role-grant action makes API-created rooms controllable without sharing host
credentials or modifying participant membership. API setup is documented in
[Hub API](../../apps/hub/API.md). Tool storage adds request/grant tables; Hub's saved
programme remains schema 1.

Independent source critique caught status disagreement after Puck restart, pending
request recovery for unsaved invitations, stale pending settings after success,
operator-grant logout semantics, and a skipped initial status check. Corrections
use a canonical room status, per-app browser pending requests with settings
restoration/retirement, tracked revocable operator grants, and checks after saves
release their busy state. A follow-up found app-choice restoration missing; that
now uses the same helper as reopening an editor. Browser/rendered review remains
blocked by the execution environment.

API preparation checks: all 33 Puck unit tests, 12 focused Polymind
session/browser-script tests and seven non-network Hub tests passed. Type checks
passed for both TypeScript apps and Match. Polymind and Puck builds succeeded.
The full root gate reaches HTTP/subprocess tests but cannot pass in this sandbox;
Hub and Polymind cannot listen on loopback and Puck's browser server cannot create
its local IPC socket. The new HTTP/browser tests are retained for execution in a
permitted environment. No live installation was configured, no provider operation
was run, and no deployment occurred.

## Validation after integration with main — 12 November 2026

The preparation changes were reapplied onto main at `72b5c56`, retaining the
analysis-reliability changes and Flight audience URL validation. The Flight browser
scenario now uses the preparation and live-cue controls.

With local socket and browser permissions available, `mise exec -- just verify`
passed: 602 Polymind tests, 33 Puck tests, nine Hub tests, 84 Match tests and eight
root tests, alongside lint/format, types and builds. A preceding run concurrent
with browser checks hit two existing Polymind CLI tests' 5-second timeouts; the
complete gate passed when rerun on its own, without changing tests or timeouts.

`mise exec -- just test-browser` passed both Polymind flows, all seven Puck browser
tests and the Hub smoke, including Flight invitations, API preparation, draft
recovery and narrow-screen overflow checks. Hub desktop preparation and mobile
live-view screenshots were inspected: controls and text remained legible without
overlap or clipping in those captured states. Screenshots remain outside commits.

These results supersede the earlier environment-blocked execution reports above.
They do not establish screen-reader coverage, actual-phone behaviour, performer
usability or venue readiness. No deployment or paid provider operation occurred.
