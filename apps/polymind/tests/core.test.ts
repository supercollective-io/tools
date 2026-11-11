import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPrompt, contributionsFor } from "../src/composition.ts";
import { Controller } from "../src/controller.ts";
import type { Generate, ModelResult, PromptMessage } from "../src/models.ts";
import { type EventBody, RunLog, readRun } from "../src/runs.ts";
import {
  type Config,
  configSchema,
  parse,
  type LegacyScore as Score,
  legacyScoreSchema as scoreSchema,
} from "../src/schema.ts";

function score(): Score {
  return {
    schemaVersion: 1,
    title: "Two voices",
    voices: [
      {
        id: "a",
        name: "A",
        fragments: [
          { id: "first", text: "ADMITTED_A" },
          { id: "later", text: "UNADMITTED_A" },
        ],
      },
      {
        id: "b",
        name: "B",
        fragments: [
          { id: "first", text: "ADMITTED_B" },
          { id: "unused", text: "NEVER_ADMITTED_B" },
        ],
      },
    ],
    batches: [
      { id: "opening", fragments: [{ voiceId: "a", fragmentId: "first" }] },
      {
        id: "response",
        fragments: [
          { voiceId: "b", fragmentId: "first" },
          { voiceId: "a", fragmentId: "later" },
        ],
      },
    ],
  };
}

function config(): Config {
  return {
    schemaVersion: 1,
    composer: {
      provider: "ollama",
      model: "test-composer",
      maxOutputTokens: 100,
      timeoutMs: 1_000,
    },
    instructions: "Compose a collective passage.",
    history: { maxPassages: 2, maxCharacters: 100 },
  };
}

function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected a fixture item.");
  return value;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function sourceFrom(messages: PromptMessage[]) {
  const user = messages.find((message) => message.role === "user");
  if (!user) throw new Error("Missing user source message.");
  return JSON.parse(user.content);
}

let directory: string;
let activeLogs: RunLog[];
let nextPath: number;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "collective-microphone-core-"));
  activeLogs = [];
  nextPath = 0;
});

afterEach(async () => {
  await Promise.all(activeLogs.map((log) => log.close()));
  await rm(directory, { recursive: true, force: true });
});

async function createLog() {
  const path = join(directory, `run-${nextPath++}.jsonl`);
  const log = await RunLog.create(path, {
    type: "run.created",
    score: score(),
    config: config(),
  });
  activeLogs.push(log);
  return log;
}

async function closeLog(log: RunLog) {
  await log.close();
  activeLogs.splice(activeLogs.indexOf(log), 1);
}

async function resumeLog(path: string) {
  const log = await RunLog.resume(path);
  activeLogs.push(log);
  return log;
}

function record(event: EventBody, sequence: number, runId: string) {
  return {
    schemaVersion: 1,
    runId,
    sequence,
    at: "2026-11-03T12:00:00.000Z",
    event,
  };
}

