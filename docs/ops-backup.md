# Import, back up and verify Polymind data

The commands require explicit directories and leave provider processes stopped.
Existing state is never overwritten. Run the commands
from the repository root with the pinned runtime (`mise exec -- node`, Node 26).
The app dependencies must already be installed.

## Preconditions

1. Stop the Polymind server gracefully and wait for it to exit. For legacy
   sessions, stop the original participation server too.
2. Keep one writer per data directory. The server, importer and backup command
   use the same `proper-lockfile` directory lock. Import also acquires the old
   journal lock, which detects an original participation server still running.
   A lock failure means the operation stops; do not delete an active lock.
3. Choose a new output directory outside the source directory. Use storage
   accessible only to the organiser. Backups contain participant writing,
   browser credential hashes, private journals, recordings, worker artefacts
   and any imported recovery codes. Permissions do not encrypt the contents.
4. Keep API keys and runtime secrets in the deployment secret store. A data
   backup does not include secrets stored outside its explicit source directory.

## Import one legacy participation session

A compatible legacy source contains both `participation.sqlite` (schema 1 or 2)
and `live.jsonl`. The database run identifier must match the journal. The source
must contain a typed participation run. Import never resumes the source journal
or changes its frozen model configuration.

```sh
mise exec -- node apps/polymind/src/session/legacy.ts \
  --source /private/path/old-participation \
  --target /private/path/new-polymind-data
```

The target must be absent or empty. A nonempty target is rejected, including a
previous successful import. Source and target locks exclude cooperating writers.
SQLite can create WAL sidecars even when opened read-only, so import reads a
private offline copy of the database and WAL. The source database, WAL and
journal bytes remain unchanged.

Expected result: the command prints identifiers, participant count, legacy
cookie name and the recovery-file path. It does not print recovery codes or
browser credentials. The new directory contains:

| File | Purpose |
| --- | --- |
| `sessions.sqlite` | Independent event identity, continuous round, participants and saved revisions |
| `voice-<run-id>.jsonl` | Exact copy of the original voice journal, with unchanged frozen configuration |
| `legacy/participation.sqlite` | Consistent private archive of the original participation database, including WAL state |
| `legacy-import.json` | Run/session/round mapping, original cookie name and source-journal checksum |
| `legacy-recovery.json` | Newly generated private recovery codes, one per imported participant |

The event/session ID equals the original run UUID. Participant UUIDs and hashed
browser credentials are preserved. The original browser cookie was
`collective_<first-eight-run-id-characters>`; the hosted server can use the
migration metadata to recognise that cookie. The importer does not send or set
browser cookies. Returning from the same browser works only when its original
cookie is available on the new origin. Otherwise distribute the corresponding
new recovery code privately.

Legacy participants receive neutral display names such as `Participant 001`;
the old database did not store chosen names. Recovery codes exist in plaintext
only in `legacy-recovery.json`; the database stores their hashes. Keep this file
private. Never project or commit the recovery file. The output directory has mode `0700` and
private files have mode `0600`.

Saved replacement revisions retain their order and content. For the original
append-only schema, submissions become one saved text separated by newlines.
Imported contributions remain unconfirmed and outside matching eligibility.
The importer rejects text beyond the current 12,000-character contribution bound
and invalid or non-consecutive revision history; it does not truncate text.
The original database archive and journal retain the legacy history.

An ended legacy voice closes only its imported continuous round. The new event
identity stays open, so the operator can create another round without replacing
participants. A non-ended voice leaves its imported round open. Import does not
start or resume generation. Start the new server against the target directory
and verify participant recovery and saved writing before inviting people back.

On failure, the importer leaves the source unchanged and removes its incomplete
staging data. It never merges into existing target state. Keep the original
source until the imported event has passed recovery and backup checks.

## Create a stopped-writer backup

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
mise exec -- pnpm --dir apps/polymind exec vitest run tests/session-legacy.test.ts
```

The tests create only synthetic `ParticipationStore`, `LiveLog` and
`SessionStore` fixtures in temporary directories. They cover ended/non-ended
voice import, preserved identity and frozen configuration, private recovery,
schema 1 append-only import, rejected conflicts/locks/oversized text, committed
WAL capture, worker/audio copying, isolated restore and corrupted archives.
No real participant fixtures or provider calls are used.
