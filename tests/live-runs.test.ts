import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isLiveRun,
  type LiveEvent,
  LiveLog,
  type LiveState,
  readLiveRun,
} from "../src/live-runs.ts";
import { type LiveConfig, liveConfigSchema } from "../src/live-schema.ts";
import { parse, type SimulationScenario } from "../src/schema.ts";

function config(): LiveConfig {
  const model = {
    provider: "ollama" as const,
    model: "test-model",
    maxOutputTokens: 100,
    timeoutMs: 1_000,
  };
  return {
    schemaVersion: 2,
    composer: model,
    instructions: "Write a collective contribution.",
    history: { maxPassages: 2, maxCharacters: 100 },
    live: {
      participants: model,
      instructions: "Develop your own contribution.",
      maxDurationMs: 10_000,
      feedbackIntervalMs: 100,
      refreshIntervalMs: 100,
      maxContextCharacters: 1_000,
    },
  };
}

function scenario(): SimulationScenario {
  return {
    schemaVersion: 1,
    title: "Live co-writing",
    openingInvitation: "What could we change together?",
    voices: [
      {
        id: "a",
        name: "A",
        perspective: "A's perspective",
        background: "A's background",
      },
      {
        id: "b",
        name: "B",
        perspective: "B's perspective",
        background: "B's background",
      },
    ],
  };
}

function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("Missing fixture item.");
  return value;
}

function actor(state: LiveState, id: string) {
  return present(
    [...state.participants, state.composer].find((writer) => writer.id === id),
  );
}

const messages = [
  { role: "user" as const, content: "A frozen request context" },
];
let directory: string;
let logs: LiveLog[];
let nextPath: number;
beforeEach(async () => {
  directory = await mkdtemp(
    join(tmpdir(), "collective-microphone-live-journal-"),
  );
  logs = [];
  nextPath = 0;
});
afterEach(async () => {
  await Promise.all(logs.map((log) => log.close()));
  await rm(directory, { recursive: true, force: true });
});

async function createLog() {
  const log = await LiveLog.create(join(directory, `run-${nextPath++}.jsonl`), {
    type: "live.created",
    scenario: scenario(),
    config: config(),
  });
  logs.push(log);
  return log;
}

async function reopen(log: LiveLog) {
  await log.close();
  logs.splice(logs.indexOf(log), 1);
  const resumed = await LiveLog.resume(log.path);
  logs.push(resumed);
  return resumed;
}

async function begin(log: LiveLog, actorId: string) {
  const attemptId = randomUUID();
  const sourceOffsets =
    actorId === "collective"
      ? Object.fromEntries(
          log.state.scenario.voices.map((voice) => [
            voice.id,
            actor(log.state, `participant/${voice.id}`).text.length,
          ]),
        )
      : {};
  await log.append({
    type: "generation.started",
    actorId,
    attemptId,
    contextVersion: log.state.collectiveVersion,
    sourceOffsets,
    messages,
  });
  return attemptId;
}

async function append(log: LiveLog, actorId: string, text: string) {
  const writer = actor(log.state, actorId);
  await log.append({
    type: "text.appended",
    actorId,
    attemptId: present(writer.active).id,
    offset: writer.text.length,
    text,
  });
}

async function finish(
  log: LiveLog,
  actorId: string,
  reason: Extract<
    LiveEvent,
    { type: "generation.finished" }
  >["reason"] = "refresh",
) {
  await log.append({
    type: "generation.finished",
    actorId,
    attemptId: present(actor(log.state, actorId).active).id,
    reason,
  });
}

async function publish(log: LiveLog) {
  await log.append({
    type: "collective.published",
    version: log.state.collectiveVersion + 1,
    offset: log.state.composer.text.length,
  });
}

async function writeRecords(records: { event: LiveEvent; at: string }[]) {
  const path = join(directory, `fixture-${nextPath++}.jsonl`);
  const runId = randomUUID();
  await writeFile(
    path,
    `${records.map(({ event, at }, index) => JSON.stringify({ schemaVersion: 1, runId, sequence: index + 1, at, event })).join("\n")}\n`,
  );
  return path;
}

