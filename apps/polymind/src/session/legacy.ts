import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import lockfile from "proper-lockfile";
import { readLiveRun } from "../live-runs.ts";
import { digest, id, text } from "./contracts.ts";
import { SessionStore } from "./store.ts";

async function destination(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return join(await destination(dirname(absolute)), basename(absolute));
  }
}

/** Explicit, offline import. Reads the old journal; never resumes or rewrites it. */
export async function importLegacySession(options: {
  source: string;
  target: string;
}) {
  const source = await realpath(options.source);
  const target = await destination(options.target);
  const distance = relative(source, target);
  if (
    !distance ||
    (!distance.startsWith(`..${sep}`) &&
      distance !== ".." &&
      !isAbsolute(distance))
  )
    throw new Error("The target must be outside the legacy source directory.");
  const unlockSource = await lockfile.lock(source, {
    retries: 0,
    stale: 30000,
  });
  const releases: (() => Promise<void>)[] = [unlockSource];
  let stage: string | undefined;
  let readStage: string | undefined;
  let database: DatabaseSync | undefined;
  let store: SessionStore | undefined;
  let createdTarget = false;
  try {
    const journalPath = join(source, "live.jsonl");
    for (const path of [journalPath, join(source, "participation.sqlite")])
      if (!(await lstat(path)).isFile())
        throw new Error("Legacy source files must be ordinary files.");
    releases.push(
      await lockfile.lock(journalPath, { retries: 0, stale: 30000 }),
    );
    const journalBytes = await readFile(journalPath);
    const legacy = await readLiveRun(journalPath);
    if (legacy.state.config.live.mode !== "typed")
      throw new Error("Select a legacy typed participation session.");
    // Opening even a read-only WAL database can create sidecars. Read a private
    // offline copy instead; the source directory and journal locks exclude writers.
    readStage = await mkdtemp(join(tmpdir(), "polymind-legacy-read-"));
    await chmod(readStage, 0o700);
    for (const name of ["participation.sqlite", "participation.sqlite-wal"]) {
      try {
        const original = join(source, name);
        if (!(await lstat(original)).isFile())
          throw new Error("Legacy SQLite files must be ordinary files.");
        await copyFile(original, join(readStage, name));
        await chmod(join(readStage, name), 0o600);
      } catch (error) {
        if (
          name.endsWith("-wal") &&
          (error as NodeJS.ErrnoException).code === "ENOENT"
        )
          continue;
        throw error;
      }
    }
    database = new DatabaseSync(join(readStage, "participation.sqlite"), {
      readOnly: true,
    });
    const version = database.prepare("PRAGMA user_version").get()?.user_version;
    if (version !== 1 && version !== 2)
      throw new Error("Unsupported legacy participation schema.");
    if (
      database
        .prepare("PRAGMA integrity_check")
        .all()
        .some((row) => Object.values(row)[0] !== "ok") ||
      database.prepare("PRAGMA foreign_key_check").all().length
    )
      throw new Error("Legacy participation database integrity check failed.");
    const run = database
      .prepare("SELECT value FROM metadata WHERE key='run'")
      .get()?.value;
    if (run !== legacy.state.runId)
      throw new Error("Legacy database and journal belong to different runs.");
    const people = database
      .prepare(
        "SELECT id,credential,position FROM participants ORDER BY position",
      )
      .all() as { id: string; credential: string; position: number }[];
    if (people.length > 180)
      throw new Error("Legacy participant count exceeds the session capacity.");
    for (const p of people)
      if (!id.safeParse(p.id).success || !/^[a-f0-9]{64}$/.test(p.credential))
        throw new Error(
          "Invalid legacy participant identity or credential hash.",
        );
    const sessionId = id.safeParse(legacy.state.runId).success
      ? legacy.state.runId
      : randomUUID();
    const roundId = randomUUID(),
      voiceRunId = sessionId;
    const createdAt = legacy.events[0]?.at ?? new Date().toISOString();
    const session = {
      id: sessionId,
      title: legacy.state.scenario.title,
      capacity: Math.max(140, people.length),
      open: true,
      createdAt,
    };
    const round = {
      id: roundId,
      sessionId,
      prompt: legacy.state.scenario.openingInvitation,
      mode: "continuous",
      open: legacy.state.status !== "ended",
      createdAt,
    };
    try {
      if (
        !(await lstat(target)).isDirectory() ||
        (await readdir(target)).length
      )
        throw new Error(
          "The target must be an empty directory; existing state is never replaced.",
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(target, { recursive: true, mode: 0o700 });
      createdTarget = true;
    }
    releases.push(await lockfile.lock(target, { retries: 0, stale: 30000 }));
    if ((await readdir(target)).length)
      throw new Error("Target changed while acquiring its directory lock.");
    stage = await mkdtemp(join(dirname(target), ".legacy-import-"));
    await chmod(stage, 0o700);
    store = new SessionStore(join(stage, "sessions.sqlite"));
    await chmod(join(stage, "sessions.sqlite"), 0o600);
    const hasRevisions = !!database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='revisions'",
      )
      .get();
    const recoveries: {
      participantId: string;
      badge: string;
      recovery: string;
    }[] = [];
    store.transaction(() => {
      store?.db
        .prepare("INSERT INTO sessions VALUES (?,?)")
        .run(sessionId, JSON.stringify(session));
      store?.db
        .prepare("INSERT INTO rounds VALUES (?,?,?)")
        .run(roundId, sessionId, JSON.stringify(round));
      for (const [index, p] of people.entries()) {
        const badge = String(index + 1).padStart(3, "0");
        const recovery = randomBytes(32).toString("hex");
        const participant = {
          id: p.id,
          name: `Participant ${badge}`,
          badge,
          seated: false,
        };
        store?.db
          .prepare("INSERT INTO participants VALUES (?,?,?,?,?)")
          .run(
            p.id,
            sessionId,
            p.credential,
            digest(recovery),
            JSON.stringify(participant),
          );
        recoveries.push({ participantId: p.id, badge, recovery });
        let revisions = hasRevisions
          ? (database
              ?.prepare(
                "SELECT revision,text,saved_at FROM revisions WHERE participant=? ORDER BY revision",
              )
              .all(p.id) as {
              revision: number;
              text: string;
              saved_at: string;
            }[])
          : [];
        if (!revisions.length) {
          const submissions = database
            ?.prepare(
              "SELECT text,saved_at FROM submissions WHERE participant=? ORDER BY position",
            )
            .all(p.id) as { text: string; saved_at: string }[];
          if (submissions.length)
            revisions = [
              {
                revision: 1,
                text: submissions.map((s) => s.text).join("\n"),
                saved_at: submissions.at(-1)?.saved_at ?? createdAt,
              },
            ];
        }
        for (const [offset, revision] of revisions.entries()) {
          if (revision.revision !== offset + 1)
            throw new Error("Legacy revisions must be consecutive from one.");
          const input = {
            requestId: randomUUID(),
            roundId,
            expectedRevision: offset,
            text: text.parse(revision.text),
            confirmed: false,
            matching: false,
            source: "typed",
          };
          const contribution = {
            id: `${p.id}:${roundId}:${revision.revision}`,
            participantId: p.id,
            roundId,
            prompt: round.prompt,
            revision: revision.revision,
            text: input.text,
            confirmed: false,
            matching: false,
            source: "typed",
            savedAt: revision.saved_at,
          };
          store?.db
            .prepare("INSERT INTO revisions VALUES (?,?,?,?,?,?)")
            .run(
              p.id,
              roundId,
              revision.revision,
              input.requestId,
              digest(JSON.stringify(input)),
              JSON.stringify(contribution),
            );
        }
      }
      store?.db
        .prepare("INSERT INTO voice_runs VALUES (?,?,?)")
        .run(voiceRunId, sessionId, roundId);
    });
    store.close();
    store = undefined;
    const voiceFile = `voice-${voiceRunId}.jsonl`;
    await writeFile(join(stage, voiceFile), journalBytes, {
      flag: "wx",
      mode: 0o600,
    });
    await mkdir(join(stage, "legacy"), { mode: 0o700 });
    await backup(database, join(stage, "legacy", "participation.sqlite"));
    await chmod(join(stage, "legacy", "participation.sqlite"), 0o600);
    const cookieName = `collective_${legacy.state.runId.slice(0, 8)}`;
    await writeFile(
      join(stage, "legacy-recovery.json"),
      `${JSON.stringify({ sessionId, participants: recoveries }, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    await writeFile(
      join(stage, "legacy-import.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          sessionId,
          roundId,
          voiceRunId,
          legacyRunId: legacy.state.runId,
          cookieName,
          importedAt: new Date().toISOString(),
          sourceJournalSha256: createHash("sha256")
            .update(journalBytes)
            .digest("hex"),
        },
        null,
        2,
      )}\n`,
      { flag: "wx", mode: 0o600 },
    );
    if ((await readdir(target)).length)
      throw new Error("Target changed during import.");
    await rename(stage, target);
    stage = undefined;
    await chmod(target, 0o700);
    return {
      sessionId,
      roundId,
      voiceRunId,
      participants: people.length,
      cookieName,
      recoveryFile: join(target, "legacy-recovery.json"),
    };
  } finally {
    store?.close();
    database?.close();
    if (readStage) await rm(readStage, { recursive: true, force: true });
    if (stage) await rm(stage, { recursive: true, force: true });
    // Never recursively remove a target after releasing its writer lock.
    // An unexpected nonempty target is retained for inspection.
    if (createdTarget && stage) await rmdir(target).catch(() => {});
    for (const release of releases.reverse()) await release();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--source" || args[2] !== "--target") {
    console.error(
      "Usage: node apps/polymind/src/session/legacy.ts --source LEGACY_DIR --target EMPTY_DATA_DIR",
    );
    process.exitCode = 1;
  } else {
    try {
      console.log(
        JSON.stringify(
          await importLegacySession({
            source: args[1] as string,
            target: args[3] as string,
          }),
        ),
      );
    } catch {
      console.error(
        "Legacy import failed. Stop source/target writers and check the explicit paths, compatible schemas and empty target. Source data was not rewritten.",
      );
      process.exitCode = 1;
    }
  }
}
