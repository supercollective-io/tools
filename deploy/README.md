# Coolify deployment

Target instance: `https://deploy.radicaldata.org`. Use four independent GitHub App-backed **Applications**, with Dockerfile builds. This follows [Coolify's Git Dockerfile workflow](https://coolify.io/docs/applications/builds/dockerfile). Polymind and Puck were reported deployed by the operator on 11 November 2026. This records that report, not independent verification of the live configuration, phone behaviour or release gates.

| Application | Repository/context | Dockerfile | Public domain | Container port | Durable path |
|---|---|---|---|---|---|
| Polymind | `supercollective-io/tools`, `/` | `/apps/polymind/Dockerfile` | `https://polymind.supercollective.io` | 3000 | `/data` |
| Puck | `supercollective-io/tools`, `/` | `/apps/puck/Dockerfile` | `https://puck.supercollective.io` | 3000 | `/data` |
| Flight | Flight repository, `/` | `/Dockerfile` | `https://flight.supercollective.io` | See Flight relay guide | See Flight relay guide |
| Hub | `supercollective-io/tools`, `/` | `/apps/hub/Dockerfile` | `https://we.supercollective.io` | 3000 | `/data` |

## Import application settings

All three Tools applications build from Base Directory `/`. Select Dockerfile, not Docker
Compose. Polymind's Dockerfile now lives alongside its source, like Puck's.
For an existing Polymind application, change Dockerfile Location from
`/deploy/Dockerfile` to `/apps/polymind/Dockerfile` before deploying this revision.
Keep its existing operator token and persistent storage unchanged.

During creation, Smart Scan > Review > Env file offers these root templates:

| Application | Import template | Required manual value |
|---|---|---|
| Polymind | [`.env.template`](../.env.template) | `OPERATOR_TOKEN`: private random value, at least 32 characters |
| Puck | [`.env.sample`](../.env.sample) | None |
| Hub | [`.env.dist`](../.env.dist) | `HUB_OPERATOR_PASSWORD`: private random password, at least 24 characters |

Select the matching file and confirm Import before Continue. The root
[`.env.example`](../.env.example) is for local development; its loopback host and
local data path are unsuitable for deployment. Do not import Polymind's settings
into Puck. Templates populate values, but do not create domains or storage.

Enable **Include Coolify default variables** and configure the public HTTPS domain.
The three Tools Docker images resolve their origin at startup from `COOLIFY_URL`;
no manual `PUBLIC_ORIGIN` mapping or template import is needed for domain discovery.
A single domain is used directly. For a domain plus its `www` alias, the non-`www`
origin wins regardless of order. Redirect the alias to that canonical domain in
Coolify. Unrelated domains or different schemes/ports are ambiguous and stop
startup with an instruction to set an explicit canonical origin.

An explicit `PUBLIC_ORIGIN` (Puck/Polymind) or `HUB_PUBLIC_ORIGIN` (Hub) takes
precedence. Remove old `$COOLIFY_URL` mappings to use automatic selection: those
mappings can expand to a comma-separated list, which is not one origin. Blank or
invalid overrides fail rather than silently falling back. Missing Coolify domains
also stop the container. Request headers never choose the trusted origin.
Templates remain optional conveniences for other settings and required secrets;
they are not automatically loaded on redeployment. Set imported settings to
**Not available during build** and **Available in the container**.

For an existing application, update individual variables in Normal view rather
than replacing the whole variable set. Preserve the existing operator token and
provider settings. Restart after runtime-only changes; deploy for image changes.
Verify the participant URL and operator sign-in after applying changes.

Dockerfile imports do not generate a token or enforce required fields in Coolify.
Puck and Polymind refuse startup when `NODE_ENV=production` and `PUBLIC_ORIGIN`
is missing or blank, before opening their data stores. Both images set production
mode. Their local development commands retain the loopback default. The container
entrypoint supplies this setting from the configured Coolify domains when there
is no explicit override.
Polymind itself refuses startup without a valid token. Generate one privately with
`openssl rand -hex 32`, store it in a password manager, and enter it once. Never
put a real secret in a template. Compose's `SERVICE_PASSWORD_*` generators are
not part of this Dockerfile workflow. Provider keys and transcription remain
explicit opt-ins and are omitted from the production templates.

See Coolify's [Smart Scan](https://coolify.io/docs/applications/builds/smart-scan)
and [application variables](https://coolify.io/docs/applications/configuration/environment-variables).

Puck remains a separate Coolify Application. Use the repository root as build context, never `apps/puck`, because its image uses the root lockfile. Its own volume at `/data` must be writable by UID/GID 1000; do not share Polymind's volume. See [Puck runtime settings](../apps/puck/docs/operations.md#coolify-packaging). Run `just build-puck-container` and `just test-puck-container` for a disposable local image check. Changing the source repository does not migrate data or authorise a live deployment.

Create a `Rehearsing We` project/environment and select the actual destination server. Connect the existing GitHub App, granting only the selected repositories. Repository/branch selection must identify the reviewed commits; local unpushed branches cannot deploy. GitHub permissions and DNS/TLS must be verified in that account, not inferred from these files.

For Polymind, expose port 3000 to Coolify's proxy, configure `https://polymind.supercollective.io` as the domain and enable Coolify default variables, set `HUB_URL=https://we.supercollective.io` and a privately generated `OPERATOR_TOKEN` (at least 32 characters). Keep secrets runtime-only. Set `OPENAI_API_KEY`, `JEV_API_KEY` and `TRANSCRIPTION_MODEL` only for explicitly selected providers. `HOST=0.0.0.0`, `PORT=3000`, `DATA_DIR=/data/polymind` and the packaged Python executable are supplied by the image. Mount one persistent volume at `/data`, writable by UID/GID 10001. The nested data directory keeps its sibling writer lock inside that writable volume.

Use one replica and stop the previous writer before its replacement starts. The database-directory lock intentionally rejects overlapping writers. The image provides `/healthz` and its own runtime-native health check. Do not publish host ports, add custom proxy labels or expose the operator token in URLs. Serve public HTTPS; HTTP is accepted only on loopback for development.

Build `docker build -f apps/polymind/Dockerfile -t polymind:candidate .`, then exercise the immutable image with disposable data. Promote that exact tested revision/image. Check public join/save/return, private result release, restart, projection and an isolated backup restore. Verify outside the developer LAN on both mobile data and Wi-Fi. Neither a successful build nor healthy loopback proves public routing or device compatibility.

The image runs erasable TypeScript using pinned Node 26 native type stripping; CI separately typechecks and compiles it. Only production JavaScript dependencies enter the image. Dependency lifecycle scripts are disabled, retaining the imported policy that permits no required build scripts.

The full matching runtime is built from `packages/match` in the same checkout and installed non-editably using its own lockfile, with development dependencies excluded; there is no sibling checkout or dependency installation at runtime. Run `mise exec -- just build-container` and `mise exec -- just test-matching-container` to verify the packaged worker without provider calls. Code rollback after a schema change may require restoration of the complete corresponding data backup. Preserve failed jobs and inputs; retries are explicit and cached successful matching work is reused.

For an already configured synthetic staging application, `just deploy-staging` uses `COOLIFY_URL`, `COOLIFY_TOKEN` and `COOLIFY_STAGING_APP_UUID`. It follows the documented [deployment request](https://coolify.io/docs/api/endpoints/deployments/deploy-by-tag-or-uuid) and [deployment status](https://coolify.io/docs/api/endpoints/deployments/get-deployment-by-uuid) endpoints, then `just smoke-staging https://your-staging-domain` checks public routing and the unauthenticated operator boundary. This workflow has not been exercised against the target instance.

## Hub packaging

The hub remains an independent Coolify Application. Select the Tools repository,
Base Directory `/`, Dockerfile Location `/apps/hub/Dockerfile` and internal port
`3000`. Keep its canonical origin `https://we.supercollective.io`, existing
operator credentials and dedicated `/data` volume (UID/GID 1000). Use one replica.
Do not share another application's volume or authentication. Runtime variables
and destination allowlisting are described in the [hub guide](../apps/hub/README.md).

Run `just build-hub-container` and `just test-hub-container` through `mise exec --`
for isolated image checks. The container smoke uses a disposable volume and checks
health, non-root execution and persisted state across restart. CI runs these checks
and the hub browser smoke. This source import does not reconfigure a live Coolify
application, deploy an image or migrate state; apply the reviewed source settings
when deployment is authorised, preserving the existing storage and secrets.

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
