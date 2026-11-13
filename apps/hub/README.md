# Rehearsing We hub

The independent participant entrance is deployed at **https://we.supercollective.io**. It shows one current invitation, polls saved revisions every two seconds and opens participant activities as full pages in the same tab. Returning to the hub refreshes the invitation. The hub never navigates another app remotely.

A ready digital activity shows its state, title and a “Join activity” link. Room instructions appear only when there is no activity to open (waiting, unavailable, in-person or closed states). The operator instruction field is hidden for ready digital activities; saved instructions remain available if the activity becomes unavailable. Connection information appears only on failure and clears after recovery. Default activity names apply to new programmes; existing saved names are not migrated.

The public entrance has no registration or participant data. Identity and saved matches remain in the destination apps. Keep using the same browser; a QR scanner's separate browser can lose access to an existing app session. Physical phone and return-session testing is still required.

## Run and verify

Tool versions and commands are managed at the repository root. The hub has no runtime or development dependencies; root browser checks reuse Polymind's installed Playwright tooling. Run these commands from the repository root:

```sh
cp apps/hub/.env.example apps/hub/.env
# Set a private random operator password in apps/hub/.env before starting.
# For local operator use, set HUB_PUBLIC_ORIGIN=http://127.0.0.1:3000.
mise exec -- just dev-hub
mise exec -- just hub verify
mise exec -- just test-browser-hub
```

Use `PORT=3002` and the matching `HUB_PUBLIC_ORIGIN` when running alongside other apps. Root `just verify` includes hub syntax checks and unit tests; `just test-browser` includes its browser smoke. Root pre-commit hooks also run hub verification for hub changes. No compilation or separate typechecking step is required for this plain JavaScript service.

`node --env-file=.env server.mjs`, run from `apps/hub`, is the direct development command. Production reads runtime environment variables. Bind localhost for local use; the Docker image binds `0.0.0.0:3000`.

The default entrance is **Waiting to begin**. The ZKM profile names its waiting cue **Arrivals room**. `/operator` is the private **Show controls** page, with **Preparation** and **Live cues** tabs. It uses HTTP Basic authentication; the browser supplies credentials to its same-origin API. The password is never stored in the manifest or public JavaScript. Updates require both operator authentication and the exact configured public Origin. HTTP is accepted for an explicitly configured localhost/127.0.0.1 Hub origin during development; participant destinations always require HTTPS.

Hub can prepare Polymind sessions and Puck rooms through their ordinary APIs.
Configure the optional app tokens once at installation, then use **Preparation**
to select an existing activity or create one. For Polymind, save the canonical
participant invitation returned by a compatible Polymind version; do not build a
URL from a session ID. See [operator API setup and show profiles](API.md).

**App controls** stays available in both views. Polymind and Collective Voice links
open their own session-scoped operator pages; Puck links open the saved room's
controls or its operator page before a room is prepared. Each activity also has a
separate app-controls link when its destination matches a configured app. These
links open a new tab, carry no credentials, and do not start an operation or grant
a role. Each app keeps its own sign-in; Puck instance operators can explicitly
acquire host controls without joining the activity. Hub has no assumed Flight
operator route. See the [operator workflow review](../../docs/design/hub-operator.md)
and [show profile operation brief](../../docs/design/show-profile-operation.md).

## Prepare a named show

The shipped profile is **ZKM · 14 November 2026** (`zkm-production-show-14-11-2026`).
Its revised sequence is: **Arrivals room** (waiting) → **1 · Record individually**
(on a phone) → **2 · Analogue objects** (in pairs) → **4 · Groups of four** →
**All · Polymind analysis** (of the original 1 contributions) → Collective Voice
→ Puck → Flight. The closing invitation is removed. Installing a new run preserves the current waiting invitation exactly. Its writing question is “What is something
you’d like to change, but can’t change on your own?” Its Collective Voice question
is “What would you like us to become capable of together that feels impossible
alone?” Its Puck question is “What shall we do with this plane?”

In **Preparation**, select a profile and click **Launch show**. Hub creates or resumes
its production run, prepares its configured activities and loads the programme into
**Live cues**. The exact current waiting invitation remains active until you choose
the first cue. Return to waiting before launching another show.

