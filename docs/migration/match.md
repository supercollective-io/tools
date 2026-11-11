# Match import — 11 November 2026

Match's authoritative source now lives in `packages/match`. The standalone CLI,
operator review, participant pilot, research scripts and tests remain available.
The Python worker still consumes immutable Polymind snapshots through its existing
process contract; this migration does not change scoring, allocation or publication.

## Source history

The outstanding source work was inspected and committed in the original Match
checkout before import, with its existing lint, format, type and test hooks:

1. `ae7ef7d` — operator review and expert-assisted blind batches.
2. `0f2e1f9` — participant registration, organiser controls and private partner release.
3. `437329e` — request-support experiments, approved development comparisons,
   findings and the pytest root import path needed by experiment tests.

The non-squashed subtree merge `fbf1edb` has both the previous Tools HEAD and
`437329e92dbf53980c1026d1e8af38caae45d4f6` as parents. Its `packages/match` tree
exactly matches that source commit's root tree. Original commit IDs and ancestry
are preserved, rather than reconstructed from a source archive. Earlier Match
commits retain their original paths; inspect them with `git show <commit>:<path>`.

All 66 source files were imported. The runtime files matched the source hashes
recorded for the former vendored wheel byte for byte. The original checkout,
credentials, private runs and raw data remain in place; none of those private
files was imported. A private Git bundle was verified before import. A focused
scan of the original reachable history found no private runtime paths or common
credential patterns; that is not a guarantee about arbitrary secret formats.

## Build and development

- `packages/match` is the only Python project, with one manifest, lockfile and
  environment. Polymind launches `conference_match.worker` directly from it.
  The redundant worker project, lockfile, environment and dual-lock recipe were removed.
- Container builds install from that same package and lockfile, non-editably and
  without development dependencies. No sibling repository or runtime installation
  is required. Source edits need no version bump or package hand-off.
- Root `just setup`, `check`, `typecheck`, `test`, `build` and `verify` include
  Match. `just match` runs its CLI from the package directory, preserving relative
  example paths. Private workspaces can be supplied explicitly from the old checkout.
- Worker contracts live in `packages/match/contracts`, their tests in Match's
  normal test suite, and their guide in `packages/match/docs/worker.md`. The prior
  synthetic benchmark is retained in `docs/verification/matching-benchmark.json`.
- No retained third-party dependency version changed. The build backend remains
  pinned to `uv_build==0.13.4`.
- Root CI replaces the imported standalone workflow. Root pre-commit hooks run
  Ruff, Pyright and pytest through the same uv environment; install them with
  `just hooks-install`. Pre-commit is a development dependency and is excluded
  from the production image.
- The vendored wheel, checksum, provenance manifest and wheel-digest test were
  removed. Schema, subprocess/restart and CLI/asset contracts remain. CI also
  runs those contracts inside the production image with networking disabled.

Run root commands through `mise exec -- just`. Package builds write ignored
distribution artefacts to `packages/match/dist`; these are ordinary build outputs,
not versioned dependencies handed between repositories.

## Verification and limits

The import tree and source ancestry were checked directly with Git. Frozen setup
and the root CLI help command pass. The production image builds from this checkout,
and its three matching contracts pass as the non-root runtime user without network
access. The complete root gate passes 562 Polymind tests and 84 Match tests
(including the three worker contracts), lint, types and both builds. Chromium verification also passes.
The final image also passes its HTTP health check as UID 10001; Match imports
from site-packages, development tools are absent, and Polymind's default Python
launch and idempotent retry pass using synthetic cached vectors. Root pre-commit
hooks pass Ruff, Pyright and pytest checks. The worker project and vendor directory
are absent. See the
[verification record](../verification/match-monorepo.json).

The first combined gate encountered three timing failures in existing Polymind
tests while the container built concurrently; the complete gate passed unmodified
when rerun without that build load. No live model calls, deployment or human validation is part of this
migration. Previous benchmark and container reports remain historical evidence
for the revisions they identify.
