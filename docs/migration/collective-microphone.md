# Collective Microphone import

Imported source HEAD: `608c0a2`. Reviewed working-state snapshot: `718c17396f3d1007cdd4e43a985a51fe946fe331`. The non-squashed subtree merge preserves the source ancestry under `apps/polymind`.

All 205 tracked and required untracked source files matched the reviewed snapshot byte for byte immediately after import. Source history reachable from HEAD was checked for private runtime paths and common credential patterns (627 objects, no findings); this is a focused check, not a guarantee about arbitrary secret formats. Stashes and unrelated feature branches were backed up but not imported.

Private migration backups are outside this repository at `../tools-migration-backup-20261111/`. They contain verified Git bundles, binary-safe index/working patches, source manifests and working files for Microphone, Match, Puck and Flight. The microphone runtime copy includes 42 SQLite online backups verified with `integrity_check`. Source journals and originals remain intact. A live copied JSONL directory is a preservation copy, not a rehearsed atomic application restore.

Excluded from source import: credentials, `.env`, `runs/`, databases, recordings, dependencies, build output and caches. Required untracked rehearsal/load code and synthetic fixtures were included. No original checkout was reset, cleaned or deleted.

Baseline in the original checkout: formatting, TypeScript, 515 tests across 44 files and build passed. An initial sandbox run could not bind loopback sockets; rerunning with local socket access passed. The root pnpm workspace retains imported runtime dependency versions; Playwright is added separately for browser verification.

Cutover is provisional until the new public deployment and human rehearsal pass. Existing CLI aliases and old run readers remain available from `apps/polymind`. Do not delete or overwrite original private runs.