async function writeEvents(
  events: EventBody[],
  mutate?: (records: ReturnType<typeof record>[]) => void,
) {
  const runId = randomUUID();
  const records = events.map((event, index) => record(event, index + 1, runId));
  mutate?.(records);
  const path = join(directory, `fixture-${nextPath++}.jsonl`);
  await writeFile(
    path,
    `${records.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
  );
  return path;
}

function opening(): EventBody {
  return { type: "run.created", score: score(), config: config() };
}

function admission(): EventBody {
  return {
    type: "batch.admitted",
    batchIndex: 0,
    contributions: contributionsFor(score(), 0, null),
  };
}

function attempt(attemptId: string): EventBody {
  return {
    type: "generation.started",
    attemptId,
    messages: buildPrompt(config(), contributionsFor(score(), 0, null), []),
  };
}

function accepted(attemptId: string, passageId = randomUUID()): EventBody {
  return {
    type: "passage.accepted",
    attemptId,
    passageId,
    text: "A passage.",
    durationMs: 1,
  };
}

describe("score and configuration validation", () => {
  it("accepts distinct voices reusing local fragment IDs", () => {
    expect(parse(scoreSchema, score(), "Score")).toEqual(score());
  });

  it.each([
    [
      "unknown voice",
      (value: Score) => {
        present(present(value.batches[0]).fragments[0]).voiceId = "missing";
      },
    ],
    [
      "unknown fragment",
      (value: Score) => {
        present(present(value.batches[0]).fragments[0]).fragmentId = "missing";
      },
    ],
    [
      "duplicate voice",
      (value: Score) => {
        value.voices.push(structuredClone(present(value.voices[0])));
      },
    ],
    [
      "duplicate local fragment",
      (value: Score) => {
        present(value.voices[0]).fragments.push(
          structuredClone(present(present(value.voices[0]).fragments[0])),
        );
      },
    ],
    [
      "duplicate batch",
      (value: Score) => {
        present(value.batches[1]).id = present(value.batches[0]).id;
      },
    ],
    [
      "repeated fragment within a batch",
      (value: Score) => {
        present(value.batches[0]).fragments.push(
          structuredClone(present(present(value.batches[0]).fragments[0])),
        );
      },
    ],
    [
      "repeated fragment across batches",
      (value: Score) => {
        present(value.batches[1]).fragments.push(
          structuredClone(present(present(value.batches[0]).fragments[0])),
        );
      },
    ],
    [
      "empty fragment",
      (value: Score) => {
        present(present(value.voices[0]).fragments[0]).text = " \n ";
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const value = score();
    mutate(value);
    expect(() => parse(scoreSchema, value, "Score")).toThrow("Score:");
  });

  it.each([
    ["placeholder model", { model: "REPLACE_MODEL" }],
    ["unknown provider", { provider: "other" }],
    [
      "credentials in base URL",
      { baseUrl: "https://user:secret@example.test" },
    ],
    ["query in base URL", { baseUrl: "https://example.test?key=secret" }],
    ["fragment in base URL", { baseUrl: "https://example.test/#key" }],
    ["non-HTTP base URL", { baseUrl: "file:///tmp/model" }],
    ["negative temperature", { temperature: -1 }],
    ["excessive temperature", { temperature: 3 }],
    ["zero output limit", { maxOutputTokens: 0 }],
    ["fractional output limit", { maxOutputTokens: 1.5 }],
    ["short timeout", { timeoutMs: 99 }],
  ])("rejects %s", (_label, composer) => {
    const value = {
      ...config(),
      composer: { ...config().composer, ...composer },
    };
    expect(() => parse(configSchema, value, "Config")).toThrow("Config:");
  });

  it.each([
    { maxPassages: -1, maxCharacters: 100 },
    { maxPassages: 1.5, maxCharacters: 100 },
    { maxPassages: 2, maxCharacters: -1 },
  ])("rejects invalid history bounds %j", (history) => {
    expect(() =>
      parse(configSchema, { ...config(), history }, "Config"),
    ).toThrow("Config:");
  });

  it("rejects unknown configuration keys", () => {
    expect(() =>
      parse(
        configSchema,
        { ...config(), apiKey: "not-a-config-field" },
        "Config",
      ),
    ).toThrow("Config:");
  });
});

describe("composition prompts", () => {
  const passages = [
    { id: "old", text: "oldest" },
    { id: "middle", text: "middle" },
    { id: "new", text: "newest" },
  ];

  it.each([
    [{ maxPassages: 2, maxCharacters: 100 }, ["middle", "new"]],
    [{ maxPassages: 3, maxCharacters: 11 }, ["new"]],
    [{ maxPassages: 3, maxCharacters: 12 }, ["middle", "new"]],
    [{ maxPassages: 0, maxCharacters: 100 }, []],
    [{ maxPassages: 3, maxCharacters: 0 }, []],
  ])("keeps chronological recent history within %j", (history, ids) => {
    const messages = buildPrompt(
      { ...config(), history },
      contributionsFor(score(), 0, null),
      passages,
    );
    expect(
      sourceFrom(messages).recentPassages.map(
        (passage: { id: string }) => passage.id,
      ),
    ).toEqual(ids);
  });

  it("includes only the explicitly admitted source fragments", () => {
    const contributions = contributionsFor(score(), 0, null);
    const messages = buildPrompt(config(), contributions, []);
    expect(sourceFrom(messages).contributions).toEqual(contributions);
    const prompt = JSON.stringify(messages);
    expect(prompt).toContain("ADMITTED_A");
    expect(prompt).not.toContain("ADMITTED_B");
    expect(prompt).not.toContain("UNADMITTED_A");
    expect(prompt).not.toContain("NEVER_ADMITTED_B");
  });
});

describe("controller progression", () => {
  it("accepts successive batches in score order and never generates after completion", async () => {
    const log = await createLog();
    const generate = vi
      .fn<Generate>()
      .mockResolvedValueOnce({
        text: "First passage",
        usage: { outputTokens: 2 },
      })
      .mockResolvedValueOnce({ text: "Second passage" });
    const controller = new Controller(log, generate);
    const signal = new AbortController().signal;
    await controller.advance(signal, vi.fn());
    expect(log.state.passages.map((passage) => passage.text)).toEqual([
      "First passage",
    ]);
    expect(log.state.complete).toBe(false);
    await controller.advance(signal, vi.fn());
    await controller.advance(signal, vi.fn());
    expect(generate).toHaveBeenCalledTimes(2);
    expect(log.state.complete).toBe(true);
    expect(log.state.passages.map((passage) => passage.batchIndex)).toEqual([
      0, 1,
    ]);
    const firstPrompt = sourceFrom(present(generate.mock.calls[0])[0].messages);
    const secondPrompt = sourceFrom(
      present(generate.mock.calls[1])[0].messages,
    );
    expect(firstPrompt.recentPassages).toEqual([]);
    expect(
      firstPrompt.contributions.map((item: { text: string }) => item.text),
    ).toEqual(["ADMITTED_A"]);
    expect(secondPrompt.recentPassages).toEqual([
      {
        id: present(log.state.passages[0]).id,
        text: "First passage",
        batchIndex: 0,
      },
    ]);
    expect(
      secondPrompt.contributions.map((item: { text: string }) => item.text),
    ).toEqual(["ADMITTED_B", "UNADMITTED_A"]);
    expect(
      secondPrompt.contributions.every(
        (item: { respondingToPassageId: string }) =>
          item.respondingToPassageId === present(log.state.passages[0]).id,
      ),
    ).toBe(true);
    expect(JSON.stringify(generate.mock.calls)).not.toContain(
      "NEVER_ADMITTED_B",
    );
    const events = (await readRun(log.path)).events.map((entry) => entry.event);
    expect(events.map((event) => event.type)).toEqual([
      "run.created",
      "batch.admitted",
      "generation.started",
      "passage.accepted",
      "batch.admitted",
      "generation.started",
      "passage.accepted",
      "run.completed",
    ]);
    expect(events[3]).toMatchObject({ usage: { outputTokens: 2 } });
    await closeLog(log);
    const resumed = await resumeLog(log.path);
    await new Controller(resumed, generate).advance(signal, vi.fn());
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("retains a failed batch and retries it without admitting it twice", async () => {
    const log = await createLog();
    const generate = vi
      .fn<Generate>()
      .mockRejectedValueOnce(
        Object.assign(new Error("upstream secret"), { status: 503 }),
      )
      .mockResolvedValueOnce({ text: "Recovered passage" });
    const controller = new Controller(log, generate);
    await expect(
      controller.advance(new AbortController().signal, vi.fn()),
    ).rejects.toThrow("HTTP 503");
    const pending = log.state.pending;
    expect(pending).toEqual(contributionsFor(score(), 0, null));
    expect(log.state.passages).toEqual([]);
    expect(log.state.attemptId).toBeNull();
    await controller.advance(new AbortController().signal, vi.fn());
    expect(log.state.admitted).toEqual([pending]);
    expect(log.state.pending).toBeNull();
    expect(present(generate.mock.calls[1])[0].messages).toEqual(
      present(generate.mock.calls[0])[0].messages,
    );
    const events = (await readRun(log.path)).events.map((entry) => entry.event);
    expect(
      events.filter((event) => event.type === "batch.admitted"),
    ).toHaveLength(1);
    expect(
      events.find((event) => event.type === "generation.failed"),
    ).toMatchObject({ reason: "failed", status: 503 });
    expect(await readFile(log.path, "utf8")).not.toContain("upstream secret");
  });

  it("rejects overlapping advances while a generation is awaiting its result", async () => {
    const log = await createLog();
    const entered = deferred<void>();
    const result = deferred<ModelResult>();
    const generate = vi.fn<Generate>(async () => {
      entered.resolve();
      return result.promise;
    });
    const controller = new Controller(log, generate);
    const first = controller.advance(new AbortController().signal, vi.fn());
    await entered.promise;
    await expect(
      controller.advance(new AbortController().signal, vi.fn()),
    ).rejects.toThrow("already running");
    result.resolve({ text: "Single passage" });
    await first;
    expect(generate).toHaveBeenCalledTimes(1);
    expect(log.state.admitted).toHaveLength(1);
    expect(log.state.passages).toHaveLength(1);
  });

  it("never accepts a late successful response after cancellation", async () => {
    const log = await createLog();
    const entered = deferred<void>();
    const result = deferred<ModelResult>();
    const generate = vi.fn<Generate>(async () => {
      entered.resolve();
      return result.promise;
    });
    const abort = new AbortController();
    const controller = new Controller(log, generate);
    const advance = controller.advance(abort.signal, vi.fn());
    const rejection = expect(advance).rejects.toThrow("interrupted");
    await entered.promise;
    abort.abort();
    result.resolve({ text: "Too late to accept" });
    await rejection;
    expect(log.state.passages).toEqual([]);
    expect(log.state.pending).toEqual(contributionsFor(score(), 0, null));
    expect(
      present((await readRun(log.path)).events.at(-1)).event,
    ).toMatchObject({
      type: "generation.failed",
      reason: "aborted",
    });
  });

  it("does not admit or generate for an already-aborted advance", async () => {
    const log = await createLog();
    const abort = new AbortController();
    abort.abort();
    const generate = vi.fn<Generate>();
    await expect(
      new Controller(log, generate).advance(abort.signal, vi.fn()),
    ).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
    expect((await readRun(log.path)).events).toHaveLength(1);
  });

  it("keeps a whitespace-only model response pending", async () => {
    const log = await createLog();
    const generate = vi.fn<Generate>().mockResolvedValue({ text: " \n " });
    await expect(
      new Controller(log, generate).advance(
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow("batch remains pending");
    expect(log.state.pending).not.toBeNull();
    expect(log.state.passages).toEqual([]);
  });
});

describe("JSONL persistence and recovery", () => {
  it("resumes a valid final record without a newline before appending", async () => {
    const log = await createLog();
    await closeLog(log);
    await writeFile(log.path, (await readFile(log.path, "utf8")).trimEnd());
    const before = await readRun(log.path);
    expect(before.tail).toHaveLength(0);
    expect(before.needsNewline).toBe(true);
    const resumed = await resumeLog(log.path);
    await new Controller(resumed, async () => ({
      text: "After resume",
    })).advance(new AbortController().signal, vi.fn());
    const after = await readRun(log.path);
    expect(present(after.state.passages[0]).text).toBe("After resume");
    expect(after.tail).toHaveLength(0);
    expect((await readFile(log.path, "utf8")).endsWith("\n")).toBe(true);
  });

  it("backs up and truncates only a partial final record", async () => {
    const log = await createLog();
    await closeLog(log);
    const original = await readFile(log.path);
    const partial = Buffer.from('{"schemaVersion":1,"unfinished":"é');
    await writeFile(log.path, Buffer.concat([original, partial]));
    const resumed = await resumeLog(log.path);
    const backups = (await readdir(directory)).filter((name) =>
      name.startsWith(`${log.path.split("/").at(-1)}.interrupted-`),
    );
    expect(backups).toHaveLength(1);
    expect(await readFile(join(directory, present(backups[0])))).toEqual(
      partial,
    );
    expect(await readFile(log.path)).toEqual(original);
    expect(resumed.state.passages).toEqual([]);
    await new Controller(resumed, async () => ({ text: "Recovered" })).advance(
      new AbortController().signal,
      vi.fn(),
    );
    expect(present((await readRun(log.path)).state.passages[0]).text).toBe(
      "Recovered",
    );
  });

  it("rejects a corrupt newline-terminated record and preserves the file", async () => {
    const log = await createLog();
    await closeLog(log);
    const contents = `${await readFile(log.path, "utf8")}{broken}\n{"partial":`;
    await writeFile(log.path, contents);
    await expect(RunLog.resume(log.path)).rejects.toThrow(
      "invalid JSON on line 2",
    );
    expect(await readFile(log.path, "utf8")).toBe(contents);
    expect(await readdir(directory)).toEqual([log.path.split("/").at(-1)]);
  });

  it("marks an interrupted attempt as failed and permits one retry of its pending batch", async () => {
    const attemptId = randomUUID();
    const path = await writeEvents([
      opening(),
      admission(),
      attempt(attemptId),
    ]);
    const resumed = await resumeLog(path);
    expect(resumed.state.attemptId).toBeNull();
    expect(resumed.state.pending).toEqual(contributionsFor(score(), 0, null));
    expect(present((await readRun(path)).events.at(-1)).event).toEqual({
      type: "generation.failed",
      attemptId,
      reason: "interrupted",
    });
    const generate = vi.fn<Generate>().mockResolvedValue({ text: "Retried" });
    await new Controller(resumed, generate).advance(
      new AbortController().signal,
      vi.fn(),
    );
    expect(resumed.state.admitted).toHaveLength(1);
    expect(resumed.state.passages).toHaveLength(1);
    expect(
      (await readRun(path)).events.filter(
        (entry) => entry.event.type === "generation.started",
      ),
    ).toHaveLength(2);
  });

  it("never overwrites an existing file when creating a run", async () => {
    const path = join(directory, "existing.jsonl");
    const original = "preserve these existing bytes";
    await writeFile(path, original);
    await expect(
      RunLog.create(path, {
        type: "run.created",
        score: score(),
        config: config(),
      }),
    ).rejects.toThrow("never overwritten");
    expect(await readFile(path, "utf8")).toBe(original);
  });

  it("rejects a concurrent resume and releases the lock on close", async () => {
    const log = await createLog();
    await expect(RunLog.resume(log.path)).rejects.toThrow(
      "locked by another process",
    );
    await closeLog(log);
    const resumed = await resumeLog(log.path);
    expect(resumed.state.runId).toBe((await readRun(log.path)).state.runId);
  });

  it.each([
    [
      "skipped sequence",
      (records: ReturnType<typeof record>[]) => {
        present(records[1]).sequence = 3;
      },
    ],
    [
      "changed run identity",
      (records: ReturnType<typeof record>[]) => {
        present(records[1]).runId = randomUUID();
      },
    ],
    [
      "duplicate sequence",
      (records: ReturnType<typeof record>[]) => {
        present(records[1]).sequence = 1;
      },
    ],
  ])("rejects %s during replay", async (_label, mutate) => {
    const path = await writeEvents([opening(), admission()], mutate);
    await expect(readRun(path)).rejects.toThrow(
      "inconsistent ordering or identity",
    );
  });

  it.each([
    ["missing opening record", () => [admission()]],
    ["second opening record", () => [opening(), opening()]],
    [
      "batch admitted out of order",
      () => [opening(), { ...admission(), batchIndex: 1 }],
    ],
    [
      "second admission while pending",
      () => [opening(), admission(), admission()],
    ],
    [
      "generation without an admitted batch",
      () => [opening(), attempt(randomUUID())],
    ],
    [
      "failure without a started attempt",
      () => [
        opening(),
        admission(),
        {
          type: "generation.failed",
          attemptId: randomUUID(),
          reason: "failed",
        },
      ],
    ],
    [
      "acceptance without a started attempt",
      () => [opening(), admission(), accepted(randomUUID())],
    ],
    ["premature completion", () => [opening(), { type: "run.completed" }]],
    [
      "completion while pending",
      () => [opening(), admission(), { type: "run.completed" }],
    ],
  ] satisfies [string, () => EventBody[]][])(
    "rejects impossible transition: %s",
    async (_label, events) => {
      await expect(readRun(await writeEvents(events()))).rejects.toThrow();
    },
  );

  it("rejects altered admitted source text", async () => {
    const contributions = contributionsFor(score(), 0, null);
    present(contributions[0]).text = "Injected source";
    const path = await writeEvents([
      opening(),
      { type: "batch.admitted", batchIndex: 0, contributions },
    ]);
    await expect(readRun(path)).rejects.toThrow("contributions do not match");
  });

  it("rejects acceptance of an attempt that has already failed", async () => {
    const attemptId = randomUUID();
    const path = await writeEvents([
      opening(),
      admission(),
      attempt(attemptId),
      { type: "generation.failed", attemptId, reason: "failed" },
      accepted(attemptId),
    ]);
    await expect(readRun(path)).rejects.toThrow("invalid attempt");
  });

  it("rejects reusing a failed attempt identifier", async () => {
    const attemptId = randomUUID();
    const path = await writeEvents([
      opening(),
      admission(),
      attempt(attemptId),
      { type: "generation.failed", attemptId, reason: "failed" },
      attempt(attemptId),
    ]);
    await expect(readRun(path)).rejects.toThrow("invalid generation attempt");
  });

  it("rejects overlapping attempts in a persisted log", async () => {
    const path = await writeEvents([
      opening(),
      admission(),
      attempt(randomUUID()),
      attempt(randomUUID()),
    ]);
    await expect(readRun(path)).rejects.toThrow("invalid generation attempt");
  });

  it("rejects failure or acceptance for a different active attempt", async () => {
    const attemptId = randomUUID();
    const wrongAttemptId = randomUUID();
    const failurePath = await writeEvents([
      opening(),
      admission(),
      attempt(attemptId),
      {
        type: "generation.failed",
        attemptId: wrongAttemptId,
        reason: "failed",
      },
    ]);
    const acceptancePath = await writeEvents([
      opening(),
      admission(),
      attempt(attemptId),
      accepted(wrongAttemptId),
    ]);
    await expect(readRun(failurePath)).rejects.toThrow("unknown attempt");
    await expect(readRun(acceptancePath)).rejects.toThrow("invalid attempt");
  });

  it("rejects a passage identifier reused by a later batch", async () => {
    const firstAttempt = randomUUID();
    const secondAttempt = randomUUID();
    const passageId = randomUUID();
    const path = await writeEvents([
      opening(),
      admission(),
      attempt(firstAttempt),
      accepted(firstAttempt, passageId),
      {
        type: "batch.admitted",
        batchIndex: 1,
        contributions: contributionsFor(score(), 1, passageId),
      },
      attempt(secondAttempt),
      accepted(secondAttempt, passageId),
    ]);
    await expect(readRun(path)).rejects.toThrow("invalid attempt");
  });

  it("rejects a complete but invalid final JSON record without truncating it", async () => {
    const log = await createLog();
    await closeLog(log);
    const contents = `${await readFile(log.path, "utf8")}${JSON.stringify({ schemaVersion: 999 })}`;
    await writeFile(log.path, contents);
    await expect(RunLog.resume(log.path)).rejects.toThrow("Run log line 2");
    expect(await readFile(log.path, "utf8")).toBe(contents);
    expect(await readdir(directory)).toEqual([log.path.split("/").at(-1)]);
  });

  it("rejects later records after a completed run", async () => {
    const log = await createLog();
    const controller = new Controller(log, async () => ({ text: "Done" }));
    await controller.advance(new AbortController().signal, vi.fn());
    await controller.advance(new AbortController().signal, vi.fn());
    const before = await readFile(log.path, "utf8");
    await expect(log.append({ type: "run.completed" })).rejects.toThrow(
      "inconsistent ordering or identity",
    );
    expect(await readFile(log.path, "utf8")).toBe(before);
  });
});
