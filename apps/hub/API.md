# Hub operator APIs

All `/api/operator/*` routes require Hub operator authentication. Every POST also
requires the configured Hub `Origin` and `application/json`. Keep app tokens and
the Flight participant invitation on the server or in the private operator
interface. Public `/api/current` never exposes run records or operator settings.

## Connect an activity

The invitation editor uses the tools' ordinary resource APIs. Configure
`HUB_POLYMIND_TOKEN` with Polymind's `OPERATOR_TOKEN` and `HUB_PUCK_TOKEN` with
Puck's `PUCK_OPERATOR_TOKEN`. Each token must be at least 32 characters. These
tokens stay server-side. Missing tokens disable API preparation for that app, but
do not disable manual participant invitations.

Set `HUB_POLYMIND_ORIGIN` and `HUB_PUCK_ORIGIN` for non-default installations.
The configured participant site must also be in `HUB_ALLOWED_ORIGINS`. App
credentials do not expand this allowlist. Hub sends requests only to those fixed
HTTPS app origins, does not follow redirects, and bounds response sizes and
timeouts.

| Route | Behaviour |
|---|---|
| `GET /api/operator/config` | Return allowed participant origins, app origins and whether each app connection is configured. No credentials are returned. |
| `GET /api/operator/apps/{app}/sessions` | List up to 200 Polymind sessions or Puck rooms. |
| `GET /api/operator/apps/{app}/sessions/{id}` | Read one resource's status. |
| `POST /api/operator/apps/{app}/sessions` | Create or recover a resource from `{requestId, settings}`, then read it back. |

The app APIs return identifiers and summaries. Hub validates the resource ID and
participant destination before it can be saved in the revision-checked
programme. For Polymind, use the canonical `participantUrl` returned by a
compatible Polymind API. Hub validates that it matches the returned session ID;
do not construct a destination from the session ID yourself. See [Polymind's
session API](../polymind/docs/session-api.md) and [Puck's operator
API](../puck/docs/operator-api.md).

## Show profiles and saved runs

The Show profiles controls use the named profile
`zkm-production-show-14-11-2026`. Its revised sequence is Arrivals room (waiting),
1 · Record individually, 2 · Analogue objects, 4 · Groups of four, All · Polymind
analysis, Collective Voice, Puck, and Flight. The closing invitation is removed.
The profile's `activityBindings` maps one bounded Polymind session to both the 1
and All invitations; those cues share the same session and round. Collective Voice
uses a separate session. Puck and Flight retain their own room/invitation.
Profile updates do not rewrite saved runs: each run stores its own activities,
bindings and private per-run operator notes. The operator API can return notes;
the public invitation API does not. Create a new rehearsal to use a revised
sequence.

The operator supplies the model choice and budgets, the Flight audience invitation
if available, and Puck answers proposed by the room. An empty Puck answer list is
valid until the room proposes two to six distinct options.

| Route | Behaviour |
|---|---|
| `GET /api/operator/profiles` | List the shipped profiles and their defaults. |
| `GET /api/operator/runs` | List saved private runs. |
| `GET /api/operator/runs/{id}` | Read one saved run, including its prepared resource bindings. |
| `POST /api/operator/runs` | Create or recover a production or rehearsal run from `{requestId, profileId, mode, settings}`. Retrying the same request and settings returns the same run. |
| `POST /api/operator/runs/{id}/settings` | Edit `{settings, expectedRevision}` while no app preparation request has started. A stale run revision or a frozen run returns 409. |
| `POST /api/operator/runs/{id}/prepare` | Prepare or check one app binding using `{activityId}`: `polymind`, `collective-voice` or `puck`. The profile maps the Polymind binding to both 1 and All invitations. |
| `POST /api/operator/runs/{id}/puck-options` | Save the room's `{options, expectedRevision}` before creating the Puck room. A stale run revision returns 409. Options freeze when room creation starts. |
| `POST /api/operator/runs/{id}/use` | Install the prepared programme using `{expectedRevision}`. This does not select a live cue. |

Run creation and preparation do not publish a live cue or start an activity.
Polymind preparation creates a session and writes a draft through
`PUT /api/operator/sessions/{id}/preparation`; it does not open writing, create a
round or call a model. This draft API requires coordinated, compatible Hub and
Polymind versions. A session already used with different preparation returns a
conflict and must be resumed through its own controls.

