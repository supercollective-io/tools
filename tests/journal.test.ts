import {
  type FileHandle,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { type JournalEvent, journalFor } from "../src/journal.ts";

const bodySchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("opened") }),
  z.strictObject({
    type: z.literal("added"),
    value: z.string(),
    priorCount: z.number().int().nonnegative(),
  }),
]);
type Body = z.infer<typeof bodySchema>;

function rebuild(records: JournalEvent<Body>[]) {
  if (records[0]?.event.type !== "opened")
    throw new Error("Opening event required.");
  const values: string[] = [];
  for (const record of records.slice(1)) {
    if (
      record.event.type !== "added" ||
      record.event.priorCount !== values.length
    )
      throw new Error("Value is out of order.");
    values.push(record.event.value);
  }
  return values;
}

const Journal = journalFor(bodySchema, rebuild, () => []);
type Journal = Awaited<ReturnType<typeof Journal.create>>;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("shared locked journal", () => {
  let directory: string;
  let activeLogs: Journal[];

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "collective-microphone-journal-"));
    activeLogs = [];
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(activeLogs.map((log) => log.close()));
    await rm(directory, { recursive: true, force: true });
  });

  async function createLog() {
    const log = await Journal.create(join(directory, "run.jsonl"), {
      type: "opened",
    });
    activeLogs.push(log);
    return log;
  }

  async function fileHandlePrototype(): Promise<FileHandle> {
    const handle = await open(join(directory, "probe"), "w");
    const prototype = Object.getPrototypeOf(handle) as FileHandle;
    await handle.close();
    return prototype;
  }

  it("serialises concurrent append validation and durable writes in invocation order", async () => {
    const log = await createLog();
    const expected = Array.from({ length: 20 }, (_, index) => `value-${index}`);
    await Promise.all(
      expected.map((value, priorCount) =>
        log.append({ type: "added", value, priorCount }),
      ),
    );
    expect(log.state).toEqual(expected);
    const persisted = await Journal.read(log.path);
    expect(persisted.state).toEqual(expected);
    expect(persisted.events.map((record) => record.sequence)).toEqual(
      Array.from({ length: 21 }, (_, index) => index + 1),
    );
    expect(new Set(persisted.events.map((record) => record.runId)).size).toBe(
      1,
    );
  });

  it("waits for already queued writes before closing and rejects new appends", async () => {
    const log = await createLog();
    const prototype = await fileHandlePrototype();
    const write = prototype.writeFile;
    const entered = deferred();
    const release = deferred();
    vi.spyOn(prototype, "writeFile").mockImplementationOnce(async function (
      this: FileHandle,
      ...args: Parameters<FileHandle["writeFile"]>
    ) {
      entered.resolve();
      await release.promise;
      return write.apply(this, args);
    });
    const first = log.append({ type: "added", value: "first", priorCount: 0 });
    const second = log.append({
      type: "added",
      value: "second",
      priorCount: 1,
    });
    let closed = false;
    const closing = log.close().then(() => {
      closed = true;
    });
    await entered.promise;
    expect(closed).toBe(false);
    await expect(
      log.append({ type: "added", value: "late", priorCount: 2 }),
    ).rejects.toThrow("closed");
    release.resolve();
    await Promise.all([first, second, closing]);
    expect((await Journal.read(log.path)).state).toEqual(["first", "second"]);
    const resumed = await Journal.resume(log.path);
    activeLogs.push(resumed);
    expect(resumed.state).toEqual(["first", "second"]);
  });

  it("does not poison the journal when validation rejects an event before writing", async () => {
    const log = await createLog();
    const original = await readFile(log.path);
    await expect(
      log.append({ type: "added", value: "invalid", priorCount: 1 }),
    ).rejects.toThrow("out of order");
    expect(await readFile(log.path)).toEqual(original);
    await log.append({ type: "added", value: "valid", priorCount: 0 });
    expect((await Journal.read(log.path)).state).toEqual(["valid"]);
  });

  it("poisons queued and later appends after a torn write until resume recovers its prefix", async () => {
    const log = await createLog();
    const original = await readFile(log.path);
    const prototype = await fileHandlePrototype();
    const failure = new Error("Disk write failed.");
    const partial = '{"schemaVersion":1,"event":';
    const write = vi
      .spyOn(prototype, "writeFile")
      .mockImplementationOnce(async function (this: FileHandle) {
        await this.write(partial);
        throw failure;
      });
    const results = await Promise.allSettled([
      log.append({ type: "added", value: "torn", priorCount: 0 }),
      log.append({ type: "added", value: "queued", priorCount: 0 }),
    ]);
    expect(results).toEqual([
      { status: "rejected", reason: failure },
      { status: "rejected", reason: failure },
    ]);
    await expect(
      log.append({ type: "added", value: "later", priorCount: 0 }),
    ).rejects.toBe(failure);
    expect(write).toHaveBeenCalledTimes(1);
    expect(log.state).toEqual([]);
    expect(await readFile(log.path)).toEqual(
      Buffer.concat([original, Buffer.from(partial)]),
    );
    await log.close();
    write.mockRestore();
    const resumed = await Journal.resume(log.path);
    activeLogs.push(resumed);
    const backup = (await readdir(directory)).find((name) =>
      name.startsWith("run.jsonl.interrupted-"),
    );
    expect(backup).toBeDefined();
    expect(await readFile(join(directory, backup ?? "missing"), "utf8")).toBe(
      partial,
    );
    await resumed.append({ type: "added", value: "recovered", priorCount: 0 });
    expect((await Journal.read(log.path)).state).toEqual(["recovered"]);
  });

  it("poisons appends after a sync failure even when the written record is complete", async () => {
    const log = await createLog();
    const prototype = await fileHandlePrototype();
    const failure = new Error("Disk sync failed.");
    const sync = vi.spyOn(prototype, "sync").mockRejectedValueOnce(failure);
    await expect(
      log.append({ type: "added", value: "written", priorCount: 0 }),
    ).rejects.toBe(failure);
    await expect(
      log.append({ type: "added", value: "later", priorCount: 0 }),
    ).rejects.toBe(failure);
    expect(log.state).toEqual([]);
    expect((await Journal.read(log.path)).state).toEqual(["written"]);
    await log.close();
    sync.mockRestore();
    const resumed = await Journal.resume(log.path);
    activeLogs.push(resumed);
    await resumed.append({
      type: "added",
      value: "after-resume",
      priorCount: 1,
    });
    expect(resumed.state).toEqual(["written", "after-resume"]);
  });

  it("keeps incremental state private and unchanged after invalid or failed writes", async () => {
    const Incremental = journalFor(
      bodySchema,
      rebuild,
      () => [],
      (state, record) => {
        if (record.event.type !== "added") throw new Error("Invalid event");
        state.push(record.event.value);
        if (record.event.priorCount !== state.length - 1)
          throw new Error("Invalid count");
        return state;
      },
    );
    const log = await Incremental.create(join(directory, "incremental.jsonl"), {
      type: "opened",
    });
    activeLogs.push(log);
    await log.append({ type: "added", value: "saved", priorCount: 0 });
    log.state.push("external mutation");
    await expect(
      log.append({ type: "added", value: "invalid", priorCount: 9 }),
    ).rejects.toThrow("Invalid count");
    expect(log.state).toEqual(["saved"]);
    const prototype = await fileHandlePrototype();
    vi.spyOn(prototype, "sync").mockRejectedValueOnce(new Error("sync failed"));
    await expect(
      log.append({ type: "added", value: "uncertain", priorCount: 1 }),
    ).rejects.toThrow("sync failed");
    expect(log.state).toEqual(["saved"]);
    await expect(
      log.append({ type: "added", value: "later", priorCount: 1 }),
    ).rejects.toThrow("sync failed");
    await log.close();
    const resumed = await Incremental.resume(log.path);
    activeLogs.push(resumed);
    expect(resumed.state).toEqual((await Incremental.read(log.path)).state);
    await resumed.append({
      type: "added",
      value: "after resume",
      priorCount: resumed.state.length,
    });
    expect(resumed.state).toEqual((await Incremental.read(log.path)).state);
  });

  it("checks envelope ordering independently of the domain reducer", async () => {
    const log = await createLog();
    await log.append({ type: "added", value: "valid", priorCount: 0 });
    await log.close();
    const data = (await readFile(log.path, "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    const last = data.at(-1);
    if (!last) throw new Error("Missing persisted event.");
    last.sequence = 7;
    await writeFile(
      log.path,
      `${data.map((record) => JSON.stringify(record)).join("\n")}\n`,
    );
    await expect(Journal.read(log.path)).rejects.toThrow(
      "inconsistent ordering or identity",
    );
  });
});
