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

The default phase is a welcome/waiting invitation. Polymind, Puck and Flight begin unavailable: save checked participant links in Prepare activities before showing them. `/operator` uses HTTP Basic authentication; the browser supplies credentials to its same-origin API. The password is never stored in the manifest or public JavaScript. Updates require both operator authentication and the exact configured public Origin. HTTP is accepted for an explicitly configured localhost/127.0.0.1 hub origin during development; participant destinations always require HTTPS.

Hub can prepare Polymind sessions and Puck rooms directly through their ordinary APIs.
Configure the optional app tokens once at installation, then choose an existing
activity or create one in **Prepare activities**. See [API setup and recovery](API.md).
No app UI contains Hub-specific integration controls.

**App controls** stays available in both operator views. Polymind opens its operator page,
scoped to the saved session when present. Puck opens its operator page scoped to the saved room, or its room list before a room is prepared. Each saved activity also offers its own controls link
when its website matches a configured app. Links open a new tab and carry no credentials;
Each app retains its own sign-in; Puck instance operators can explicitly acquire host controls without joining the activity. These links
do not grant a role or start an operation. Flight and custom sites have no assumed
operator route. See the [operator workflow review](../../docs/design/hub-operator.md).

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

1. Open `/operator` privately. Use **Prepare activities** to select an app, then create or connect an existing activity. The participant destination is saved automatically through the normal revision check. Open its controls for detailed configuration and check the saved participant entrance. **Advanced: participant link** remains available for other apps or installations without API credentials. A blank destination keeps a digital activity unavailable.
2. Use **Run the show** to see the current entrance and choose **Show** beside a prepared invitation. This changes the entrance immediately; saving preparation alone does not select it. Give the room its spoken cue. Returning phones see the latest revision; phones inside other apps must use their return link or manually return to the short address. Start rounds, analyse and release results in the destination app itself.
3. If a tool fails, choose **Return to waiting** or another in-person invitation. Closing cues and edits to the current invitation require confirmation. If connection or concurrent edits make the state uncertain, **Refresh saved state** before another change; unsaved preparation fields are retained for review. Unavailable digital activities have no public link.
4. Print `/print` before the show. Its QR encodes exactly `https://we.supercollective.io`; the printed address works without a camera. Regenerate the QR if the permanent domain changes.
5. State is `/data/state.json`, written through a synced temporary file and atomic rename. To back up, copy the current complete file and record the running image/revision. No participant writing or credentials are in this file. Keep the original state if restoring an older programme.
6. Restore to an isolated writable directory and start a separate instance with private test credentials. Verify the selected phase and revision before using it in production. Invalid stored state stops startup rather than silently replacing the programme. Rolling back code does not automatically roll back this file.

Tests cover operator access, origin and Host rejection, URL boundaries, single current invitation, concurrent edits, analogue/closed transitions, late arrivals, corrupted state and restoration across a restart. The headless-browser smoke checks narrow mobile viewports, separate preparation and live cue changes, retained drafts and failed-save recovery, full-page navigation, same-origin storage continuity in a synthetic destination, returning to the room and the printable QR. It uses explicitly supplied test tooling without adding a runtime dependency. Tests do not establish venue-network conditions, QR-camera behaviour, participant comprehension or real destination-app identity restoration.

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
