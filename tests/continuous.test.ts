import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildContinuousParticipantPrompt,
  ContinuousController,
  type ContinuousHooks,
} from "../src/continuous.ts";
import {
  ContinuousLog,
  pendingCharacters,
  readContinuousRun,
} from "../src/continuous-runs.ts";
import type { ContinuousConfig } from "../src/continuous-schema.ts";
import type {
  Generate,
  ModelRequest,
  ModelResult,
  PromptMessage,
} from "../src/models.ts";
import type { SimulationScenario } from "../src/schema.ts";

function config(
  settings: Partial<ContinuousConfig["continuous"]> = {},
): ContinuousConfig {
  return {
    schemaVersion: 1,
    composer: {
      provider: "ollama",
      model: "composer",
      maxOutputTokens: 100,
      timeoutMs: 2_000,
    },
    instructions: "Compose one collective thought.",
    history: { maxPassages: 2, maxCharacters: 100 },
    continuous: {
      maxTurnsPerParticipant: 1,
      concurrency: 2,
      composerIntervalMs: 100,
      maxCharactersPerParticipant: 3,
      maxPendingCharactersPerParticipant: 6,
      participants: {
        provider: "ollama",
        model: "participant",
        maxOutputTokens: 100,
        timeoutMs: 2_000,
      },
      instructions: "Develop your own thought.",
      history: { maxTurns: 2, maxCharacters: 100 },
      ...settings,
    },
  };
}

function scenario(count = 2): SimulationScenario {
  return {
    schemaVersion: 1,
    title: "Independent streams",
    openingInvitation: "What could we change?",
    voices: ["a", "b", "c"].slice(0, count).map((id) => ({
      id,
      name: `Voice ${id}`,
      perspective: `PERSPECTIVE_${id}`,
      background: `PRIVATE_${id}`,
    })),
  };
}

function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("Missing fixture item.");
  return value;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function until<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function sourceFrom(messages: PromptMessage[]) {
  return JSON.parse(
    present(messages.find((message) => message.role === "user")).content,
  );
}

function participantId(request: ModelRequest) {
  return present(
    ["a", "b", "c"].find((id) =>
      JSON.stringify(request.messages).includes(`PRIVATE_${id}`),
    ),
  );
}

let directory: string;
let logs: ContinuousLog[];
let runs: Promise<void>[];
let cancellations: AbortController[];
let nextPath: number;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "collective-microphone-live-"));
  logs = [];
  runs = [];
  cancellations = [];
  nextPath = 0;
});
afterEach(async () => {
  for (const cancellation of cancellations) cancellation.abort();
  await Promise.allSettled(runs);
  vi.restoreAllMocks();
  await Promise.all(logs.map((log) => log.close()));
  await rm(directory, { recursive: true, force: true });
});

async function createLog(
  settings: Partial<ContinuousConfig["continuous"]> = {},
  count = 2,
) {
  const log = await ContinuousLog.create(
    join(directory, `run-${nextPath++}.jsonl`),
    {
      type: "continuous.created",
      scenario: scenario(count),
      config: config(settings),
    },
  );
  logs.push(log);
  return log;
}

function launch(controller: ContinuousController, hooks: ContinuousHooks = {}) {
  const cancellation = new AbortController();
  cancellations.push(cancellation);
  const run = controller.run(cancellation.signal, hooks);
  // Attach a rejection handler immediately; callers still observe the original.
  run.catch(() => {});
  runs.push(run);
  return { run, cancellation };
}

async function reopen(log: ContinuousLog) {
  await log.close();
  logs.splice(logs.indexOf(log), 1);
  const resumed = await ContinuousLog.resume(log.path);
  logs.push(resumed);
  return resumed;
}

