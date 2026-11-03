import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPrompt,
  contributionsFor,
  percentageRanges,
  stepCount,
} from "../src/composition.ts";
import { Controller } from "../src/controller.ts";
import type { Generate, PromptMessage } from "../src/models.ts";
import { RunLog, readRun } from "../src/runs.ts";
import {
  type Config,
  type ContinuousScore,
  parse,
  scoreSchema,
} from "../src/schema.ts";

function score(): ContinuousScore {
  return {
    schemaVersion: 2,
    title: "Parallel prerecorded voices",
    chunkPercent: 30,
    voices: [
      { id: "a", name: "A", text: "abcde" },
      { id: "b", name: "B", text: "12345678901" },
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
    instructions: "Compose from the current source slices.",
    history: { maxPassages: 1, maxCharacters: 100 },
  };
}

function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected a fixture item.");
  return value;
}

function sourceFrom(messages: PromptMessage[]) {
  const message = messages.find((item) => item.role === "user");
  if (!message) throw new Error("Missing user source message.");
  return JSON.parse(message.content);
}

function texts(value: ContinuousScore, index: number) {
  return contributionsFor(value, index, "an-earlier-collective-passage").map(
    (contribution) => contribution.text,
  );
}

let directory: string;
let activeLogs: RunLog[];
let nextPath: number;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "collective-microphone-slices-"));
  activeLogs = [];
  nextPath = 0;
});

afterEach(async () => {
  await Promise.all(activeLogs.map((log) => log.close()));
  await rm(directory, { recursive: true, force: true });
});

async function createLog(value = score(), stepLimit?: number) {
  const path = join(directory, `run-${nextPath++}.jsonl`);
  const log = await RunLog.create(path, {
    type: "run.created",
    score: value,
    config: config(),
    ...(stepLimit === undefined ? {} : { stepLimit }),
  });
  activeLogs.push(log);
  return log;
}

async function closeLog(log: RunLog) {
  await log.close();
  activeLogs.splice(activeLogs.indexOf(log), 1);
}

