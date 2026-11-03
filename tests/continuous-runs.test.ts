import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ContinuousContribution,
  type ContinuousEvent,
  ContinuousLog,
  isContinuousRun,
  nextContributions,
  pendingCharacters,
  readContinuousRun,
} from "../src/continuous-runs.ts";
import {
  type ContinuousConfig,
  continuousConfigSchema,
} from "../src/continuous-schema.ts";
import { parse, type SimulationScenario } from "../src/schema.ts";

function config(
  settings: Partial<ContinuousConfig["continuous"]> = {},
): ContinuousConfig {
  const model = {
    provider: "ollama" as const,
    model: "test-model",
    maxOutputTokens: 100,
    timeoutMs: 1_000,
  };
  return {
    schemaVersion: 1,
    composer: model,
    instructions: "Compose from what has arrived.",
    history: { maxPassages: 2, maxCharacters: 100 },
    continuous: {
      maxTurnsPerParticipant: 1,
      concurrency: 2,
      composerIntervalMs: 100,
      maxCharactersPerParticipant: 3,
      maxPendingCharactersPerParticipant: 20,
      participants: model,
      instructions: "Continue your own thought.",
      history: { maxTurns: 2, maxCharacters: 100 },
      ...settings,
    },
  };
}

function scenario(): SimulationScenario {
  return {
    schemaVersion: 1,
    title: "A stream of contributions",
    openingInvitation: "What could we change together?",
    voices: [
      {
        id: "a",
        name: "A",
        perspective: "A's perspective",
        background: "A's private background",
      },
      {
        id: "b",
        name: "B",
        perspective: "B's perspective",
        background: "B's private background",
      },
    ],
  };
}

function present<T>(value: T | null | undefined): T {
  if (value === undefined || value === null)
    throw new Error("Missing fixture item.");
  return value;
}

let directory: string;
let activeLogs: ContinuousLog[];
let nextPath: number;
beforeEach(async () => {
  directory = await mkdtemp(
    join(tmpdir(), "collective-microphone-continuous-"),
  );
  activeLogs = [];
  nextPath = 0;
});
afterEach(async () => {
  await Promise.all(activeLogs.map((log) => log.close()));
  await rm(directory, { recursive: true, force: true });
});

async function createLog(
  settings: Partial<ContinuousConfig["continuous"]> = {},
) {
  const log = await ContinuousLog.create(
    join(directory, `run-${nextPath++}.jsonl`),
    {
      type: "continuous.created",
      scenario: scenario(),
      config: config(settings),
    },
  );
  activeLogs.push(log);
  return log;
}

async function closeLog(log: ContinuousLog) {
  await log.close();
  activeLogs.splice(activeLogs.indexOf(log), 1);
}

async function resumeLog(path: string) {
  const log = await ContinuousLog.resume(path);
  activeLogs.push(log);
  return log;
}

async function startTurn(
  log: ContinuousLog,
  participantId: string,
  turnIndex = 0,
) {
  const turnId = randomUUID();
  await log.append({
    type: "participant.started",
    participantId,
    turnIndex,
    turnId,
    respondingToPassageId: log.state.passages.at(-1)?.id ?? null,
    messages: [{ role: "user", content: "Private participant prompt" }],
  });
  return turnId;
}

async function addText(log: ContinuousLog, turnId: string, text: string) {
  await log.append({ type: "participant.delta", turnId, text });
}

async function finish(
  log: ContinuousLog,
  turnId: string,
  outcome: "completed" | "failed" | "interrupted" = "completed",
) {
  await log.append({ type: "participant.finished", turnId, outcome });
}

async function admit(log: ContinuousLog) {
  const batchId = randomUUID();
  const contributions = nextContributions(log.state);
  await log.append({ type: "batch.admitted", batchId, contributions });
  return { batchId, contributions };
}