describe("streamed participant and collective overlap", () => {
  it("composes an available prefix while both participants are still speaking and freezes their starting context", async () => {
    const log = await createLog();
    const releaseParticipants = deferred<void>();
    const firstComposer = deferred<void>();
    const releaseComposer = deferred<void>();
    const firstPassage = deferred<void>();
    let composers = 0;
    const generate = vi.fn<Generate>(async (request, onToken) => {
      if (request.config.model === "composer") {
        if (++composers === 1) {
          firstComposer.resolve();
          await until(releaseComposer.promise, request.signal);
        }
        await onToken("Collective");
        return { text: "Collective" };
      }
      if (participantId(request) === "a") await onToken("abcdef");
      await until(releaseParticipants.promise, request.signal);
      const text = participantId(request) === "a" ? "abcdefghi" : "B_WORDS";
      await onToken(participantId(request) === "a" ? "ghi" : text);
      return { text };
    });
    const task = launch(new ContinuousController(log, generate), {
      onPassage: () => firstPassage.resolve(),
    });
    await firstComposer.promise;
    expect(log.state.turns.map((turn) => turn.status)).toEqual([
      "streaming",
      "streaming",
    ]);
    const composer = present(
      generate.mock.calls.find(
        ([request]) => request.config.model === "composer",
      ),
    )[0];
    expect(
      sourceFrom(composer.messages).contributions.map(
        (item: { text: string }) => item.text,
      ),
    ).toEqual(["abc"]);
    expect(JSON.stringify(composer.messages)).not.toContain("PRIVATE_");
    expect(JSON.stringify(composer.messages)).not.toContain("PERSPECTIVE_");
    const participantRequests = generate.mock.calls
      .filter(([request]) => request.config.model === "participant")
      .map(([request]) => request);
    const frozen = participantRequests.map((request) =>
      JSON.stringify(request.messages),
    );
    releaseComposer.resolve();
    await firstPassage.promise;
    expect(log.state.passages).toHaveLength(1);
    releaseParticipants.resolve();
    await task.run;
    expect(
      participantRequests.map((request) => JSON.stringify(request.messages)),
    ).toEqual(frozen);
    expect(
      participantRequests.every(
        (request) => sourceFrom(request.messages).latestCollective === null,
      ),
    ).toBe(true);
    expect(
      log.state.turns.every((turn) => turn.respondingToPassageId === null),
    ).toBe(true);
    expect(log.state.complete).toBe(true);
  }, 3_000);

  it("dispatches participants fairly and includes only bounded own history and private context", async () => {
    const log = await createLog(
      {
        maxTurnsPerParticipant: 2,
        concurrency: 1,
        maxCharactersPerParticipant: 30,
        maxPendingCharactersPerParticipant: 100,
        history: { maxTurns: 1, maxCharacters: 100 },
      },
      3,
    );
    const turns = { a: 0, b: 0, c: 0 };
    const generate = vi.fn<Generate>(async (request, onToken) => {
      if (request.config.model === "composer")
        return { text: "A collective passage" };
      const id = participantId(request) as keyof typeof turns;
      const text = `${id}_TURN_${turns[id]++}`;
      await onToken(text);
      return { text };
    });
    await launch(new ContinuousController(log, generate)).run;
    const participants = generate.mock.calls.filter(
      ([request]) => request.config.model === "participant",
    );
    expect(participants.map(([request]) => participantId(request))).toEqual([
      "a",
      "b",
      "c",
      "a",
      "b",
      "c",
    ]);
    for (const [index, [request]] of participants.entries()) {
      const id = participantId(request);
      const material = JSON.stringify(request.messages);
      for (const other of ["a", "b", "c"].filter(
        (candidate) => candidate !== id,
      )) {
        expect(material).not.toContain(`PRIVATE_${other}`);
        expect(material).not.toContain(`${other}_TURN_`);
      }
      const context = sourceFrom(request.messages);
      if (index < 3) expect(context.ownHistory).toEqual([]);
      else {
        expect(context).not.toHaveProperty("openingInvitation");
        expect(context.ownHistory).toEqual([
          {
            text: `${id}_TURN_0`,
            status: "completed",
            // Earlier participants may publish collective feedback before this
            // participant starts. History must retain the context it received.
            respondingToPassageId:
              sourceFrom(present(participants[index - 3])[0].messages)
                .latestCollective?.id ?? null,
          },
        ]);
      }
    }
    const bounded = {
      ...log.state,
      config: {
        ...log.state.config,
        continuous: {
          ...log.state.config.continuous,
          history: { maxTurns: 2, maxCharacters: 1 },
        },
      },
    };
    const context = sourceFrom(buildContinuousParticipantPrompt(bounded, "a"));
    expect(context.ownHistory).toEqual([]);
    expect(context.latestCollective).toEqual(log.state.passages.at(-1));
  }, 3_000);

  it("preserves every codepoint exactly once across bounded portions and large backpressured chunks", async () => {
    const log = await createLog({
      maxCharactersPerParticipant: 2,
      maxPendingCharactersPerParticipant: 3,
    });
    const originals = { a: " A😀e\u0301\nZ ", b: "12345" };
    const generate = vi.fn<Generate>(async (request, onToken) => {
      if (request.config.model === "composer")
        return { text: "A collective passage" };
      const text = originals[participantId(request) as keyof typeof originals];
      await onToken(text);
      return { text };
    });
    await launch(new ContinuousController(log, generate), {
      onParticipantText: (id) => {
        expect(pendingCharacters(log.state, id)).toBeLessThanOrEqual(3);
      },
    }).run;
    for (const turn of log.state.turns) {
      const portions = log.state.batches
        .flatMap((batch) => batch.contributions)
        .filter((contribution) => contribution.turnId === turn.id);
      expect(portions.map((portion) => portion.text).join("")).toBe(
        originals[turn.participantId as keyof typeof originals],
      );
      let cursor = 0;
      for (const portion of portions) {
        expect(portion.from).toBe(cursor);
        expect(portion.to - portion.from).toBe(Array.from(portion.text).length);
        expect(portion.to - portion.from).toBeLessThanOrEqual(2);
        cursor = portion.to;
      }
      expect(turn.consumed).toBe(Array.from(turn.text).length);
    }
    expect((await readContinuousRun(log.path)).state).toEqual(log.state);
  }, 3_000);
});