describe("live configuration", () => {
  it("accepts version 2 with distinct participant settings", () => {
    const value = config();
    value.live.participants = {
      ...value.live.participants,
      model: "participant-model",
      maxOutputTokens: 80,
    };
    expect(parse(liveConfigSchema, value, "Config")).toEqual(value);
  });

  it.each([
    ["maxDurationMs", 999],
    ["maxDurationMs", 3_600_001],
    ["feedbackIntervalMs", 99],
    ["feedbackIntervalMs", 60_001],
    ["refreshIntervalMs", 99],
    ["refreshIntervalMs", 60_001],
    ["maxContextCharacters", 999],
    ["maxContextCharacters", 1_000_001],
    ["refreshIntervalMs", 100.5],
  ] as const)("rejects %s=%s", (key, value) => {
    const input = config();
    input.live[key] = value;
    expect(() => parse(liveConfigSchema, input, "Config")).toThrow("Config:");
  });

  it("rejects old schema versions, turn limits, concurrency and blank instructions", () => {
    expect(() =>
      parse(liveConfigSchema, { ...config(), schemaVersion: 1 }, "Config"),
    ).toThrow();
    expect(() =>
      parse(
        liveConfigSchema,
        { ...config(), live: { ...config().live, maxTurns: 3 } },
        "Config",
      ),
    ).toThrow();
    expect(() =>
      parse(
        liveConfigSchema,
        { ...config(), live: { ...config().live, concurrency: 2 } },
        "Config",
      ),
    ).toThrow();
    expect(() =>
      parse(
        liveConfigSchema,
        { ...config(), live: { ...config().live, instructions: " \n " } },
        "Config",
      ),
    ).toThrow();
  });
});