async function accept(
  log: ContinuousLog,
  batchId: string,
  text = "A collective passage",
) {
  const attemptId = randomUUID();
  const passageId = randomUUID();
  await log.append({
    type: "generation.started",
    batchId,
    attemptId,
    messages: [{ role: "user", content: "Current admitted portions" }],
  });
  await log.append({
    type: "passage.accepted",
    batchId,
    attemptId,
    passageId,
    text,
    durationMs: 1,
  });
  return passageId;
}

async function drainAvailable(log: ContinuousLog) {
  while (nextContributions(log.state).length) {
    const batch = await admit(log);
    if (batch.contributions.every((contribution) => !contribution.text.trim()))
      await log.append({ type: "batch.drained", batchId: batch.batchId });
    else await accept(log, batch.batchId);
  }
}

describe("continuous configuration", () => {
  it("accepts a separate participant model and a pending capacity equal to the batch size", () => {
    const value = config({
      maxPendingCharactersPerParticipant: 3,
      participants: { ...config().composer, model: "participant-model" },
    });
    expect(parse(continuousConfigSchema, value, "Config")).toEqual(value);
  });

  it.each([
    ["maxTurnsPerParticipant", 0],
    ["maxTurnsPerParticipant", 1001],
    ["concurrency", 0],
    ["concurrency", 33],
    ["concurrency", 1.5],
    ["composerIntervalMs", 99],
    ["composerIntervalMs", 60001],
    ["maxCharactersPerParticipant", 0],
    ["maxCharactersPerParticipant", 12001],
    ["maxPendingCharactersPerParticipant", 0],
    ["maxPendingCharactersPerParticipant", 200001],
  ] as const)("rejects %s=%s", (key, value) => {
    expect(() =>
      parse(continuousConfigSchema, config({ [key]: value }), "Config"),
    ).toThrow("Config:");
  });

  it("rejects a pending capacity smaller than a participant's batch portion", () => {
    expect(() =>
      parse(
        continuousConfigSchema,
        config({ maxPendingCharactersPerParticipant: 2 }),
        "Config",
      ),
    ).toThrow("Config:");
  });

  it("rejects blank instructions and invalid history bounds", () => {
    expect(() =>
      parse(continuousConfigSchema, config({ instructions: " \n " }), "Config"),
    ).toThrow();
    expect(() =>
      parse(
        continuousConfigSchema,
        config({ history: { maxTurns: -1, maxCharacters: 100 } }),
        "Config",
      ),
    ).toThrow();
  });
});