For the shared 1/All session, give the room a stop-recording cue at the end of 1.
Participants choose **Stop recording**, transcribe, review and correct the
transcript, apply it to their contribution and wait for **Saved**. Only then use
**Close collection without analysis** in Polymind. This freezes exact saved
contributions without a provider call. Closing collection stops an active phone
recording at its next state refresh and excludes unsaved transcripts; it does not
allow later review or saving. Keep that round frozen during 2 and 4. At All, use
**Analyse frozen writing** in the same Polymind session. If collection is still
open, the control says **Close writing and analyse** instead. Polymind analyses
the original saved 1 contributions and automatically publishes the completed
overview. Hub cue changes do not run the analysis or generate model output. Phone
recording requires Polymind's `TRANSCRIPTION_MODEL`, its provider credentials
(`OPENAI_API_KEY`), secure HTTPS and microphone permission. The operator decides
when to cue **Stop recording**; there is no fixed duration timer. Successful
transcription removes the raw audio, so analysis uses reviewed saved text. Uploads
are bounded to 8 MiB as a technical safeguard, not a duration cap; the server does
not validate decoded media duration. See [Polymind's
bounded show flow](../../docs/operations.md#bounded-show-flow) and [recording
operations](../../docs/operations.md#collective-microphone-and-historical-operations).

For `POST /api/operator/runs`, `settings` contains `writingQuestion` and
`voiceQuestion` (up to 2,000 characters each), `model`, `puckQuestion` (up to 240
characters), `puckOptions`, and optional `flightUrl`. `model` contains `provider`
(`openai` or `ollama`), the exact `model` ID, `maxInputCharacters` (1–1,000,000),
`maxOutputTokens` (100–16,000), and `timeoutMs` (1,000–360,000). `puckOptions`
is either empty or two to six distinct options of at most 48 characters each.
`flightUrl` must be the allowed Flight participant invitation. Copy it from
Flight; Hub checks the route and key shape, not that the opaque key has the
participant role.

Puck options require the run's current `revision`, read from `GET /api/operator/runs/{id}`;
a stale value returns 409 so one operator cannot overwrite another's options.
The settings edit route uses the same run revision check. Run settings remain
editable until the first app preparation request is about to leave Hub. Hub
checks the required app token and participant-origin allowlist before freezing
settings; once a request may have reached an app, retry that preparation with its
original settings or create a fresh rehearsal.
Puck is created only after its two to six distinct answers are saved. If the
operator's browser loses the response, retry the same run; Hub derives the app
idempotency key from the run ID and activity ID and reads the existing room back. It never starts the
round. Flight is not launched or controlled by Hub. The operator must provide the
Flight audience invitation and start the configured scenario locally, then leave
the simulator paused for the cue. Keep the bridge credential in Flight's private
configuration; never paste it into the participant URL.

For a run that is not installed, `use` is permitted only while the current Hub
invitation is waiting. Hub retains that exact waiting invitation and installs the
run's other invitations without changing the active cue. When the same run is
already installed, `use` only connects newly prepared, non-current invitations
that are still unavailable; it preserves the current invitation and existing
edits. These rules let the operator prepare Puck after the room has proposed
answers without interrupting the show.

Runs are stored privately in `runs.json` beside the live `state.json`. Back up and
restore both files together: the live programme can refer to a saved run, and the
run record contains resource bindings and the optional Flight participant URL.
The profile files in source are templates; preparing or editing a run does not
deploy a profile or change the installation's code.

Older Hub versions reject the added `runId` field in `state.json`. Back up both
files before upgrading; a code rollback alone does not restore the previous
programme format. Restore a consistent pre-upgrade backup if rolling back.

## Status checks

App status checks run after saved programme loads and saves, periodically while
the operator tab is visible, and when the operator selects **Refresh app checks**.
Failed checks retain a labelled last-known app result. A saved participant link
does not establish that its destination is reachable or ready. Hub cannot check
Flight simulator readiness; operators must check the simulator locally before
each cue. Status checks do not prevent a return to a waiting or in-person
invitation.
