# Back up and verify Polymind data

The commands require explicit directories and leave provider processes stopped.
Existing state is never overwritten. Run the commands
from the repository root with the pinned runtime (`mise exec -- node`, Node 26).
The app dependencies must already be installed.

## Preconditions

1. Stop the Polymind server gracefully and wait for it to exit.
2. Keep one writer per data directory. The server and backup command
   use the same `proper-lockfile` directory lock.
   A lock failure means the operation stops; do not delete an active lock.
3. Choose a new output directory outside the source directory. Use storage
   accessible only to the organiser. Backups contain participant writing,
   browser credential hashes, private journals, recordings, worker artefacts
   and recovery information. Permissions do not encrypt the contents.
4. Keep API keys and runtime secrets in the deployment secret store. A data
   backup does not include secrets stored outside its explicit source directory.

## Create a stopped-writer backup

The container stores application data at `/data/polymind` inside the `/data`
volume. Use that application directory as the backup source; the image includes
these scripts under `/app/scripts`.

```sh
mise exec -- node scripts/backup.mjs \
  --source /private/path/polymind-data \
  --target /private/path/backups/before-rehearsal
```

Expected result: exit status zero and a JSON summary naming the new directory
and file count. The command refuses an existing output, an output within the
source (including paths through symbolic links), active directory/journal locks
and symbolic links or special files inside the source.

The command copies journals, recordings, recovery metadata and nested worker
files. For each SQLite database, it copies the stopped database and WAL to
private scratch space, then uses SQLite's backup API to produce a standalone
consistent database. It excludes live WAL/SHM/journal sidecars from the archive.
The source files are not opened by SQLite and are not rewritten or checkpointed.
All backup files have mode `0600`; output directories have mode `0700`.

`backup-manifest.json` records the byte count and SHA-256 digest of every archived
file. The manifest detects corruption and missing or extra files. It is not a
cryptographic signature. Keep the archive on trusted private storage and copy
it to independent storage before changing or deleting the live data.

## Verify an isolated restore

```sh
mise exec -- node scripts/restore-check.mjs \
  --backup /private/path/backups/before-rehearsal
```

Expected result: exit status zero and `"status":"passed"`, with database,
journal and file counts. The checker:

1. Checks the exact file inventory, byte counts and SHA-256 digests. It rejects
   path traversal, symbolic links, duplicate manifest paths and unsupported
   manifest versions.
2. Copies files into a new private temporary directory.
3. Runs SQLite integrity and foreign-key checks on the temporary copies.
4. Requires the supported session schema and reads every referenced voice
   journal with the existing `readLiveRun` reader.
5. Checks the archive manifest again and removes the temporary restore.

The checker never starts a server, a model, matching or transcription. It never
opens the archive databases with SQLite or mutates the live directory. A passing
check proves the covered file/database/journal checks; verify browser recovery,
operator access and provider configuration separately before a performance.

## Restore to service

Stop the server. Preserve the current data directory as a separate failed-state
copy. Copy the verified archive contents, excluding `backup-manifest.json`, to a
new empty private data directory; retain `0700` directory and `0600` file modes.
Point `DATA_DIR` at that new directory and restart one server process. Keep the
archive immutable. Do not restore over a running server or merge databases.
On restart, interrupted jobs remain subject to the normal explicit retry policy;
voice generation still requires an explicit operator action.

## Synthetic checks

```sh
mise exec -- pnpm --dir apps/polymind exec vitest run tests/session-backup.test.ts
```

The tests create synthetic `LiveLog` and `SessionStore` fixtures in temporary
directories. They cover committed WAL capture, worker/audio copying, isolated
restore, directory locks, linked paths, manifest traversal and corrupted databases
and journals. No real participant fixtures or provider calls are used.