describe("available participant portions", () => {
  it("takes one bounded portion per available participant in scenario order without waiting for missing voices", async () => {
    const log = await createLog();
    const b = await startTurn(log, "b");
    await addText(log, b, "123456");
    expect(
      nextContributions(log.state).map((contribution) => [
        contribution.participantId,
        contribution.text,
      ]),
    ).toEqual([["b", "123"]]);
    const a = await startTurn(log, "a");
    await addText(log, a, "abcdef");
    const portions = nextContributions(log.state);
    expect(
      portions.map((contribution) => [
        contribution.participantId,
        contribution.text,
      ]),
    ).toEqual([
      ["a", "abc"],
      ["b", "123"],
    ]);
    expect(
      portions.map((contribution) => [contribution.from, contribution.to]),
    ).toEqual([
      [0, 3],
      [0, 3],
    ]);
    expect(log.state.turns.map((turn) => turn.consumed)).toEqual([0, 0]);
  });

  it("slices raw Unicode codepoints and preserves spaces and a split combining sequence", async () => {
    const log = await createLog({ maxCharactersPerParticipant: 2 });
    const a = await startTurn(log, "a");
    const original = " A😀e\u0301\nZ ";
    await addText(log, a, original);
    const pieces: ContinuousContribution[] = [];
    while (nextContributions(log.state).length) {
      const batch = await admit(log);
      pieces.push(...batch.contributions);
      await accept(log, batch.batchId);
    }
    expect(pieces.map((piece) => piece.text)).toEqual([
      " A",
      "😀e",
      "\u0301\n",
      "Z ",
    ]);
    expect(pieces.map((piece) => [piece.from, piece.to])).toEqual([
      [0, 2],
      [2, 4],
      [4, 6],
      [6, 8],
    ]);
    expect(pieces.map((piece) => piece.id)).toEqual([
      `${a}:0:2`,
      `${a}:2:4`,
      `${a}:4:6`,
      `${a}:6:8`,
    ]);
    expect(pieces.map((piece) => piece.text).join("")).toBe(original);
  });

  it("keeps the oldest unfinished prefix ahead of a later turn by the same participant", async () => {
    const log = await createLog({ maxTurnsPerParticipant: 2 });
    const first = await startTurn(log, "a");
    await addText(log, first, "abcdef");
    await finish(log, first, "failed");
    const later = await startTurn(log, "a", 1);
    await addText(log, later, "FUTURE");
    const batch = await admit(log);
    expect(batch.contributions.map((piece) => piece.text)).toEqual(["abc"]);
    await accept(log, batch.batchId);
    expect(
      nextContributions(log.state).map((piece) => [piece.turnId, piece.text]),
    ).toEqual([[first, "def"]]);
    const remaining = await admit(log);
    await accept(log, remaining.batchId);
    expect(
      nextContributions(log.state).map((piece) => [piece.turnId, piece.text]),
    ).toEqual([[later, "FUT"]]);
  });

  it("reserves admitted characters once while later deltas remain available for a following batch", async () => {
    const log = await createLog();
    const turnId = await startTurn(log, "a");
    await addText(log, turnId, "abc");
    const batch = await admit(log);
    expect(pendingCharacters(log.state, "a")).toBe(0);
    await addText(log, turnId, "def");
    expect(present(log.state.pendingBatch).contributions).toEqual(
      batch.contributions,
    );
    expect(
      nextContributions(log.state).map((piece) => [
        piece.from,
        piece.to,
        piece.text,
      ]),
    ).toEqual([[3, 6, "def"]]);
    await expect(admit(log)).rejects.toThrow();
    await accept(log, batch.batchId);
    expect(nextContributions(log.state).map((piece) => piece.text)).toEqual([
      "def",
    ]);
  });

  it("counts buffered characters by Unicode codepoint and rejects growth beyond a participant's capacity", async () => {
    const log = await createLog({
      maxCharactersPerParticipant: 2,
      maxPendingCharactersPerParticipant: 3,
    });
    const a = await startTurn(log, "a");
    await addText(log, a, "😀ab");
    expect(pendingCharacters(log.state, "a")).toBe(3);
    const before = await readFile(log.path);
    await expect(addText(log, a, "c")).rejects.toThrow("capacity");
    expect(await readFile(log.path)).toEqual(before);
    const batch = await admit(log);
    expect(pendingCharacters(log.state, "a")).toBe(1);
    await addText(log, a, "cd");
    expect(pendingCharacters(log.state, "a")).toBe(3);
    expect(present(log.state.pendingBatch).id).toBe(batch.batchId);
  });

  it("drains exact whitespace portions without inventing a collective passage or skipping later words", async () => {
    const log = await createLog();
    const a = await startTurn(log, "a");
    await addText(log, a, " \n\tword");
    const whitespace = await admit(log);
    expect(whitespace.contributions.map((piece) => piece.text)).toEqual([
      " \n\t",
    ]);
    await expect(accept(log, whitespace.batchId)).rejects.toThrow();
    await log.append({ type: "batch.drained", batchId: whitespace.batchId });
    expect(present(log.state.batches[0]).drained).toBe(true);
    expect(log.state.passages).toEqual([]);
    expect(
      nextContributions(log.state).map((piece) => [piece.from, piece.text]),
    ).toEqual([[3, "wor"]]);
    const spoken = await admit(log);
    await expect(
      log.append({ type: "batch.drained", batchId: spoken.batchId }),
    ).rejects.toThrow();
    await accept(log, spoken.batchId);
    expect(nextContributions(log.state).map((piece) => piece.text)).toEqual([
      "d",
    ]);
  });
});