describe("one growing contribution per writer", () => {
  it("supports valid participant IDs that coincide with object prototype property names", async () => {
    const people = scenario();
    present(people.voices[0]).id = "constructor";
    present(people.voices[1]).id = "__proto__";
    const log = await LiveLog.create(join(directory, "prototype-ids.jsonl"), {
      type: "live.created",
      scenario: people,
      config: config(),
    });
    logs.push(log);
    await log.append({ type: "session.started" });
    await begin(log, "participant/constructor");
    await append(log, "participant/constructor", "First");
    await begin(log, "participant/__proto__");
    await append(log, "participant/__proto__", "Second");
    await begin(log, "collective");
    expect(
      Object.keys(present(log.state.composer.active).sourceOffsets),
    ).toEqual(["constructor", "__proto__"]);
    expect(Object.entries(log.state.composer.seenOffsets)).toEqual([
      ["constructor", 5],
      ["__proto__", 6],
    ]);
    expect((await readLiveRun(log.path)).state).toEqual(log.state);
  });

  it("creates a fixed set of empty writers and retains their text across request refreshes", async () => {
    const log = await createLog();
    expect(log.state.status).toBe("ready");
    expect(log.state.participants.map((writer) => writer.id)).toEqual([
      "participant/a",
      "participant/b",
    ]);
    expect(log.state.composer.id).toBe("collective");
    expect(
      log.state.participants.every(
        (writer) => writer.lastFinishReason === null,
      ),
    ).toBe(true);
    expect(log.state.composer.lastFinishReason).toBeNull();
    await log.append({ type: "session.started" });
    await begin(log, "participant/a");
    await append(log, "participant/a", "An unfinished ");
    await finish(log, "participant/a");
    await begin(log, "participant/a");
    await append(log, "participant/a", "thought.");
    await finish(log, "participant/a", "eos");
    expect(actor(log.state, "participant/a").text).toBe(
      "An unfinished thought.",
    );
    expect(actor(log.state, "participant/a").lastFinishReason).toBe("eos");
    expect(log.state.participants).toHaveLength(2);
    expect((await readLiveRun(log.path)).state).toEqual(log.state);
  });

  it("uses exact UTF-16 offsets and preserves Unicode and whitespace", async () => {
    const log = await createLog();
    await log.append({ type: "session.started" });
    const attemptId = await begin(log, "participant/a");
    await append(log, "participant/a", "😀");
    await expect(
      log.append({
        type: "text.appended",
        actorId: "participant/a",
        attemptId,
        offset: 1,
        text: "x",
      }),
    ).rejects.toThrow();
    await append(log, "participant/a", " e\u0301\n ");
    expect(actor(log.state, "participant/a").text).toBe("😀 e\u0301\n ");
    expect(actor(log.state, "participant/a").text.length).toBe(7);
    await expect(append(log, "participant/a", "\uD83D")).rejects.toThrow();
    await expect(append(log, "participant/a", "\uDE00")).rejects.toThrow();
    await expect(append(log, "participant/a", "")).rejects.toThrow();
  });

  it("freezes composer source offsets for all participants while other writers keep growing", async () => {
    const log = await createLog();
    await log.append({ type: "session.started" });
    await begin(log, "participant/a");
    await append(log, "participant/a", "😀");
    await begin(log, "collective");
    expect(present(log.state.composer.active).sourceOffsets).toEqual({
      a: 2,
      b: 0,
    });
    await append(log, "participant/a", "later");
    await begin(log, "participant/b");
    await append(log, "participant/b", "another");
    expect(log.state.composer.seenOffsets).toEqual({ a: 2, b: 0 });
    expect(present(log.state.composer.active).sourceOffsets).toEqual({
      a: 2,
      b: 0,
    });
    expect(
      log.state.participants.every(
        (writer) => Object.keys(writer.seenOffsets).length === 0,
      ),
    ).toBe(true);
  });

  it("rejects future, missing or extraneous composer source offsets and private participant source offsets", async () => {
    const log = await createLog();
    await log.append({ type: "session.started" });
    const base: Extract<LiveEvent, { type: "generation.started" }> = {
      type: "generation.started",
      actorId: "collective",
      attemptId: randomUUID(),
      contextVersion: 0,
      sourceOffsets: {},
      messages,
    };
    const invalidOffsets: Record<string, number>[] = [
      { a: 1, b: 0 },
      { a: 0 },
      { a: 0, b: 0, c: 0 },
    ];
    for (const sourceOffsets of invalidOffsets)
      await expect(log.append({ ...base, sourceOffsets })).rejects.toThrow();
    await expect(
      log.append({
        ...base,
        actorId: "participant/a",
        sourceOffsets: { b: 0 },
      }),
    ).rejects.toThrow();
    expect(log.state.composer.active).toBeNull();
  });

  it("rejects duplicate requests, unknown writers, cross-writer text and inactive request IDs", async () => {
    const log = await createLog();
    await log.append({ type: "session.started" });
    const attemptId = await begin(log, "participant/a");
    await expect(begin(log, "participant/a")).rejects.toThrow();
    await expect(begin(log, "participant/unknown")).rejects.toThrow();
    await expect(
      log.append({
        type: "text.appended",
        actorId: "participant/b",
        attemptId,
        offset: 0,
        text: "Wrong writer",
      }),
    ).rejects.toThrow();
    await expect(
      log.append({
        type: "text.appended",
        actorId: "participant/a",
        attemptId: randomUUID(),
        offset: 0,
        text: "Wrong request",
      }),
    ).rejects.toThrow();
    await finish(log, "participant/a", "failed");
    await expect(
      log.append({
        type: "generation.started",
        actorId: "participant/b",
        attemptId,
        contextVersion: 0,
        sourceOffsets: {},
        messages,
      }),
    ).rejects.toThrow();
    await expect(
      log.append({
        type: "generation.finished",
        actorId: "participant/a",
        attemptId,
        reason: "failed",
      }),
    ).rejects.toThrow();
  });
});

