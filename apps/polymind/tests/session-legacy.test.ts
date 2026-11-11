import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import lockfile from "proper-lockfile";
import { afterEach, expect, it } from "vitest";
import { LiveLog, readLiveRun } from "../src/live-runs.ts";
import { liveConfigSchema } from "../src/live-schema.ts";
import { ParticipationStore } from "../src/participation-store.ts";
import { digest } from "../src/session/contracts.ts";
import { importLegacySession } from "../src/session/legacy.ts";
import { SessionStore } from "../src/session/store.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function temporary() {
  const directory = await mkdtemp(join(tmpdir(), "polymind-legacy-"));
  directories.push(directory);
  return directory;
}
async function fixture(ended = true) {
  const root = await temporary(),
    source = join(root, "legacy");
  await mkdir(source, { mode: 0o700 });
  const config = liveConfigSchema.parse(
    JSON.parse(
      await readFile(
        new URL("../examples/live-projection.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  config.live = { ...config.live, mode: "typed", score: undefined };
  const log = await LiveLog.create(join(source, "live.jsonl"), {
    type: "live.created",
    config,
    scenario: {
      schemaVersion: 1,
      title: "Synthetic legacy event",
      openingInvitation: "What matters?",
      voices: [],
    },
  });
  const runId = log.state.runId;
  const participation = new ParticipationStore(
    join(source, "participation.sqlite"),
    runId,
  );
  const person = participation.join(),
    other = participation.join();
  participation.revise(person.id, 1, "First saved thought.");
  participation.revise(person.id, 2, "A corrected thought.");
  participation.submit(other.id, randomUUID(), "An append-only thought.", 0);
  if (ended) await log.append({ type: "session.ended", elapsedMs: 0 });
  await log.close();
  participation.close();
  return { root, source, runId, person, other, config };
}
const checksum = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
async function sourceBytes(source: string) {
  return Promise.all(
    ["live.jsonl", "participation.sqlite"].map(async (path) =>
      checksum(await readFile(join(source, path))),
    ),
  );
}
function command(script: string, ...args: string[]) {
  return spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL(`../../../scripts/${script}`, import.meta.url)),
      ...args,
    ],
    { encoding: "utf8", timeout: 20000 },
  );
}

it("imports an ended voice without ending event identity, preserving IDs, hashes and frozen journal bytes", async () => {
  const f = await fixture(),
    before = await sourceBytes(f.source),
    target = join(f.root, "new event");
  const sourceFiles = await readdir(f.source);
  const result = await importLegacySession({ source: f.source, target });
  expect(result.sessionId).toBe(f.runId);
  expect(result.cookieName).toBe(`collective_${f.runId.slice(0, 8)}`);
  expect(JSON.stringify(result)).not.toContain(f.person.credential);
  const store = new SessionStore(join(target, "sessions.sqlite"));
  try {
    expect(store.session(f.runId).open).toBe(true);
    expect(store.round(result.roundId)).toMatchObject({
      mode: "continuous",
      open: false,
    });
    expect(store.identify(f.runId, f.person.credential)?.id).toBe(f.person.id);
    expect(
      store.db
        .prepare("SELECT credential FROM participants WHERE id=?")
        .get(f.person.id)?.credential,
    ).toBe(digest(f.person.credential));
    expect(store.current(f.person.id, result.roundId)).toMatchObject({
      text: "A corrected thought.",
      revision: 2,
      confirmed: false,
      matching: false,
    });
    expect(store.current(f.other.id, result.roundId)?.text).toBe(
      "An append-only thought.",
    );
    expect(store.db.prepare("SELECT id FROM voice_runs").get()?.id).toBe(
      f.runId,
    );
    const recovery = JSON.parse(await readFile(result.recoveryFile, "utf8"));
    expect(
      store.recover(f.runId, recovery.participants[0].recovery).participant.id,
    ).toBe(f.person.id);
    expect(
      store.createRound(f.runId, "Next activity", "bounded").sessionId,
    ).toBe(f.runId);
  } finally {
    store.close();
  }
  expect(await readFile(join(target, `voice-${f.runId}.jsonl`))).toEqual(
    await readFile(join(f.source, "live.jsonl")),
  );
  expect(
    (await readLiveRun(join(target, `voice-${f.runId}.jsonl`))).state.config,
  ).toEqual(f.config);
  expect(await sourceBytes(f.source)).toEqual(before);
  expect(await readdir(f.source)).toEqual(sourceFiles);
  expect((await stat(target)).mode & 0o777).toBe(0o700);
  expect((await stat(result.recoveryFile)).mode & 0o777).toBe(0o600);
});

it("keeps a non-ended legacy round open, rejects conflicts and refuses locked source/target directories", async () => {
  const f = await fixture(false),
    target = join(f.root, "target");
  const unlockSource = await lockfile.lock(f.source, { retries: 0 });
  try {
    await expect(
      importLegacySession({ source: f.source, target }),
    ).rejects.toThrow();
  } finally {
    await unlockSource();
  }
  await mkdir(target);
  const unlockTarget = await lockfile.lock(target, { retries: 0 });
  try {
    await expect(
      importLegacySession({ source: f.source, target }),
    ).rejects.toThrow();
  } finally {
    await unlockTarget();
  }
  const imported = await importLegacySession({ source: f.source, target });
  const store = new SessionStore(join(target, "sessions.sqlite"));
  try {
    expect(store.round(imported.roundId).open).toBe(true);
  } finally {
    store.close();
  }
  const before = await readFile(join(target, "sessions.sqlite"));
  await expect(
    importLegacySession({ source: f.source, target }),
  ).rejects.toThrow("empty directory");
  expect(await readFile(join(target, "sessions.sqlite"))).toEqual(before);
  await expect(
    importLegacySession({ source: f.source, target: join(f.source, "nested") }),
  ).rejects.toThrow("outside");
  expect(await readdir(f.source)).not.toContain("nested");
});

it("refuses an active legacy journal and mismatched database/run identity", async () => {
  const f = await fixture();
  const unlock = await lockfile.lock(join(f.source, "live.jsonl"), {
    retries: 0,
  });
  try {
    await expect(
      importLegacySession({ source: f.source, target: join(f.root, "locked") }),
    ).rejects.toThrow();
  } finally {
    await unlock();
  }
  const participation = new ParticipationStore(
    join(f.source, "participation.sqlite"),
    f.runId,
  );
  participation.db
    .prepare("UPDATE metadata SET value=? WHERE key='run'")
    .run(randomUUID());
  participation.close();
  await expect(
    importLegacySession({ source: f.source, target: join(f.root, "wrong") }),
  ).rejects.toThrow("different runs");
});

it("backs up SQLite WAL state and private worker/audio files, then validates an isolated restore", async () => {
  const f = await fixture(),
    data = join(f.root, "data"),
    archive = join(f.root, "backup");
  await importLegacySession({ source: f.source, target: data });
  await mkdir(join(data, "matching", "synthetic-job"), { recursive: true });
  await writeFile(
    join(data, "matching", "synthetic-job", "result.json"),
    '{"synthetic":true}',
  );
  await writeFile(join(data, "synthetic.audio"), Buffer.from([1, 2, 3, 4]));
  const store = new SessionStore(join(data, "sessions.sqlite"));
  try {
    const added = store.createSession("Saved in WAL", 140);
    const dbBefore = await readFile(join(data, "sessions.sqlite"));
    const walBefore = await readFile(join(data, "sessions.sqlite-wal"));
    const backup = command("backup.mjs", "--source", data, "--target", archive);
    expect(backup.status, backup.stderr).toBe(0);
    expect(await readFile(join(data, "sessions.sqlite"))).toEqual(dbBefore);
    expect(await readFile(join(data, "sessions.sqlite-wal"))).toEqual(
      walBefore,
    );
    const inspection = join(f.root, "inspection.sqlite");
    await copyFile(join(archive, "sessions.sqlite"), inspection);
    const restored = new DatabaseSync(inspection, {
      readOnly: true,
    });
    try {
      const row = restored
        .prepare("SELECT body FROM sessions WHERE id=?")
        .get(added.id);
      expect(JSON.parse(row?.body as string).title).toBe("Saved in WAL");
    } finally {
      restored.close();
    }
    const check = command("restore-check.mjs", "--backup", archive);
    expect(check.status, check.stderr).toBe(0);
    expect(JSON.parse(check.stdout)).toMatchObject({
      status: "passed",
      databases: 2,
      journals: 1,
      isolatedCopyRemoved: true,
    });
    expect(await readFile(join(archive, "synthetic.audio"))).toEqual(
      Buffer.from([1, 2, 3, 4]),
    );
    const manifest = JSON.parse(
      await readFile(join(archive, "backup-manifest.json"), "utf8"),
    );
    expect(
      manifest.files.some(
        (file: { path: string }) =>
          file.path === "matching/synthetic-job/result.json",
      ),
    ).toBe(true);
    for (const file of manifest.files)
      expect((await stat(join(archive, file.path))).mode & 0o777).toBe(0o600);
    expect((await stat(archive)).mode & 0o777).toBe(0o700);
    const held = await lockfile.lock(data, { retries: 0 });
    try {
      expect(
        command(
          "backup.mjs",
          "--source",
          data,
          "--target",
          join(f.root, "locked-backup"),
        ).status,
      ).toBe(1);
    } finally {
      await held();
    }
    expect(
      command("backup.mjs", "--source", data, "--target", join(data, "nested"))
        .status,
    ).toBe(1);
    expect(await readdir(data)).not.toContain("nested");
    expect(
      command("backup.mjs", "--source", data, "--target", archive).status,
    ).toBe(1);
    const original = await readFile(join(archive, "synthetic.audio"));
    await writeFile(join(archive, "synthetic.audio"), Buffer.from([9]));
    expect(command("restore-check.mjs", "--backup", archive).status).toBe(1);
    await writeFile(join(archive, "synthetic.audio"), original);
    const databaseFile = join(archive, "sessions.sqlite");
    await writeFile(databaseFile, Buffer.from("not a SQLite database"));
    const entry = manifest.files.find(
      (file: { path: string }) => file.path === "sessions.sqlite",
    );
    const broken = await readFile(databaseFile);
    entry.bytes = broken.length;
    entry.sha256 = checksum(broken);
    await writeFile(
      join(archive, "backup-manifest.json"),
      JSON.stringify(manifest),
    );
    expect(command("restore-check.mjs", "--backup", archive).status).toBe(1);
  } finally {
    store.close();
  }
});

it("supports the original append-only schema and removes incomplete targets after validation failure", async () => {
  const f = await fixture();
  let legacy = new ParticipationStore(
    join(f.source, "participation.sqlite"),
    f.runId,
  );
  legacy.db.exec(
    "DROP TABLE revision_heads; DROP TABLE revisions; PRAGMA user_version=1;",
  );
  legacy.close();
  const imported = await importLegacySession({
    source: f.source,
    target: join(f.root, "v1-import"),
  });
  const store = new SessionStore(join(f.root, "v1-import", "sessions.sqlite"));
  try {
    expect(store.current(f.other.id, imported.roundId)?.text).toBe(
      "An append-only thought.",
    );
  } finally {
    store.close();
  }
  const large = await fixture();
  legacy = new ParticipationStore(
    join(large.source, "participation.sqlite"),
    large.runId,
  );
  legacy.revise(large.person.id, 3, "x".repeat(12001));
  legacy.close();
  const before = await sourceBytes(large.source),
    target = join(large.root, "invalid");
  await expect(
    importLegacySession({ source: large.source, target }),
  ).rejects.toThrow();
  expect(await sourceBytes(large.source)).toEqual(before);
  await expect(stat(target)).rejects.toMatchObject({ code: "ENOENT" });
});

it("rejects manifest traversal, linked output paths and invalid journals without changing source data", async () => {
  const f = await fixture(),
    data = join(f.root, "data"),
    archive = join(f.root, "archive");
  const imported = await importLegacySession({
    source: f.source,
    target: data,
  });
  const alias = join(f.root, "data-alias");
  await symlink(data, alias, "dir");
  expect(
    command("backup.mjs", "--source", data, "--target", join(alias, "inside"))
      .status,
  ).toBe(1);
  expect(await readdir(data)).not.toContain("inside");
  expect(
    command("backup.mjs", "--source", data, "--target", archive).status,
  ).toBe(0);
  const manifestPath = join(archive, "backup-manifest.json");
  const raw = await readFile(manifestPath, "utf8"),
    manifest = JSON.parse(raw);
  const originalEntry = manifest.files[0].path;
  manifest.files[0].path = "../outside";
  await writeFile(manifestPath, JSON.stringify(manifest));
  expect(command("restore-check.mjs", "--backup", archive).status).toBe(1);
  manifest.files[0].path = originalEntry;
  await writeFile(manifestPath, raw);
  expect(command("restore-check.mjs", "--backup", archive).status).toBe(0);
  const journalPath = `voice-${imported.voiceRunId}.jsonl`;
  const originalJournal = await readFile(join(data, journalPath));
  await writeFile(join(archive, journalPath), "{}\n");
  const entry = manifest.files.find(
    (file: { path: string }) => file.path === journalPath,
  );
  entry.bytes = 3;
  entry.sha256 = checksum(Buffer.from("{}\n"));
  await writeFile(manifestPath, JSON.stringify(manifest));
  expect(command("restore-check.mjs", "--backup", archive).status).toBe(1);
  expect(await readFile(join(data, journalPath))).toEqual(originalJournal);
  const link = join(data, "outside-link");
  await symlink(f.source, link, "dir");
  expect(
    command(
      "backup.mjs",
      "--source",
      data,
      "--target",
      join(f.root, "linked-source"),
    ).status,
  ).toBe(1);
});