describe("continuous recovery and passage context", () => {
  it("closes interrupted turns without replaying consumed prefixes and retries the exact pending collective batch", async () => {
    const log = await createLog({ maxTurnsPerParticipant: 2 });
    const a = await startTurn(log, "a");
    await addText(log, a, "abcdef");
    const batch = await admit(log);
    const attemptId = randomUUID();
    await log.append({
      type: "generation.started",
      batchId: batch.batchId,
      attemptId,
      messages: [{ role: "user", content: "Saved exact batch" }],
    });
    await closeLog(log);
    const resumed = await resumeLog(log.path);
    expect(present(resumed.state.turns[0])).toMatchObject({
      id: a,
      text: "abcdef",
      consumed: 3,
      status: "interrupted",
    });
    expect(present(resumed.state.pendingBatch)).toMatchObject({
      id: batch.batchId,
      contributions: batch.contributions,
      attemptId: null,
    });
    const recovered = (await readContinuousRun(log.path)).events
      .slice(-2)
      .map((record) => record.event);
    expect(recovered).toEqual([
      { type: "participant.finished", turnId: a, outcome: "interrupted" },
      {
        type: "generation.failed",
        batchId: batch.batchId,
        attemptId,
        reason: "interrupted",
      },
    ]);
    await accept(resumed, batch.batchId);
    expect(nextContributions(resumed.state).map((piece) => piece.text)).toEqual(
      ["def"],
    );
    const next = await startTurn(resumed, "a", 1);
    expect(present(resumed.state.turns.at(-1))).toMatchObject({
      id: next,
      index: 1,
      respondingToPassageId: present(resumed.state.passages[0]).id,
    });
    await expect(addText(resumed, a, "late")).rejects.toThrow();
  });

  it("retains the original passage anchor throughout a streamed turn even after a new collective is accepted", async () => {
    const log = await createLog();
    const a = await startTurn(log, "a");
    await addText(log, a, "abcdef");
    const first = await admit(log);
    const passageId = await accept(log, first.batchId);
    const b = await startTurn(log, "b");
    await addText(log, b, "new");
    expect(
      nextContributions(log.state).map((piece) => [
        piece.participantId,
        piece.respondingToPassageId,
      ]),
    ).toEqual([
      ["a", null],
      ["b", passageId],
    ]);
    await addText(log, a, "ghi");
    expect(present(log.state.turns[0]).respondingToPassageId).toBeNull();
  });

  it("preserves a pending batch across provider failure and rejects reusing the failed attempt ID", async () => {
    const log = await createLog();
    const a = await startTurn(log, "a");
    await addText(log, a, "abc");
    const batch = await admit(log);
    const attemptId = randomUUID();
    const started: ContinuousEvent = {
      type: "generation.started",
      batchId: batch.batchId,
      attemptId,
      messages: [{ role: "user", content: "Saved batch" }],
    };
    await log.append(started);
    await log.append({
      type: "generation.failed",
      batchId: batch.batchId,
      attemptId,
      reason: "failed",
      code: "truncated",
    });
    expect(present(log.state.pendingBatch).contributions).toEqual(
      batch.contributions,
    );
    expect(present(log.state.turns[0]).consumed).toBe(3);
    await expect(log.append(started)).rejects.toThrow();
    await accept(log, batch.batchId);
    expect(log.state.passages).toHaveLength(1);
  });
});