**Profile settings and overrides** contains optional changes and **Launch fresh
rehearsal**. **Saved runs and recovery** lets you resume a particular run and
**Launch saved show**; retrying preserves its sessions and current cue. Interrupted
launches retain their request so a retry does not create another run.

The ZKM profile uses OpenAI `gpt-6.1-sol` with medium reasoning for analysis
(16,000 output tokens, 360 seconds) and `gpt-6.1-terra` without reasoning for
Collective Voice (4,096 output tokens, 120 seconds). Both allow 500,000 input
characters. Voice follows the [composer comparison](../polymind/docs/composer-comparison-2026-11-04.md);
the analysis setting is an operator choice, not a measured quality result. Older
runs without a separate voice model retain their shared model.

Launching does not start rounds or make model calls. Hub creates separate Polymind and Collective Voice sessions
for the same run and saves their preparation as drafts. The **1** and **All**
invitations share one bounded Polymind session and round. Give the room a clear
stop-recording cue at the end of **1**. Each participant chooses **Stop recording**,
then transcribes, reviews and corrects the transcript, applies it, and waits for
**Saved**. Only after every participant shows **Saved**, use Polymind's
**Close collection without analysis** control. This freezes saved contributions
without a provider call. Closing collection stops an active phone recording at
its next state refresh and excludes any unsaved transcript; it does not leave time
to review or save after closure. The round stays frozen through **2** and **4**.
Late transcripts cannot be added after collection closes. At **All**, use
**Analyse frozen writing** in the same Polymind session (or **Close writing and
analyse** if collection is still open). Polymind analyses the original 1
contributions and publishes the completed overview automatically. Hub cue changes
do not start analysis or generate model output. A production run is limited to one per
profile; a new rehearsal gets new run and app-resource IDs. Resume a saved run to
reuse its IDs. If creation loses its response, retry the same request with the same
settings to recover the existing run or resource.