describe("publication and latest collective context", () => {
  it("publishes only a new complete saved prefix, including midword text and text after EOF", async () => {
    const log = await createLog();
    await log.append({ type: "session.started" });
    await begin(log, "collective");
    await append(log, "collective", "A😀");
    await expect(
      log.append({ type: "collective.published", version: 1, offset: 2 }),
    ).rejects.toThrow();
    await publish(log);
    expect(log.state.collectiveVersion).toBe(1);
    expect(log.state.publishedOffset).toBe(3);
    await expect(publish(log)).rejects.toThrow();
    await append(log, "collective", " grow");
    await finish(log, "collective", "eos");
    await publish(log);
    expect(log.state.collectiveVersion).toBe(2);
    expect(log.state.publishedOffset).toBe(log.state.composer.text.length);
    expect(log.state.publishedAt).not.toBeNull();
  });

  it("does not publish a blank-only contribution but allows whitespace after an existing thought", async () => {
    const log = await createLog();
    await log.append({ type: "session.started" });
    await begin(log, "collective");
    await append(log, "collective", " \n ");
    await expect(publish(log)).rejects.toThrow();
    await append(log, "collective", "A thought");
    await publish(log);
    await append(log, "collective", " ");
    await publish(log);
    expect(log.state.collectiveVersion).toBe(2);
  });

  it("requires the latest published version at request start without changing an already-active context", async () => {
    const log = await createLog();
    await log.append({ type: "session.started" });
    await begin(log, "participant/a");
    await begin(log, "collective");
    await append(log, "collective", "A new thought");
    await publish(log);
    expect(
      present(actor(log.state, "participant/a").active).contextVersion,
    ).toBe(0);
    await expect(
      log.append({
        type: "generation.started",
        actorId: "participant/b",
        attemptId: randomUUID(),
        contextVersion: 0,
        sourceOffsets: {},
        messages,
      }),
    ).rejects.toThrow();
    await begin(log, "participant/b");
    expect(actor(log.state, "participant/b").lastContextVersion).toBe(1);
    await finish(log, "collective");
    await expect(
      log.append({
        type: "generation.started",
        actorId: "collective",
        attemptId: randomUUID(),
        contextVersion: 2,
        sourceOffsets: { a: 0, b: 0 },
        messages,
      }),
    ).rejects.toThrow();
  });
});

