# Puck import — 11 November 2026

Puck's authoritative source lives in `apps/puck`. It shares development tooling
with Polymind and Match, while retaining its own server, identity, SQLite database,
recording formats, Docker image and deployment. No participant data is migrated.

## Preserved history and working changes

The non-squashed subtree import `1a8304a` initially brought in source commit
`229fab174665ffd8010df474adefef11effac855`. Its imported tree matched that source
commit exactly. Original commit IDs and ancestry are retained; older commits use
their original repository-root paths (`git show <commit>:<path>`).

At the user's request, all outstanding Puck source work was then committed in the
original checkout, in two focused commits with its existing hooks enabled:

- `448e196`: configurable browser-test ports, screenshots and origin-safe requests.
- `87e59bc`: agent instructions, development routes and operational guidance.

The follow-up subtree merge `034c4f1` imports both commits. Its `apps/puck` tree
exactly matches `87e59bc`'s root tree. Working-file hashes were checked against the
pre-import manifest; the original source bytes were preserved and its checkout is
clean. Integration changes are subsequent edits, not rewritten source history.

The original checkout and private data remain in place. A verified Git bundle,
binary working/index patches, the previously untracked `AGENTS.md`, and SHA-256
source-file hashes were saved under `/private/tmp/puck-monorepo-import-20261111`
before import. This temporary safety copy is not a durable operational backup.
Only tracked source and the inspected agent instructions were imported; no local
`.env`, database, recordings, dependencies or generated output was copied.

## Workspace and checks

- Root `mise.toml` and package manifests align on Node 26.13.0 and pnpm 12.18.0.
- The root pnpm lockfile incorporates Puck's dependency graph. Retained direct
  dependency resolutions are unchanged in both applications. Shared transitive
  snapshots use the existing Tools resolution when the lockfiles overlap.
- Puck's separate lockfile, workspace policy, mise configuration, registry file,
  Lefthook setup and nested CI workflow were removed. Root policy permits the
  required `better-sqlite3` and `esbuild` builds, disables Lefthook builds, and
  preserves Puck's exact `ws@8.22.2` release-age exception.
- Root `just setup`, `check`, `typecheck`, `test`, `build` and `verify` include Puck.
  Application test suites run sequentially with at most four Vitest workers each
  to bound CPU contention in the combined gate.
- Root pre-commit hooks check Puck lint, types and unit tests for Puck changes;
  install them with `mise exec -- just hooks-install`.
- `just dev-puck` starts Puck; `just puck <command>` runs a package command.
  Both apps default to port 3000, so use `PORT=3001` when running Puck alongside
  Polymind. Configure `PUBLIC_ORIGIN` consistently when overriding it.
- `just test-browser` checks both applications. `just test-browser-puck` builds
  and checks Puck alone, using a temporary database and the imported diagnostics.

## Independent deployment

Use the Tools repository root as build context and `apps/puck/Dockerfile` as the
Dockerfile. The separate production dependency stage excludes development tools.
The image retains UID/GID 1000, port 3000, its `/healthz` probe and `/data` storage.
Puck's volume must remain separate from Polymind's. Root CI builds and smoke-tests
both images; Puck's check covers non-root health, absence of unrelated runtimes,
real two-client WebSockets/replay and room/host persistence across restart.

See [Puck operations](../../apps/puck/docs/operations.md#coolify-packaging) and
[deployment settings](../../deploy/README.md). The repository change does not
configure Coolify, switch a live deployment, move volumes or publish a branch.

## Verification

The source checkout passed lint, types, all 21 unit tests, a production build and
all five Chromium tests before integration. Monorepo verification evidence is
recorded in [the verification record](../verification/puck-monorepo.json).

Synthetic checks establish the behaviours exercised, not human decision quality,
physical-device compatibility or venue readiness. Existing reports remain
historical evidence for the revisions they identify.