For phone recording, Polymind needs `TRANSCRIPTION_MODEL` and its provider
credentials (`OPENAI_API_KEY`) configured. Participants need a secure HTTPS page
and must grant microphone permission. The operator decides when to cue **Stop
recording**; there is no fixed duration timer. Participants then transcribe,
review and correct the transcript, apply it to their contribution, and wait for
**Saved** before collection closes. After successful transcription, Polymind
removes the raw audio; analysis uses the reviewed saved text, not an audio
archive. Uploads are bounded to 8 MiB as a technical safeguard; this is not a
duration limit, and the server does not validate decoded media duration. See [Polymind's bounded show flow](../../docs/operations.md#bounded-show-flow)
and [recording operations](../../docs/operations.md#collective-microphone-and-historical-operations).

Private operator notes are stored per run and shown only in the operator view for
the current cue; they are not part of participant invitations or public state.
Editing a named profile does not rewrite runs already
saved in `runs.json`; create a new rehearsal to use the revised sequence.

Edit a saved run's questions, model settings, Puck question/options or Flight
invitation before app preparation starts. Hub uses the run revision to reject a
stale edit. It checks the required app token and allowed participant website
before the first preparation request; after a request may have reached an app,
settings stay frozen so a retry uses the original values. Resume the run to retry,
or create a fresh rehearsal to change settings.

The room proposes Puck's answer options. It is valid to create the run before the
options exist. When the room has proposed two to six distinct answers, enter them
and select **Prepare Puck with these options**. That action creates or recovers the
room and connects its invitation. It does not start the Puck round.

Before Flight, load the configured `karlsruhe-747-landing` approach, connect the
bridge and leave FlightGear paused. Recheck readiness locally before the cue.
Participants join through the invitation; release phone controls before unpausing
FlightGear locally. Hub does not launch Flight or check simulator readiness. Keep
the bridge credential in Flight's private configuration, not in the participant
invitation.

Select **Launch show** when the current Hub invitation is waiting.
Hub keeps that exact waiting invitation active. If this same run is already
installed, the action can connect newly prepared, non-current invitations that
are still unavailable; it preserves the current cue and existing edits. Then use
**Live cues** and **Show invitation: …** to change what participants see. Cues do
not start, stop or remotely navigate an app. A saved participant link is not proof
that the destination is reachable or ready; check it separately before a cue.
Launch and preparation changes are saved run data, not a deployment or a change to the
profile source.

## Runtime configuration

| Variable | Value |
|---|---|
| `HUB_PUBLIC_ORIGIN` | Optional override; the image derives it from `COOLIFY_URL` |
| `HUB_ALLOWED_ORIGINS` | Comma-separated verified HTTPS participant origins; defaults to `https://polymind.supercollective.io`; add `https://fly.supercollective.io` when Flight is used |
| `HUB_POLYMIND_ORIGIN`, `HUB_PUCK_ORIGIN` | Optional HTTPS app-control destinations; default to the documented `polymind.supercollective.io` and `puck.supercollective.io` sites. These do not extend the participant allowlist. |
| `HUB_POLYMIND_TOKEN`, `HUB_PUCK_TOKEN` | Optional server-side app operator tokens for preparation and status; see [API setup](API.md) |
| `HUB_OPERATOR_USER` | Private operator username; default `organiser` |
| `HUB_OPERATOR_PASSWORD` | Runtime secret, at least 24 characters; no example/default is accepted |
| `HUB_DATA_DIR` | Durable directory; `/data` in the image |
| `HOST`, `PORT` | `0.0.0.0`, `3000` in the image |

`/healthz` checks application readiness and writable storage. Public `/api/current` exposes only revision, timestamp and the current invitation. `/api/operator/config` supplies the allowed website choices and app-control origins privately. `/api/operator/state` reads/updates the full programme privately. A PUT accepts `{expectedRevision, activeId, activities}`; stale edits return 409. Activity fields are `id`, `label`, `kind`, `status`, `instruction`, and a participant `url` only for a ready digital activity. The allowed kinds are `activity`, `analogue`, `waiting`, `closed`; status is `ready` or `unavailable`.

URLs require HTTPS and an explicitly allowed origin. Credentials, fragments, known control/projection paths and credential-bearing query fields are rejected. Flight's public invitation is accepted only as `https://fly.supercollective.io/?key=...`, with that origin explicitly allowlisted and one URL-safe opaque key of 24–128 characters. This checks the public route and key shape only: the Hub cannot verify that the value is Flight's participant key rather than another Flight secret. Operators must copy Flight's audience invitation; Flight's bridge key belongs in its Bearer header and must never be put in a URL. Operators must still open and check the actual participant page before saving it. Do not add private control URLs to any activity field.

## Coolify Dockerfile Application

Deploy an independent Git-backed **Application** from `supercollective-io/tools`, Dockerfile strategy, with Base Directory `/` and Dockerfile Location `/apps/hub/Dockerfile`. The Dockerfile-specific ignore file limits the build context to the hub runtime files. Expose internal port `3000`; set the domain to `https://we.supercollective.io:3000`. Leave host-port publication to Coolify's proxy. Configure the runtime variables above, mark the operator password as a runtime-only secret, and mount persistent storage at `/data`, writable by UID/GID 1000. Keep exactly one application replica: the atomic JSON store assumes a single writer.

The image runs as `node` and has a runtime-native HTTP health check. No database, build secrets, source checkout, npm installation or third-party service is needed at runtime. The Dockerfile pins Node `26.13.0-bookworm-slim`; record the tested image digest for the release and review updates deliberately.

```sh
docker build --check -f apps/hub/Dockerfile .
mise exec -- just build-hub-container
mise exec -- just test-hub-container
```

Public HTTPS, the waiting entrance, readiness endpoint, printable entrance card and anonymous operator API rejection were checked on 12 November 2026; see the [deployment review](../../docs/verification/public-deployments-2026-11-12.md). Scanning the printed QR and completing the full transition sequence on actual phones remain outstanding.

## Operate, back up and restore

1. Open `/operator` privately. Use **Preparation** to select a profile and **Launch show**. This prepares its sessions and loads its programme while retaining the waiting invitation. Hub saves the canonical Polymind participant invitation returned by a compatible Polymind version. **Advanced: participant link** remains available for other apps or installations without API credentials; use the actual participant invitation, never an operator or projection link.
2. If Puck's answers were not entered when the run was created, collect two to six distinct options from the room. Enter them and choose **Prepare Puck with these options** to create or recover the room. This does not start the round. Check Flight locally and leave it paused before its cue.
3. After launch, use **Live cues** when you are ready to show the first invitation. Adding Puck answers connects its invitation automatically. To recover an interrupted launch, launch the same profile or saved run again; existing sessions and the current cue are preserved.
4. Use **Live cues** to see the current entrance and select **Show invitation: …** for a saved invitation. This changes the entrance immediately; saving preparation alone does not select it. Give the room its spoken cue. Returning phones see the latest revision; phones inside other apps must use their return link or manually return to the short address. Start rounds, analyse and release results in the destination app itself.
5. If a tool fails, choose **Return to waiting** or another in-person invitation. Closing cues and edits to the current invitation require confirmation. If connection or concurrent edits make the state uncertain, **Refresh saved state** before another change; unsaved preparation fields are retained for review. Unavailable digital activities have no public link.
6. Print `/print` before the show. Its QR encodes exactly `https://we.supercollective.io`; the printed address works without a camera. Regenerate the QR if the permanent domain changes.
7. The live programme is `/data/state.json`; prepared runs are `/data/runs.json`. Back up and restore both files together. The private run file contains resource IDs, app bindings and the optional Flight participant invitation. Keep it private. Invalid stored state stops startup rather than silently replacing it. Rolling back code does not automatically roll back these files.
8. Restore both files to an isolated writable directory and start a separate instance with private test credentials. Verify the selected invitation and run ID before using it in production. Invalid stored state stops startup rather than silently replacing it.

Tests cover operator access, origin and Host rejection, URL boundaries, single current invitation, concurrent edits, analogue/closed transitions, late arrivals, corrupted state and restoration across a restart. The headless-browser smoke checks narrow mobile viewports, separate preparation and live cue changes, retained drafts and failed-save recovery, full-page navigation, same-origin storage continuity in a synthetic destination, returning to the room and the printable QR. It uses explicitly supplied test tooling without adding a runtime dependency. Tests do not establish venue-network conditions, QR-camera behaviour, participant comprehension or real destination-app identity restoration. The named profile has not been tested on actual phones or with live Polymind, Puck or FlightGear.

Source was imported from the standalone hub at revision `8588c59ab3bcdc43fa737f949a0e62bafb166ce8`. The original checkout and history are retained. Maintain hub software here; performance scores and artistic material remain in `rehearsing-we`. Moving source does not migrate runtime state or change the live deployment.

### Hub health checks and replacement

Use the image's Node-native health check. Leave the Coolify dashboard Healthcheck
disabled: current Coolify versions override the image check when that setting is
enabled, and dashboard HTTP checks require curl or wget, which this image does
not install. Verify the effective container health-check command on the target
instance before release. See [Coolify health checks](https://coolify.io/docs/applications/configuration/health-checks).

Stop the previous hub writer before starting its replacement. One replica alone
does not prevent overlapping containers during a rolling deployment; do not use
rolling replacement with this single-writer JSON store. Preserve the dedicated
volume and take a backup before deployment. Preview deployments must use separate
storage and credentials. Verify the target server architecture against the pinned
image before deploying; local container checks do not verify the target host.

### Production environment import

Select the root [`.env.dist`](../../.env.dist) in Smart Scan, review and confirm
Import. Enable Coolify default variables.
The image derives `HUB_PUBLIC_ORIGIN` from `COOLIFY_URL` at startup. A domain plus
its `www` alias selects the non-`www` origin; unrelated domains require an explicit
`HUB_PUBLIC_ORIGIN`. Remove old `$COOLIFY_URL` mappings to enable this fallback.
Mark every entry runtime-only and supply a private operator password of at least
24 characters. Keep existing credentials on redeployment. Add other verified
participant origins to `HUB_ALLOWED_ORIGINS` explicitly; this is a security
allowlist, not a value inferred from the hub domain. The local `.env.example`
uses development storage and binding settings and must not be imported into production.