describe("continuous score validation", () => {
  it("accepts version 2 source text without trimming its whitespace", () => {
    const value = score();
    present(value.voices[0]).text = " \n A😀e\u0301\t ";
    expect(parse(scoreSchema, value, "Score")).toEqual(value);
  });

  it.each([0, -1, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid chunk percentage %s",
    (chunkPercent) => {
      expect(() =>
        parse(scoreSchema, { ...score(), chunkPercent }, "Score"),
      ).toThrow("Score:");
    },
  );

  it.each([1, 33, 100])(
    "accepts integer chunk percentage %i",
    (chunkPercent) => {
      expect(() =>
        parse(scoreSchema, { ...score(), chunkPercent }, "Score"),
      ).not.toThrow();
    },
  );

  it("rejects duplicate voice IDs", () => {
    const value = score();
    present(value.voices[1]).id = present(value.voices[0]).id;
    expect(() => parse(scoreSchema, value, "Score")).toThrow("Score:");
  });

  it.each(["", " \n\t "])("rejects blank full source text %j", (text) => {
    const value = score();
    present(value.voices[0]).text = text;
    expect(() => parse(scoreSchema, value, "Score")).toThrow("Score:");
  });

  it("rejects a version 2 score containing legacy batch fields", () => {
    expect(() =>
      parse(scoreSchema, { ...score(), batches: [] }, "Score"),
    ).toThrow("Score:");
  });
});

describe("mathematical percentage cuts", () => {
  it("cuts different text lengths independently, including midword and the final remainder", () => {
    const value = score();
    expect(percentageRanges(value)).toEqual([
      { from: 0, to: 30 },
      { from: 30, to: 60 },
      { from: 60, to: 90 },
      { from: 90, to: 100 },
    ]);
    expect(stepCount(value)).toBe(4);
    expect([0, 1, 2, 3].map((index) => texts(value, index))).toEqual([
      ["a", "123"],
      ["bc", "456"],
      ["d", "789"],
      ["e", "01"],
    ]);
  });

  it("keeps a one-per-cent final interval when chunkPercent is 33", () => {
    const value = {
      ...score(),
      chunkPercent: 33,
      voices: [{ id: "a", name: "A", text: "abcdefghij" }],
    };
    expect(percentageRanges(value)).toEqual([
      { from: 0, to: 33 },
      { from: 33, to: 66 },
      { from: 66, to: 99 },
      { from: 99, to: 100 },
    ]);
    expect([0, 1, 2, 3].map((index) => texts(value, index))).toEqual([
      ["abc"],
      ["def"],
      ["ghi"],
      ["j"],
    ]);
  });

  it("counts Unicode codepoints, preserves whitespace, and permits splitting a combining sequence", () => {
    const value = {
      ...score(),
      chunkPercent: 25,
      voices: [
        { id: "a", name: "A", text: " A😀e\u0301\nZ " },
        { id: "b", name: "B", text: " \tB\n" },
      ],
    };
    expect([0, 1, 2, 3].map((index) => texts(value, index))).toEqual([
      [" A", " "],
      ["😀e", "\t"],
      ["\u0301\n", "B"],
      ["Z ", "\n"],
    ]);
    for (const [voiceIndex, voice] of value.voices.entries()) {
      expect(
        [0, 1, 2, 3].map((index) => texts(value, index)[voiceIndex]).join(""),
      ).toBe(voice.text);
    }
  });

  it("skips only globally empty intervals while retaining every voice in each remaining step", () => {
    const value = {
      ...score(),
      chunkPercent: 10,
      voices: [
        { id: "a", name: "A", text: "A" },
        { id: "b", name: "B", text: "bc" },
      ],
    };
    expect(percentageRanges(value)).toEqual([
      { from: 40, to: 50 },
      { from: 90, to: 100 },
    ]);
    expect(stepCount(value)).toBe(2);
    expect(texts(value, 0)).toEqual(["", "b"]);
    expect(texts(value, 1)).toEqual(["A", "c"]);
    expect(
      contributionsFor(value, 0, null).map((item) => item.participantId),
    ).toEqual(["a", "b"]);
  });

  it("admits the complete text of every voice when chunkPercent is 100", () => {
    const value = { ...score(), chunkPercent: 100 };
    expect(stepCount(value)).toBe(1);
    expect(texts(value, 0)).toEqual(["abcde", "12345678901"]);
  });

  it("never labels prerecorded source slices as responses to a collective passage", () => {
    const contributions = contributionsFor(
      score(),
      1,
      "an-earlier-collective-passage",
    );
    expect(
      contributions.every((item) => item.respondingToPassageId === null),
    ).toBe(true);
    expect(contributions.map((item) => item.source)).toEqual([
      "script",
      "script",
    ]);
    const allIds = [0, 1, 2, 3].flatMap((index) =>
      contributionsFor(score(), index, null).map((item) => item.id),
    );
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("rejects an index beyond the available nonempty intervals", () => {
    expect(() => contributionsFor(score(), 4, null)).toThrow();
  });
});

describe("source and collective history boundaries", () => {
  it("includes current slices and bounded collective history without past or future source", () => {
    const current = contributionsFor(score(), 1, "collective-one");
    const messages = buildPrompt(config(), current, [
      { id: "old", text: "Collective old" },
      { id: "latest", text: "Collective latest" },
    ]);
    expect(sourceFrom(messages)).toEqual({
      recentPassages: [{ id: "latest", text: "Collective latest" }],
      contributions: current,
    });
    expect(
      sourceFrom(messages).contributions.map(
        (item: { text: string }) => item.text,
      ),
    ).toEqual(["bc", "456"]);
    const serialised = JSON.stringify(messages);
    expect(serialised).not.toContain("abcde");
    expect(serialised).not.toContain("12345678901");
    expect(serialised).not.toContain("123");
    expect(serialised).not.toContain("789");
    expect(serialised).not.toContain("Collective old");
  });
});

describe("continuous run progression", () => {
  it("generates only nonempty global steps and journals empty individual voice slices", async () => {
    const value = {
      ...score(),
      chunkPercent: 10,
      voices: [
        { id: "a", name: "A", text: "A" },
        { id: "b", name: "B", text: "bc" },
      ],
    };
    const log = await createLog(value);
    const generate = vi
      .fn<Generate>()
      .mockResolvedValue({ text: "A collective passage" });
    const controller = new Controller(log, generate);
    await controller.advance(new AbortController().signal, vi.fn());
    await controller.advance(new AbortController().signal, vi.fn());
    await controller.advance(new AbortController().signal, vi.fn());
    expect(generate).toHaveBeenCalledTimes(2);
    expect(log.state.complete).toBe(true);
    expect(
      log.state.admitted.map((contributions) =>
        contributions.map((item) => item.text),
      ),
    ).toEqual([
      ["", "b"],
      ["A", "c"],
    ]);
    expect((await readRun(log.path)).state).toEqual(log.state);
  });

  it("retries the exact pending slice after resume, then advances to the next percentage interval", async () => {
    const log = await createLog();
    const generate = vi
      .fn<Generate>()
      .mockResolvedValueOnce({ text: "Collective one" })
      .mockRejectedValueOnce(new Error("Unavailable"));
    const controller = new Controller(log, generate);
    await controller.advance(new AbortController().signal, vi.fn());
    await expect(
      controller.advance(new AbortController().signal, vi.fn()),
    ).rejects.toThrow("pending");
    const pending = log.state.pending;
    expect(pending?.map((item) => item.text)).toEqual(["bc", "456"]);
    expect(log.state.totalSteps).toBe(4);
    await closeLog(log);
    const resumed = await RunLog.resume(log.path);
    activeLogs.push(resumed);
    expect(resumed.state.pending).toEqual(pending);
    const retry = vi
      .fn<Generate>()
      .mockResolvedValueOnce({ text: "Collective two" })
      .mockResolvedValueOnce({ text: "Collective three" })
      .mockResolvedValueOnce({ text: "Collective four" });
    const resumedController = new Controller(resumed, retry);
    await resumedController.advance(new AbortController().signal, vi.fn());
    expect(present(retry.mock.calls[0])[0].messages).toEqual(
      present(generate.mock.calls[1])[0].messages,
    );
    expect(resumed.state.admitted).toHaveLength(2);
    await resumedController.advance(new AbortController().signal, vi.fn());
    expect(
      sourceFrom(present(retry.mock.calls[1])[0].messages).contributions.map(
        (item: { text: string }) => item.text,
      ),
    ).toEqual(["d", "789"]);
    await resumedController.advance(new AbortController().signal, vi.fn());
    await resumedController.advance(new AbortController().signal, vi.fn());
    expect(retry).toHaveBeenCalledTimes(3);
    expect(resumed.state.complete).toBe(true);
    expect(resumed.state.admitted).toHaveLength(4);
    expect(resumed.state.score).toEqual(score());
    expect((await readRun(log.path)).state).toEqual(resumed.state);
  });

  it("completes at the effective step limit while retaining the full original score", async () => {
    const log = await createLog(score(), 2);
    expect(log.state.totalSteps).toBe(2);
    const generate = vi
      .fn<Generate>()
      .mockResolvedValue({ text: "A collective passage" });
    const controller = new Controller(log, generate);
    await controller.advance(new AbortController().signal, vi.fn());
    expect(log.state.complete).toBe(false);
    await controller.advance(new AbortController().signal, vi.fn());
    await controller.advance(new AbortController().signal, vi.fn());
    expect(log.state.complete).toBe(true);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(log.state.score).toEqual(score());
    const persisted = await readRun(log.path);
    expect(present(persisted.events[0]).event).toMatchObject({
      type: "run.created",
      score: score(),
      stepLimit: 2,
    });
    expect(persisted.state.totalSteps).toBe(2);
    expect(persisted.state.passages).toHaveLength(2);
    await closeLog(log);
    const resumed = await RunLog.resume(log.path);
    activeLogs.push(resumed);
    await new Controller(resumed, generate).advance(
      new AbortController().signal,
      vi.fn(),
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it.each([0, -1, 1.5, 5])(
    "rejects an invalid step limit %s",
    async (stepLimit) => {
      await expect(createLog(score(), stepLimit)).rejects.toThrow();
    },
  );

  it("bounds a step limit by the nonempty step count", async () => {
    const value = {
      ...score(),
      chunkPercent: 10,
      voices: [{ id: "a", name: "A", text: "a" }],
    };
    expect(stepCount(value)).toBe(1);
    await expect(createLog(value, 2)).rejects.toThrow();
    const log = await createLog(value, 1);
    expect(log.state.totalSteps).toBe(1);
  });

  it("creates a bounded rerun from the full stored score without inheriting passages or changing the source", async () => {
    const source = await createLog();
    await new Controller(source, async () => ({
      text: "Earlier collective passage",
    })).advance(new AbortController().signal, vi.fn());
    const original = await readFile(source.path, "utf8");
    const path = join(directory, `rerun-${nextPath++}.jsonl`);
    const rerun = await RunLog.create(path, {
      type: "run.created",
      score: source.state.score,
      config: source.state.config,
      sourceRunId: source.state.runId,
      stepLimit: 1,
    });
    activeLogs.push(rerun);
    expect(rerun.state.score).toEqual(score());
    expect(rerun.state.passages).toEqual([]);
    expect(rerun.state.totalSteps).toBe(1);
    const generate = vi
      .fn<Generate>()
      .mockResolvedValue({ text: "New collective passage" });
    await new Controller(rerun, generate).advance(
      new AbortController().signal,
      vi.fn(),
    );
    const prompt = sourceFrom(present(generate.mock.calls[0])[0].messages);
    expect(prompt.recentPassages).toEqual([]);
    expect(
      prompt.contributions.map((item: { text: string }) => item.text),
    ).toEqual(["a", "123"]);
    expect(rerun.state.complete).toBe(true);
    expect((await readRun(path)).events[0]?.event).toMatchObject({
      sourceRunId: source.state.runId,
      score: score(),
      stepLimit: 1,
    });
    expect(await readFile(source.path, "utf8")).toBe(original);
  });

  it("rejects admission beyond the limit even if a crash omitted the completion record", async () => {
    const log = await createLog(score(), 1);
    const contributions = contributionsFor(score(), 0, null);
    const attemptId = randomUUID();
    await log.append({ type: "batch.admitted", batchIndex: 0, contributions });
    await log.append({
      type: "generation.started",
      attemptId,
      messages: buildPrompt(config(), contributions, []),
    });
    await log.append({
      type: "passage.accepted",
      attemptId,
      passageId: randomUUID(),
      text: "Accepted before crash",
      durationMs: 1,
    });
    expect(log.state.complete).toBe(false);
    const original = await readFile(log.path, "utf8");
    await expect(
      log.append({
        type: "batch.admitted",
        batchIndex: 1,
        contributions: contributionsFor(score(), 1, null),
      }),
    ).rejects.toThrow();
    expect(await readFile(log.path, "utf8")).toBe(original);
    const generate = vi.fn<Generate>();
    await new Controller(log, generate).advance(
      new AbortController().signal,
      vi.fn(),
    );
    expect(generate).not.toHaveBeenCalled();
    expect(log.state.complete).toBe(true);
  });

  it("rejects manually admitting another slice after reaching the run limit", async () => {
    const log = await createLog(score(), 1);
    await new Controller(log, async () => ({ text: "Done" })).advance(
      new AbortController().signal,
      vi.fn(),
    );
    const original = await readFile(log.path, "utf8");
    await expect(
      log.append({
        type: "batch.admitted",
        batchIndex: 1,
        contributions: contributionsFor(score(), 1, null),
      }),
    ).rejects.toThrow();
    expect(await readFile(log.path, "utf8")).toBe(original);
  });
});