describe("completion and journal integrity", () => {
  it("rejects empty deltas and completed turns without any nonblank text", async () => {
    const log = await createLog();
    const a = await startTurn(log, "a");
    await expect(addText(log, a, "")).rejects.toThrow();
    await expect(finish(log, a)).rejects.toThrow();
    await addText(log, a, " \n ");
    await expect(finish(log, a)).rejects.toThrow();
    await finish(log, a, "failed");
    expect(present(log.state.turns[0]).text).toBe(" \n ");
  });

  it("enforces the configured number of concurrently streaming turns", async () => {
    const log = await createLog({ concurrency: 1 });
    const a = await startTurn(log, "a");
    await expect(startTurn(log, "b")).rejects.toThrow();
    await finish(log, a, "failed");
    await startTurn(log, "b");
    expect(log.state.turns.map((turn) => turn.status)).toEqual([
      "failed",
      "streaming",
    ]);
  });

  it("rejects collective events for a different batch or inactive attempt", async () => {
    const log = await createLog();
    const a = await startTurn(log, "a");
    await addText(log, a, "abc");
    const batch = await admit(log);
    const attemptId = randomUUID();
    const start: ContinuousEvent = {
      type: "generation.started",
      batchId: batch.batchId,
      attemptId,
      messages: [{ role: "user", content: "Saved input" }],
    };
    await expect(
      log.append({ ...start, batchId: randomUUID() }),
    ).rejects.toThrow();
    await expect(
      log.append({
        type: "passage.accepted",
        batchId: batch.batchId,
        attemptId,
        passageId: randomUUID(),
        text: "Premature",
        durationMs: 1,
      }),
    ).rejects.toThrow();
    await log.append(start);
    await expect(
      log.append({ ...start, attemptId: randomUUID() }),
    ).rejects.toThrow();
    await expect(
      log.append({
        type: "generation.failed",
        batchId: batch.batchId,
        attemptId: randomUUID(),
        reason: "failed",
      }),
    ).rejects.toThrow();
    await expect(
      log.append({
        type: "passage.accepted",
        batchId: randomUUID(),
        attemptId,
        passageId: randomUUID(),
        text: "Wrong batch",
        durationMs: 1,
      }),
    ).rejects.toThrow();
    expect(present(log.state.pendingBatch).attemptId).toBe(attemptId);
    expect(log.state.passages).toEqual([]);
  });

  it("rejects reusing batch and passage identities after acceptance", async () => {
    const log = await createLog();
    const a = await startTurn(log, "a");
    await addText(log, a, "abcdef");
    const first = await admit(log);
    const passageId = await accept(log, first.batchId);
    await expect(
      log.append({
        type: "batch.admitted",
        batchId: first.batchId,
        contributions: nextContributions(log.state),
      }),
    ).rejects.toThrow();
    const next = await admit(log);
    const attemptId = randomUUID();
    await log.append({
      type: "generation.started",
      batchId: next.batchId,
      attemptId,
      messages: [{ role: "user", content: "Next input" }],
    });
    await expect(
      log.append({
        type: "passage.accepted",
        batchId: next.batchId,
        attemptId,
        passageId,
        text: "Reused identity",
        durationMs: 1,
      }),
    ).rejects.toThrow();
    expect(log.state.passages).toHaveLength(1);
  });

  it("requires every configured turn slot to finish and every character to be consumed or drained", async () => {
    const log = await createLog();
    const a = await startTurn(log, "a");
    await addText(log, a, "abc ");
    await finish(log, a);
    await expect(log.append({ type: "run.completed" })).rejects.toThrow();
    const b = await startTurn(log, "b");
    await finish(log, b, "failed");
    await expect(log.append({ type: "run.completed" })).rejects.toThrow();
    const batch = await admit(log);
    await expect(log.append({ type: "run.completed" })).rejects.toThrow();
    await accept(log, batch.batchId);
    await expect(log.append({ type: "run.completed" })).rejects.toThrow();
    await drainAvailable(log);
    await log.append({ type: "run.completed" });
    expect(log.state.complete).toBe(true);
    expect((await readContinuousRun(log.path)).state).toEqual(log.state);
    expect(await isContinuousRun(log.path)).toBe(true);
    await expect(addText(log, a, "later")).rejects.toThrow();
  });

  it("rejects unknown participants, overlapping turns, skipped indices and excess turn slots", async () => {
    const log = await createLog();
    await expect(startTurn(log, "unknown")).rejects.toThrow();
    await expect(startTurn(log, "a", 1)).rejects.toThrow();
    const a = await startTurn(log, "a");
    await expect(startTurn(log, "a", 1)).rejects.toThrow();
    await finish(log, a, "failed");
    await expect(startTurn(log, "a", 1)).rejects.toThrow();
  });

  it("rejects a stale context anchor and a reused turn ID", async () => {
    const log = await createLog();
    const a = await startTurn(log, "a");
    await addText(log, a, "abc");
    const batch = await admit(log);
    await accept(log, batch.batchId);
    const valid: ContinuousEvent = {
      type: "participant.started",
      participantId: "b",
      turnIndex: 0,
      turnId: randomUUID(),
      respondingToPassageId: null,
      messages: [{ role: "user", content: "Context" }],
    };
    await expect(log.append(valid)).rejects.toThrow();
    await expect(
      log.append({
        ...valid,
        turnId: a,
        respondingToPassageId: present(log.state.passages[0]).id,
      }),
    ).rejects.toThrow();
  });

  it.each([
    "text",
    "cursor",
    "identity",
    "source anchor",
    "missing participant",
  ])("rejects admission with altered %s", async (field) => {
    const log = await createLog();
    for (const id of ["a", "b"]) {
      const turnId = await startTurn(log, id);
      await addText(log, turnId, `${id}bc`);
    }
    const contributions = structuredClone(nextContributions(log.state));
    const first = present(contributions[0]);
    if (field === "text") first.text = "FORGED";
    if (field === "cursor") {
      first.from = 1;
      first.to = 3;
      first.text = "bc";
      first.id = `${first.turnId}:1:3`;
    }
    if (field === "identity") first.id = "wrong-id";
    if (field === "source anchor") first.respondingToPassageId = randomUUID();
    if (field === "missing participant") contributions.pop();
    const before = await readFile(log.path);
    await expect(
      log.append({
        type: "batch.admitted",
        batchId: randomUUID(),
        contributions,
      }),
    ).rejects.toThrow();
    expect(await readFile(log.path)).toEqual(before);
    expect(log.state.turns.every((turn) => turn.consumed === 0)).toBe(true);
  });

  it("rejects out-of-order cursors during read-only replay without modifying corrupt bytes", async () => {
    const log = await createLog();
    const a = await startTurn(log, "a");
    await addText(log, a, "abcdef");
    await admit(log);
    await closeLog(log);
    const records = (await readFile(log.path, "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    const record = present(records.at(-1));
    record.event.contributions[0].from = 1;
    await writeFile(
      log.path,
      `${records.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    );
    const before = await readFile(log.path);
    await expect(readContinuousRun(log.path)).rejects.toThrow();
    expect(await readFile(log.path)).toEqual(before);
  });

  it("rejects late deltas and duplicate terminal records", async () => {
    const log = await createLog();
    const a = await startTurn(log, "a");
    await addText(log, a, "prefix");
    await finish(log, a, "interrupted");
    await expect(addText(log, a, "late")).rejects.toThrow();
    await expect(finish(log, a, "failed")).rejects.toThrow();
  });

  it("identifies other and unreadable files without pretending they are continuous runs", async () => {
    const other = join(directory, "other.jsonl");
    await writeFile(other, '{"event":{"type":"run.created"}}\n');
    expect(await isContinuousRun(other)).toBe(false);
    expect(await isContinuousRun(join(directory, "missing"))).toBe(false);
  });
});