describe("bounded queues and cancellation", () => {
  it("keeps two full producers backpressured without starving abort or accepting their late collective", async () => {
    const log = await createLog();
    const composerEntered = deferred<void>();
    const never = deferred<void>();
    const returned: string[] = [];
    const generate = vi.fn<Generate>(async (request, onToken) => {
      if (request.config.model === "composer") {
        composerEntered.resolve();
        await until(never.promise, request.signal);
        return { text: "Too late" };
      }
      const id = participantId(request);
      const text = id.repeat(100);
      await onToken(text);
      returned.push(id);
      return { text };
    });
    const controller = new ContinuousController(log, generate);
    const task = launch(controller);
    await composerEntered.promise;
    await vi.waitFor(
      () => {
        expect(pendingCharacters(log.state, "a")).toBe(6);
        expect(pendingCharacters(log.state, "b")).toBe(6);
      },
      { timeout: 500, interval: 5 },
    );
    expect(returned).toEqual([]);
    await expect(controller.run(new AbortController().signal)).rejects.toThrow(
      "already running",
    );
    task.cancellation.abort();
    await expect(task.run).rejects.toThrow();
    expect(log.state.turns.every((turn) => turn.status === "interrupted")).toBe(
      true,
    );
    expect(log.state.passages).toEqual([]);
    expect(present(log.state.pendingBatch).attemptId).toBeNull();
    expect(
      generate.mock.calls.filter(
        ([request]) => request.config.model === "participant",
      ),
    ).toHaveLength(2);
    const beforeClose = await readFile(log.path);
    await log.close();
    expect(await readFile(log.path)).toEqual(beforeClose);
  }, 2_000);

  it("times out a participant while its token callback is blocked by a full queue", async () => {
    const value = config();
    const log = await createLog(
      { participants: { ...value.continuous.participants, timeoutMs: 220 } },
      1,
    );
    const never = deferred<void>();
    const generate = vi.fn<Generate>(async (request, onToken) => {
      if (request.config.model === "composer") {
        await until(never.promise, request.signal);
        return { text: "Never accepted" };
      }
      await onToken("a".repeat(100));
      return { text: "a".repeat(100) };
    });
    await expect(
      launch(new ContinuousController(log, generate)).run,
    ).rejects.toThrow("timeout");
    expect(present(log.state.turns[0]).status).toBe("failed");
    expect(
      (await readContinuousRun(log.path)).events.some(
        (record) =>
          record.event.type === "participant.finished" &&
          record.event.code === "timeout",
      ),
    ).toBe(true);
    expect(log.state.passages).toEqual([]);
  }, 2_000);

  it("rejects acceptance queued behind a durable participant write if cancellation arrives first", async () => {
    const log = await createLog(
      {
        maxCharactersPerParticipant: 3,
        maxPendingCharactersPerParticipant: 20,
      },
      1,
    );
    const releaseSecondToken = deferred<void>();
    const composerEntered = deferred<void>();
    const composerResult = deferred<ModelResult>();
    const deltaEntered = deferred<void>();
    const releaseDelta = deferred<void>();
    const append = log.append.bind(log);
    vi.spyOn(log, "append").mockImplementation(async (event) => {
      if (event.type === "participant.delta" && event.text === "def") {
        deltaEntered.resolve();
        await releaseDelta.promise;
      }
      return append(event);
    });
    const generate = vi.fn<Generate>(async (request, onToken) => {
      if (request.config.model === "composer") {
        composerEntered.resolve();
        return composerResult.promise;
      }
      await onToken("abc");
      await until(releaseSecondToken.promise, request.signal);
      await onToken("def");
      return { text: "abcdef" };
    });
    const task = launch(new ContinuousController(log, generate));
    await composerEntered.promise;
    releaseSecondToken.resolve();
    await deltaEntered.promise;
    composerResult.resolve({ text: "Late collective" });
    // Let promise continuations queue acceptance behind the blocked write.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    task.cancellation.abort();
    releaseDelta.resolve();
    await expect(task.run).rejects.toThrow();
    expect(log.state.passages).toEqual([]);
    expect(present(log.state.pendingBatch).attemptId).toBeNull();
    expect(
      (await readContinuousRun(log.path)).events.some(
        (record) =>
          record.event.type === "generation.failed" &&
          record.event.reason === "aborted",
      ),
    ).toBe(true);
    expect(present(log.state.turns[0]).status).toBe("interrupted");
  }, 2_000);

  it("does not start a turn for an already-aborted run", async () => {
    const log = await createLog();
    const abort = new AbortController();
    abort.abort();
    const generate = vi.fn<Generate>();
    await expect(
      new ContinuousController(log, generate).run(abort.signal),
    ).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
    expect(log.state.turns).toEqual([]);
  });
});

