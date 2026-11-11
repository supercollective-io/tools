# Coolify deployment

Target instance: `https://deploy.radicaldata.org`. Use four independent GitHub App-backed **Applications**, with Dockerfile builds. This follows [Coolify's Git Dockerfile workflow](https://coolify.io/docs/applications/builds/dockerfile). Polymind and Puck were reported deployed by the operator on 11 November 2026. This records that report, not independent verification of the live configuration, phone behaviour or release gates.

| Application | Repository/context | Dockerfile | Public domain | Container port | Durable path |
|---|---|---|---|---|---|
| Polymind | `supercollective-io/tools`, `/` | `/apps/polymind/Dockerfile` | `https://polymind.supercollective.io` | 3000 | `/data` |
| Puck | `supercollective-io/tools`, `/` | `/apps/puck/Dockerfile` | `https://puck.supercollective.io` | 3000 | `/data` |
| Flight | Flight repository, `/` | `/Dockerfile` | `https://flight.supercollective.io` | See Flight relay guide | See Flight relay guide |
| Hub | Hub repository, `/` | `/Dockerfile` | `https://we.supercollective.io` | 3000 | `/data` |

## Import application settings

Both applications build from Base Directory `/`. Select Dockerfile, not Docker
Compose. Polymind's Dockerfile now lives alongside its source, like Puck's.
For an existing Polymind application, change Dockerfile Location from
`/deploy/Dockerfile` to `/apps/polymind/Dockerfile` before deploying this revision.
Keep its existing operator token and persistent storage unchanged.

During creation, Smart Scan > Review > Env file offers these root templates:

| Application | Import template | Required manual value |
|---|---|---|
| Polymind | [`.env.template`](../.env.template) | `OPERATOR_TOKEN`: private random value, at least 32 characters |
| Puck | [`.env.sample`](../.env.sample) | None |

Select the matching file and confirm Import before Continue. The root
[`.env.example`](../.env.example) is for local development; its loopback host and
local data path are unsuitable for deployment. Do not import Polymind's settings
into Puck. Templates populate values, but do not create domains or storage.

Configure one canonical HTTPS domain per application, enable **Include Coolify
default variables**, and leave interpolation enabled for `PUBLIC_ORIGIN=$COOLIFY_URL`.
Coolify supplies the URL from that application's domain configuration. The app
still receives `PUBLIC_ORIGIN`; no hosting-specific code or request-header origin
inference is needed. Do not configure a list of domains as the application expects
one origin. Set every imported variable to **Not available during build** and
**Available in the container**; template comments do not set these UI flags.

For an existing application, update individual variables in Normal view rather
than replacing the whole variable set. Preserve the existing operator token and
provider settings. Restart after runtime-only changes; deploy for image changes.
Verify the participant URL and operator sign-in after applying changes.

Dockerfile imports do not generate a token or enforce required fields in Coolify.
Polymind itself refuses startup without a valid token. Generate one privately with
`openssl rand -hex 32`, store it in a password manager, and enter it once. Never
put a real secret in a template. Compose's `SERVICE_PASSWORD_*` generators are
not part of this Dockerfile workflow. Provider keys and transcription remain
explicit opt-ins and are omitted from the production templates.

See Coolify's [Smart Scan](https://coolify.io/docs/applications/builds/smart-scan)
and [application variables](https://coolify.io/docs/applications/configuration/environment-variables).

Puck remains a separate Coolify Application. Use the repository root as build context, never `apps/puck`, because its image uses the root lockfile. Its own volume at `/data` must be writable by UID/GID 1000; do not share Polymind's volume. See [Puck runtime settings](../apps/puck/docs/operations.md#coolify-packaging). Run `just build-puck-container` and `just test-puck-container` for a disposable local image check. Changing the source repository does not migrate data or authorise a live deployment.

Create a `Rehearsing We` project/environment and select the actual destination server. Connect the existing GitHub App, granting only the selected repositories. Repository/branch selection must identify the reviewed commits; local unpushed branches cannot deploy. GitHub permissions and DNS/TLS must be verified in that account, not inferred from these files.

For Polymind, expose port 3000 to Coolify's proxy, set `PUBLIC_ORIGIN=$COOLIFY_URL` (resolving to `https://polymind.supercollective.io`), `HUB_URL=https://we.supercollective.io` and a privately generated `OPERATOR_TOKEN` (at least 32 characters). Keep secrets runtime-only. Set `OPENAI_API_KEY`, `JEV_API_KEY` and `TRANSCRIPTION_MODEL` only for explicitly selected providers. `HOST=0.0.0.0`, `PORT=3000`, `DATA_DIR=/data/polymind` and the packaged Python executable are supplied by the image. Mount one persistent volume at `/data`, writable by UID/GID 10001. The nested data directory keeps its sibling writer lock inside that writable volume.

Use one replica and stop the previous writer before its replacement starts. The database-directory lock intentionally rejects overlapping writers. The image provides `/healthz` and its own runtime-native health check. Do not publish host ports, add custom proxy labels or expose the operator token in URLs. Serve public HTTPS; HTTP is accepted only on loopback for development.

Build `docker build -f apps/polymind/Dockerfile -t polymind:candidate .`, then exercise the immutable image with disposable data. Promote that exact tested revision/image. Check public join/save/return, private result release, restart, projection and an isolated backup restore. Verify outside the developer LAN on both mobile data and Wi-Fi. Neither a successful build nor healthy loopback proves public routing or device compatibility.

The image runs erasable TypeScript using pinned Node 26 native type stripping; CI separately typechecks and compiles it. Only production JavaScript dependencies enter the image. Dependency lifecycle scripts are disabled, retaining the imported policy that permits no required build scripts.

The full matching runtime is built from `packages/match` in the same checkout and installed non-editably using its own lockfile, with development dependencies excluded; there is no sibling checkout or dependency installation at runtime. Run `mise exec -- just build-container` and `mise exec -- just test-matching-container` to verify the packaged worker without provider calls. Code rollback after a schema change may require restoration of the complete corresponding data backup. Preserve failed jobs and inputs; retries are explicit and cached successful matching work is reused.

For an already configured synthetic staging application, `just deploy-staging` uses `COOLIFY_URL`, `COOLIFY_TOKEN` and `COOLIFY_STAGING_APP_UUID`. It follows the documented [deployment request](https://coolify.io/docs/api/endpoints/deployments/deploy-by-tag-or-uuid) and [deployment status](https://coolify.io/docs/api/endpoints/deployments/get-deployment-by-uuid) endpoints, then `just smoke-staging https://your-staging-domain` checks public routing and the unauthenticated operator boundary. This workflow has not been exercised against the target instance.
