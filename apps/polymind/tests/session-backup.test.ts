import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
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
import { LiveLog } from "../src/live-runs.ts";
import { liveConfigSchema } from "../src/live-schema.ts";
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
  const directory = await mkdtemp(join(tmpdir(), "polymind-backup-"));
  directories.push(directory);
  return directory;
}
async function fixture() {
  const root = await temporary();
  const data = join(root, "data");
  await mkdir(data, { mode: 0o700 });
  const config = liveConfigSchema.parse(
    JSON.parse(
      await readFile(
        new URL("../examples/live-projection.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  config.live = { ...config.live, mode: "typed", score: undefined };
  const journal = join(data, "pending.jsonl");
  const log = await LiveLog.create(journal, {
    type: "live.created",
    config,
    scenario: {
      schemaVersion: 1,
      title: "Synthetic event",
      openingInvitation: "What matters?",
      voices: [],
    },
  });
  const runId = log.state.runId;
  await log.append({ type: "session.ended", elapsedMs: 0 });
  await log.close();
  await rename(journal, join(data, `voice-${runId}.jsonl`));
  const store = new SessionStore(join(data, "sessions.sqlite"));
  try {
    const session = store.createSession("Synthetic event", 140);
    const round = store.createRound(session.id, "What matters?", "continuous");
    store.db
      .prepare("INSERT INTO voice_runs VALUES (?,?,?)")
      .run(runId, session.id, round.id);
  } finally {
    store.close();
  }
  return { root, data, runId };
}
const checksum = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
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

it("backs up SQLite WAL state and private worker/audio files, then validates an isolated restore", async () => {
  const f = await fixture(),
    data = join(f.root, "data"),
    archive = join(f.root, "backup");
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
      databases: 1,
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

it("rejects manifest traversal, linked output paths and invalid journals without changing source data", async () => {
  const f = await fixture(),
    data = join(f.root, "data"),
    archive = join(f.root, "archive");
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
  const journalPath = `voice-${f.runId}.jsonl`;
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
  await symlink(f.root, link, "dir");
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
