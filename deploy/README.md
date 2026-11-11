# Coolify deployment

Target instance: `https://deploy.radicaldata.org`. Use four independent GitHub App-backed **Applications**, with Dockerfile builds. This follows [Coolify's Git Dockerfile workflow](https://coolify.io/docs/applications/builds/dockerfile). The target instance and GitHub App connection have not been authenticated or changed from this task: browser access timed out and no API credential source is configured.

| Application | Repository/context | Dockerfile | Public domain | Container port | Durable path |
|---|---|---|---|---|---|
| Polymind | `supercollective-io/tools`, `/` | `/deploy/Dockerfile` | `https://polymind.supercollective.io` | 3000 | `/data` |
| Puck | Puck repository, `/` | `/Dockerfile` | `https://puck.supercollective.io` | See Puck deployment guide | See Puck deployment guide |
| Flight | Flight repository, `/` | `/Dockerfile` | `https://flight.supercollective.io` | See Flight relay guide | See Flight relay guide |
| Hub | Hub repository, `/` | `/Dockerfile` | `https://we.supercollective.io` | 3000 | `/data` |

Create a `Rehearsing We` project/environment and select the actual destination server. Connect the existing GitHub App, granting only the selected repositories. Repository/branch selection must identify the reviewed commits; local unpushed branches cannot deploy. GitHub permissions and DNS/TLS must be verified in that account, not inferred from these files.

For Polymind, expose port 3000 to Coolify's proxy, set `PUBLIC_ORIGIN=https://polymind.supercollective.io`, `HUB_URL=https://we.supercollective.io` and a privately generated `OPERATOR_TOKEN` (at least 32 characters). Keep secrets runtime-only. Set `OPENAI_API_KEY`, `JEV_API_KEY` and `TRANSCRIPTION_MODEL` only for explicitly selected providers. `HOST=0.0.0.0`, `PORT=3000`, `DATA_DIR=/data/polymind` and the packaged Python executable are supplied by the image. Mount one persistent volume at `/data`, writable by UID/GID 10001. The nested data directory keeps its sibling writer lock inside that writable volume.

Use one replica and stop the previous writer before its replacement starts. The database-directory lock intentionally rejects overlapping writers. The image provides `/healthz` and its own runtime-native health check. Do not publish host ports, add custom proxy labels or expose the operator token in URLs. Serve public HTTPS; HTTP is accepted only on loopback for development.

Build `docker build -f deploy/Dockerfile -t polymind:candidate .`, then exercise the immutable image with disposable data. Promote that exact tested revision/image. Check public join/save/return, private result release, restart, projection and an isolated backup restore. Verify outside the developer LAN on both mobile data and Wi-Fi. Neither a successful build nor healthy loopback proves public routing or device compatibility.

The image runs erasable TypeScript using pinned Node 26 native type stripping; CI separately typechecks and compiles it. Only production JavaScript dependencies enter the image. Dependency lifecycle scripts are disabled, retaining the imported policy that permits no required build scripts.

The full matching runtime is built from `packages/match` in the same checkout and installed non-editably using its own lockfile, with development dependencies excluded; there is no sibling checkout or dependency installation at runtime. Run `mise exec -- just build-container` and `mise exec -- just test-matching-container` to verify the packaged worker without provider calls. Code rollback after a schema change may require restoration of the complete corresponding data backup. Preserve failed jobs and inputs; retries are explicit and cached successful matching work is reused.

For an already configured synthetic staging application, `just deploy-staging` uses `COOLIFY_URL`, `COOLIFY_TOKEN` and `COOLIFY_STAGING_APP_UUID`. It follows the documented [deployment request](https://coolify.io/docs/api/endpoints/deployments/deploy-by-tag-or-uuid) and [deployment status](https://coolify.io/docs/api/endpoints/deployments/get-deployment-by-uuid) endpoints, then `just smoke-staging https://your-staging-domain` checks public routing and the unauthenticated operator boundary. This workflow has not been exercised against the target instance.