describe("durable retry and terminal failures", () => {
  it("resumes an identical failed composer batch without regenerating participant input", async () => {
    const log = await createLog({
      maxCharactersPerParticipant: 20,
      maxPendingCharactersPerParticipant: 100,
    });
    const generate = vi.fn<Generate>(async (request, onToken) => {
      if (request.config.model === "composer")
        throw new Error("Composer unavailable");
      const text = `${participantId(request)} words`;
      await onToken(text);
      return { text };
    });
    await expect(
      launch(new ContinuousController(log, generate)).run,
    ).rejects.toThrow("provider");
    const pending = present(log.state.pendingBatch);
    const originalPrompt = present(
      generate.mock.calls.find(
        ([request]) => request.config.model === "composer",
      ),
    )[0].messages;
    const resumed = await reopen(log);
    expect(resumed.state.pendingBatch).toEqual(pending);
    const retry = vi
      .fn<Generate>()
      .mockResolvedValue({ text: "Recovered collective" });
    await launch(new ContinuousController(resumed, retry)).run;
    expect(retry).toHaveBeenCalledTimes(1);
    expect(present(retry.mock.calls[0])[0].config.model).toBe("composer");
    expect(present(retry.mock.calls[0])[0].messages).toEqual(originalPrompt);
    expect(resumed.state.batches).toHaveLength(1);
    expect(resumed.state.complete).toBe(true);
  }, 2_000);

  it("keeps a failed participant prefix and continues with its next turn on resume", async () => {
    const log = await createLog(
      {
        maxTurnsPerParticipant: 2,
        maxCharactersPerParticipant: 30,
        maxPendingCharactersPerParticipant: 100,
      },
      1,
    );
    const failed = vi.fn<Generate>(async (_request, onToken) => {
      await onToken("Saved prefix");
      throw Object.assign(new Error("Token cutoff"), { code: "truncated" });
    });
    await expect(
      launch(new ContinuousController(log, failed)).run,
    ).rejects.toThrow("truncated");
    expect(present(log.state.turns[0])).toMatchObject({
      index: 0,
      text: "Saved prefix",
      status: "failed",
    });
    const resumed = await reopen(log);
    const next = vi.fn<Generate>(async (request, onToken) => {
      if (request.config.model === "composer")
        return { text: "A collective thought" };
      expect(sourceFrom(request.messages).ownHistory).toEqual([
        { text: "Saved prefix", status: "failed", respondingToPassageId: null },
      ]);
      await onToken("New continuation");
      return { text: "New continuation" };
    });
    await launch(new ContinuousController(resumed, next)).run;
    expect(
      next.mock.calls.filter(
        ([request]) => request.config.model === "participant",
      ),
    ).toHaveLength(1);
    expect(
      resumed.state.turns.map((turn) => [turn.index, turn.status]),
    ).toEqual([
      [0, "failed"],
      [1, "completed"],
    ]);
    expect(
      resumed.state.batches
        .flatMap((batch) => batch.contributions)
        .map((contribution) => contribution.text)
        .join(""),
    ).toBe("Saved prefixNew continuation");
    expect(resumed.state.complete).toBe(true);
  }, 2_000);

  it.each(["empty", "truncated"])(
    "records %s participant output as failure",
    async (code) => {
      const log = await createLog({}, 1);
      const generate = vi.fn<Generate>(async (_request, onToken) => {
        if (code === "empty") return { text: "" };
        await onToken("prefix");
        throw Object.assign(new Error("Cutoff"), { code: "truncated" });
      });
      await expect(
        launch(new ContinuousController(log, generate)).run,
      ).rejects.toThrow(code);
      expect(present(log.state.turns[0]).status).toBe("failed");
      expect(
        (await readContinuousRun(log.path)).events.at(-1)?.event,
      ).toMatchObject({
        type: "participant.finished",
        outcome: "failed",
        code,
      });
      expect(log.state.passages).toEqual([]);
    },
    2_000,
  );

  it.each(["empty", "truncated"])(
    "keeps the admitted batch pending for %s collective output",
    async (code) => {
      const log = await createLog({}, 1);
      const generate = vi.fn<Generate>(async (request, onToken) => {
        if (request.config.model === "participant") {
          await onToken("abc");
          return { text: "abc" };
        }
        if (code === "empty") return { text: " \n " };
        throw Object.assign(new Error("Cutoff"), { code: "truncated" });
      });
      await expect(
        launch(new ContinuousController(log, generate)).run,
      ).rejects.toThrow(code);
      expect(
        present(log.state.pendingBatch).contributions.map(
          (contribution) => contribution.text,
        ),
      ).toEqual(["abc"]);
      expect(log.state.passages).toEqual([]);
      expect(
        (await readContinuousRun(log.path)).events.at(-1)?.event,
      ).toMatchObject({ type: "generation.failed", code });
    },
    2_000,
  );

  it("drains saved whitespace exactly without calling either model", async () => {
    const log = await createLog({ maxCharactersPerParticipant: 2 }, 1);
    const turnId = randomUUID();
    await log.append({
      type: "participant.started",
      participantId: "a",
      turnId,
      turnIndex: 0,
      respondingToPassageId: null,
      messages: [{ role: "user", content: "Saved context" }],
    });
    await log.append({ type: "participant.delta", turnId, text: " \n\t " });
    await log.append({
      type: "participant.finished",
      turnId,
      outcome: "failed",
      code: "empty",
    });
    const generate = vi.fn<Generate>();
    await launch(new ContinuousController(log, generate)).run;
    expect(generate).not.toHaveBeenCalled();
    expect(log.state.batches.every((batch) => batch.drained)).toBe(true);
    expect(
      log.state.batches
        .flatMap((batch) => batch.contributions)
        .map((piece) => piece.text)
        .join(""),
    ).toBe(" \n\t ");
    expect(log.state.passages).toEqual([]);
    expect(log.state.complete).toBe(true);
  }, 2_000);

  it.each(["participant.delta", "passage.accepted"] as const)(
    "propagates fatal %s storage errors without fabricating provider failures",
    async (eventType) => {
      const log = await createLog({}, 1);
      const storageError = new Error("Storage write failed.");
      const append = log.append.bind(log);
      const writes = vi
        .spyOn(log, "append")
        .mockImplementation(async (event) => {
          if (event.type === eventType) throw storageError;
          return append(event);
        });
      const generate = vi.fn<Generate>(async (request, onToken) => {
        if (request.config.model === "participant") {
          await onToken("abc");
          return { text: "abc" };
        }
        return { text: "A collective passage" };
      });
      await expect(
        launch(new ContinuousController(log, generate)).run,
      ).rejects.toBe(storageError);
      expect(log.state.passages).toEqual([]);
      expect(
        writes.mock.calls.some(([event]) => event.type === "generation.failed"),
      ).toBe(false);
      if (eventType === "participant.delta")
        expect(
          writes.mock.calls.some(
            ([event]) => event.type === "participant.finished",
          ),
        ).toBe(false);
    },
    2_000,
  );
});