describe("session lifecycle and interruption recovery", () => {
  it("requires requests to finish before pause/end and preserves all text across resume", async () => {
    const log = await createLog();
    await expect(begin(log, "participant/a")).rejects.toThrow();
    await log.append({ type: "session.started" });
    await expect(log.append({ type: "session.started" })).rejects.toThrow();
    await begin(log, "participant/a");
    await append(log, "participant/a", "Saved prefix");
    await expect(
      log.append({ type: "session.paused", elapsedMs: 100, reason: "user" }),
    ).rejects.toThrow();
    await expect(
      log.append({ type: "session.ended", elapsedMs: 100 }),
    ).rejects.toThrow();
    await finish(log, "participant/a", "paused");
    await log.append({
      type: "session.paused",
      elapsedMs: 100,
      reason: "user",
    });
    expect(log.state.sessionStartedAt).toBeNull();
    await expect(begin(log, "participant/a")).rejects.toThrow();
    const resumed = await reopen(log);
    expect(resumed.state.status).toBe("paused");
    expect(resumed.state.elapsedMs).toBe(100);
    await resumed.append({ type: "session.started" });
    await begin(resumed, "participant/a");
    await append(resumed, "participant/a", " and continuation");
    await finish(resumed, "participant/a", "ended");
    await expect(
      resumed.append({ type: "session.ended", elapsedMs: 99 }),
    ).rejects.toThrow();
    await resumed.append({ type: "session.ended", elapsedMs: 200 });
    expect(actor(resumed.state, "participant/a").text).toBe(
      "Saved prefix and continuation",
    );
    await expect(resumed.append({ type: "session.started" })).rejects.toThrow();
  });

  it("recovers active requests and elapsed time through the last durable event, excluding crash downtime", async () => {
    const a = randomUUID();
    const composer = randomUUID();
    const at = (second: number) =>
      `2026-11-03T12:00:${String(second).padStart(2, "0")}.000Z`;
    const path = await writeRecords([
      {
        at: at(0),
        event: { type: "live.created", scenario: scenario(), config: config() },
      },
      { at: at(1), event: { type: "session.started" } },
      {
        at: at(2),
        event: {
          type: "generation.started",
          actorId: "participant/a",
          attemptId: a,
          contextVersion: 0,
          sourceOffsets: {},
          messages,
        },
      },
      {
        at: at(3),
        event: {
          type: "text.appended",
          actorId: "participant/a",
          attemptId: a,
          offset: 0,
          text: "Saved prefix",
        },
      },
      {
        at: at(4),
        event: {
          type: "generation.started",
          actorId: "collective",
          attemptId: composer,
          contextVersion: 0,
          sourceOffsets: { a: 12, b: 0 },
          messages,
        },
      },
      {
        at: at(5),
        event: {
          type: "text.appended",
          actorId: "collective",
          attemptId: composer,
          offset: 0,
          text: "A shared thought",
        },
      },
    ]);
    const read = await readLiveRun(path);
    expect(read.state.status).toBe("running");
    expect(read.state.elapsedMs).toBe(0);
    expect(read.state.updatedAt).toBe(at(5));
    expect(present(actor(read.state, "participant/a").active)).toMatchObject({
      startedAt: at(2),
      firstTokenAt: at(3),
    });
    const log = await LiveLog.resume(path);
    logs.push(log);
    expect(log.state.status).toBe("paused");
    expect(log.state.elapsedMs).toBe(4_000);
    expect(log.state.pauseReason).toBe("interrupted");
    expect(log.state.sessionStartedAt).toBeNull();
    expect(
      log.state.participants.every((writer) => writer.active === null),
    ).toBe(true);
    expect(log.state.composer.active).toBeNull();
    expect(log.state.composer.text).toBe("A shared thought");
    expect(actor(log.state, "participant/a").lastFinishReason).toBe(
      "interrupted",
    );
    expect(actor(log.state, "participant/b").lastFinishReason).toBeNull();
    expect(log.state.composer.lastFinishReason).toBe("interrupted");
    expect(log.state.collectiveVersion).toBe(0);
    expect((await readLiveRun(path)).events.at(-1)?.event).toEqual({
      type: "session.recovered",
      elapsedMs: 4_000,
    });
    const resumed = await reopen(log);
    expect(resumed.state.elapsedMs).toBe(4_000);
    await resumed.close();
    logs.splice(logs.indexOf(resumed), 1);
    // Simulate another crash part-way through the single recovery record.
    const lines = (await readFile(path, "utf8")).trimEnd().split("\n");
    const recovery = present(lines.pop());
    await writeFile(
      path,
      `${lines.join("\n")}\n${recovery.slice(0, Math.floor(recovery.length / 2))}`,
    );
    const recoveredAgain = await LiveLog.resume(path);
    logs.push(recoveredAgain);
    expect(recoveredAgain.state.elapsedMs).toBe(4_000);
    expect(recoveredAgain.state.status).toBe("paused");
    expect(recoveredAgain.state.composer.text).toBe("A shared thought");
    expect(
      recoveredAgain.state.participants.every(
        (writer) => writer.active === null,
      ),
    ).toBe(true);
  });

  it("adds only the latest running interval to a previously paused elapsed baseline", async () => {
    const at = (second: number) =>
      `2026-11-03T12:00:${String(second).padStart(2, "0")}.000Z`;
    const path = await writeRecords([
      {
        at: at(0),
        event: { type: "live.created", scenario: scenario(), config: config() },
      },
      { at: at(1), event: { type: "session.started" } },
      {
        at: at(3),
        event: { type: "session.paused", elapsedMs: 2_000, reason: "user" },
      },
      { at: at(20), event: { type: "session.started" } },
      {
        at: at(23),
        event: {
          type: "generation.started",
          actorId: "participant/a",
          attemptId: randomUUID(),
          contextVersion: 0,
          sourceOffsets: {},
          messages,
        },
      },
    ]);
    const log = await LiveLog.resume(path);
    logs.push(log);
    expect(log.state.elapsedMs).toBe(5_000);
  });

  it("identifies live logs and preserves read-only replay without recovery writes", async () => {
    const log = await createLog();
    await log.append({ type: "session.started" });
    await begin(log, "participant/a");
    const before = await readFile(log.path);
    expect(await isLiveRun(log.path)).toBe(true);
    expect((await readLiveRun(log.path)).state.status).toBe("running");
    expect(await readFile(log.path)).toEqual(before);
    expect(await isLiveRun(join(directory, "missing"))).toBe(false);
  });
});
