import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Generate,
  ModelRequest,
  ModelResult,
  PromptMessage,
} from "../src/models.ts";
import {
  parse,
  type SimulationConfig,
  type SimulationScenario,
  scenarioSchema,
  simulationConfigSchema,
} from "../src/schema.ts";
import {
  buildParticipantPrompt,
  SimulationController,
} from "../src/simulation.ts";
import {
  type RecordedResponse,
  readSimulationRun,
  recordedRoundsFor,
  roundContributions,
  type SimulationEvent,
  SimulationLog,
} from "../src/simulation-runs.ts";

function scenario(count = 2): SimulationScenario {
  return {
    schemaVersion: 1,
    title: "A temporary collective",
    openingInvitation: "What would let us change a condition we share?",
    voices: ["a", "b", "c"].slice(0, count).map((id) => ({
      id,
      name: `Voice ${id}`,
      perspective: `PERSPECTIVE_${id}`,
      background: `PRIVATE_${id}`,
    })),
  };
}

function config(rounds = 1, concurrency = 2): SimulationConfig {
  return {
    schemaVersion: 1,
    composer: {
      provider: "ollama",
      model: "composer-model",
      maxOutputTokens: 100,
      timeoutMs: 1_000,
    },
    instructions: "Compose a collective thought.",
    history: { maxPassages: 2, maxCharacters: 100 },
    simulation: {
      maxRounds: rounds,
      concurrency,
      intervalMs: 0,
      participants: {
        provider: "ollama",
        model: "participant-model",
        maxOutputTokens: 80,
        timeoutMs: 2_000,
      },
      instructions: "Respond as this person, using only the available context.",
      history: { maxTurns: 2, maxCharacters: 100 },
    },
  };
}

function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture item.");
  return value;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function sourceFrom(messages: PromptMessage[]) {
  return JSON.parse(
    present(messages.find((message) => message.role === "user")).content,
  );
}

function participantId(request: ModelRequest) {
  const serialised = JSON.stringify(request.messages);
  return present(
    ["a", "b", "c"].find((id) => serialised.includes(`PRIVATE_${id}`)),
  );
}

function hooks() {
  return {
    onParticipant: vi.fn(),
    onComposerStart: vi.fn(),
    onToken: vi.fn(),
  };
}

function opening(value = config(), people = scenario()): SimulationEvent {
  return { type: "simulation.created", scenario: people, config: value };
}

function start(
  roundIndex = 0,
  respondingToPassageId: string | null = null,
): SimulationEvent {
  return { type: "round.started", roundIndex, respondingToPassageId };
}

function participantStart(
  id: string,
  attemptId: string,
  roundIndex = 0,
): SimulationEvent {
  return {
    type: "participant.started",
    participantId: id,
    attemptId,
    roundIndex,
    messages: [{ role: "user", content: "A saved participant prompt" }],
  };
}

function response(
  id: string,
  attemptId: string,
  text: string,
  respondingToPassageId: string | null = null,
): SimulationEvent {
  return {
    type: "participant.responded",
    participantId: id,
    attemptId,
    roundIndex: 0,
    text,
    respondingToPassageId,
    durationMs: 1,
  };
}

let directory: string;
let activeLogs: SimulationLog[];
let nextPath: number;

beforeEach(async () => {
  directory = await mkdtemp(
    join(tmpdir(), "collective-microphone-simulation-"),
  );
  activeLogs = [];
  nextPath = 0;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(activeLogs.map((log) => log.close()));
  await rm(directory, { recursive: true, force: true });
});

async function createLog(value = config(), people = scenario()) {
  const log = await SimulationLog.create(
    join(directory, `run-${nextPath++}.jsonl`),
    opening(value, people),
  );
  activeLogs.push(log);
  return log;
}

async function closeLog(log: SimulationLog) {
  await log.close();
  activeLogs.splice(activeLogs.indexOf(log), 1);
}

async function resumeLog(path: string) {
  const log = await SimulationLog.resume(path);
  activeLogs.push(log);
  return log;
}

async function writeEvents(events: SimulationEvent[]) {
  const runId = randomUUID();
  const path = join(directory, `fixture-${nextPath++}.jsonl`);
  await writeFile(
    path,
    `${events.map((event, index) => JSON.stringify({ schemaVersion: 1, runId, sequence: index + 1, at: "2026-11-03T12:00:00.000Z", event })).join("\n")}\n`,
  );
  return path;
}

describe("simulation input validation", () => {
  it("rejects duplicate participant IDs", () => {
    const value = scenario();
    present(value.voices[1]).id = "a";
    expect(() => parse(scenarioSchema, value, "Scenario")).toThrow("Scenario:");
  });

  it.each([0, -1, 1.5, 33])(
    "rejects invalid participant concurrency %s",
    (concurrency) => {
      expect(() =>
        parse(simulationConfigSchema, config(1, concurrency), "Config"),
      ).toThrow("Config:");
    },
  );

  it("validates participant model settings separately from the composer", () => {
    const value = config();
    value.simulation.participants.model = "REPLACE_MODEL";
    expect(() => parse(simulationConfigSchema, value, "Config")).toThrow(
      "simulation.participants.model",
    );
  });
});

describe("round barrier and private context", () => {
  it("waits for every response, bounds concurrency and composes in scenario order without private context", async () => {
    const log = await createLog(config(), scenario(3));
    const entered = {
      a: deferred<void>(),
      b: deferred<void>(),
      c: deferred<void>(),
    };
    const results = {
      a: deferred<ModelResult>(),
      b: deferred<ModelResult>(),
      c: deferred<ModelResult>(),
    };
    let active = 0;
    let highest = 0;
    const generate = vi.fn<Generate>(async (request) => {
      if (request.config.model === "composer-model") {
        expect(
          Object.keys(present(log.state.rounds[0]).responses),
        ).toHaveLength(3);
        return { text: "A shared thought" };
      }
      expect(request.config).toEqual(config().simulation.participants);
      const id = participantId(request) as keyof typeof entered;
      active++;
      highest = Math.max(highest, active);
      entered[id].resolve();
      try {
        return await results[id].promise;
      } finally {
        active--;
      }
    });
    const controller = new SimulationController(log, generate);
    const advance = controller.advance(new AbortController().signal, hooks());
    await Promise.all([entered.a.promise, entered.b.promise]);
    expect(generate).toHaveBeenCalledTimes(2);
    await expect(
      controller.advance(new AbortController().signal, hooks()),
    ).rejects.toThrow();
    results.b.resolve({ text: "B_RESPONSE" });
    await entered.c.promise;
    expect(
      generate.mock.calls.some(
        ([request]) => request.config.model === "composer-model",
      ),
    ).toBe(false);
    results.c.resolve({ text: "C_RESPONSE" });
    results.a.resolve({ text: "A_RESPONSE" });
    await advance;
    expect(highest).toBe(2);
    const composer = present(
      generate.mock.calls.find(
        ([request]) => request.config.model === "composer-model",
      ),
    )[0];
    expect(composer.config).toEqual(config().composer);
    expect(
      sourceFrom(composer.messages).contributions.map(
        (item: { text: string }) => item.text,
      ),
    ).toEqual(["A_RESPONSE", "B_RESPONSE", "C_RESPONSE"]);
    expect(JSON.stringify(composer.messages)).not.toContain("PRIVATE_");
    expect(JSON.stringify(composer.messages)).not.toContain("PERSPECTIVE_");
    for (const [request] of generate.mock.calls.filter(
      ([request]) => request.config.model === "participant-model",
    )) {
      const id = participantId(request);
      const material = JSON.stringify(request.messages);
      expect(sourceFrom(request.messages)).toEqual({
        openingInvitation: scenario().openingInvitation,
        latestCollective: null,
        ownHistory: [],
      });
      for (const other of ["a", "b", "c"].filter((item) => item !== id))
        expect(material).not.toContain(`PRIVATE_${other}`);
    }
    const events = (await readSimulationRun(log.path)).events;
    const admission = events.findIndex(
      (record) => record.event.type === "round.admitted",
    );
    expect(
      events
        .slice(0, admission)
        .filter((record) => record.event.type === "participant.responded"),
    ).toHaveLength(3);
    expect(log.state.complete).toBe(true);
    await controller.advance(new AbortController().signal, hooks());
    expect(generate).toHaveBeenCalledTimes(4);
  });

  it("anchors all next-round responses to the same latest collective passage", async () => {
    const log = await createLog(config(2));
    const generate = vi.fn<Generate>(async (request) => ({
      text:
        request.config.model === "composer-model"
          ? "A collective passage"
          : `${participantId(request)} response`,
    }));
    const controller = new SimulationController(log, generate);
    await controller.advance(new AbortController().signal, hooks());
    const first = present(log.state.passages[0]);
    await controller.advance(new AbortController().signal, hooks());
    const participants = generate.mock.calls.filter(
      ([request]) => request.config.model === "participant-model",
    );
    for (const [request] of participants.slice(2)) {
      const id = participantId(request);
      expect(sourceFrom(request.messages)).not.toHaveProperty(
        "openingInvitation",
      );
      expect(sourceFrom(request.messages).latestCollective).toEqual({
        id: first.id,
        text: first.text,
      });
      expect(sourceFrom(request.messages).ownHistory).toEqual([
        { roundIndex: 0, text: `${id} response`, respondingToPassageId: null },
      ]);
    }
    expect(
      Object.values(present(log.state.rounds[1]).responses).every(
        (item) => item.respondingToPassageId === first.id,
      ),
    ).toBe(true);
    expect(log.state.passages).toHaveLength(2);
    expect(
      log.state.rounds.every(
        (round) => round.complete && round.passage !== null,
      ),
    ).toBe(true);
    expect(
      sourceFrom(
        present(
          generate.mock.calls.filter(
            ([request]) => request.config.model === "composer-model",
          )[1],
        )[0].messages,
      ).recentPassages,
    ).toEqual([first]);
  });

  it("bounds only previous own history and retains the latest collective independently of that bound", async () => {
    const log = await createLog(config(3));
    const controller = new SimulationController(log, async (request) => ({
      text:
        request.config.model === "composer-model"
          ? "A long collective passage that must remain available"
          : `${participantId(request)}_HISTORY`,
    }));
    await controller.advance(new AbortController().signal, hooks());
    await controller.advance(new AbortController().signal, hooks());
    await log.append(start(2, present(log.state.passages.at(-1)).id));
    const attemptId = randomUUID();
    await log.append(participantStart("a", attemptId, 2));
    await log.append({
      type: "participant.responded",
      participantId: "a",
      attemptId,
      roundIndex: 2,
      respondingToPassageId: present(log.state.passages.at(-1)).id,
      text: "CURRENT_ROUND_RESPONSE",
      durationMs: 1,
    });
    const value = config(3);
    value.simulation.history = { maxTurns: 1, maxCharacters: 100 };
    const current = log.state;
    const prompt = buildParticipantPrompt(value, scenario(), "a", current);
    expect(sourceFrom(prompt).ownHistory).toEqual([
      {
        roundIndex: 1,
        text: "a_HISTORY",
        respondingToPassageId: present(current.passages[0]).id,
      },
    ]);
    expect(JSON.stringify(prompt)).not.toContain("CURRENT_ROUND_RESPONSE");
    expect(JSON.stringify(prompt)).not.toContain("b_HISTORY");
    value.simulation.history = { maxTurns: 0, maxCharacters: 0 };
    const bounded = sourceFrom(
      buildParticipantPrompt(value, scenario(), "a", current),
    );
    expect(bounded.ownHistory).toEqual([]);
    expect(bounded.latestCollective).toEqual({
      id: present(current.passages.at(-1)).id,
      text: present(current.passages.at(-1)).text,
    });
    value.simulation.history = { maxTurns: 2, maxCharacters: 8 };
    expect(
      sourceFrom(buildParticipantPrompt(value, scenario(), "a", current))
        .ownHistory,
    ).toEqual([]);
  });
});

describe("participant and composer failures", () => {
  it("propagates response storage failure without recording it as a participant provider failure", async () => {
    const log = await createLog(config(), scenario(1));
    const storageError = new Error("Durable storage failed.");
    const append = log.append.bind(log);
    const writes = vi.spyOn(log, "append").mockImplementation(async (event) => {
      if (event.type === "participant.responded") throw storageError;
      return append(event);
    });
    const generate = vi
      .fn<Generate>()
      .mockResolvedValue({ text: "A complete participant response" });
    await expect(
      new SimulationController(log, generate).advance(
        new AbortController().signal,
        hooks(),
      ),
    ).rejects.toBe(storageError);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(
      writes.mock.calls.some(([event]) => event.type === "participant.failed"),
    ).toBe(false);
    expect(log.state.passages).toEqual([]);
  });

  it("propagates collective storage failure without recording a provider failure", async () => {
    const log = await createLog(config(), scenario(1));
    const storageError = new Error("Durable storage failed.");
    const append = log.append.bind(log);
    const writes = vi.spyOn(log, "append").mockImplementation(async (event) => {
      if (event.type === "passage.accepted") throw storageError;
      return append(event);
    });
    const generate = vi
      .fn<Generate>()
      .mockResolvedValue({ text: "A complete response" });
    await expect(
      new SimulationController(log, generate).advance(
        new AbortController().signal,
        hooks(),
      ),
    ).rejects.toBe(storageError);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(
      writes.mock.calls.some(([event]) => event.type === "generation.failed"),
    ).toBe(false);
    expect(log.state.passages).toEqual([]);
  });

  it("does not start a round for an already-aborted advance", async () => {
    const log = await createLog();
    const abort = new AbortController();
    abort.abort();
    const generate = vi.fn<Generate>();
    await expect(
      new SimulationController(log, generate).advance(abort.signal, hooks()),
    ).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
    expect(log.state.rounds).toEqual([]);
  });

  it("rejects a late collective result after abort while retaining admitted participant responses", async () => {
    const log = await createLog();
    const entered = deferred<void>();
    const result = deferred<ModelResult>();
    const generate = vi.fn<Generate>(async (request) => {
      if (request.config.model === "participant-model")
        return { text: `${participantId(request)} response` };
      entered.resolve();
      return result.promise;
    });
    const abort = new AbortController();
    const advance = new SimulationController(log, generate).advance(
      abort.signal,
      hooks(),
    );
    const rejected = expect(advance).rejects.toThrow();
    await entered.promise;
    abort.abort();
    result.resolve({ text: "TOO_LATE_COLLECTIVE" });
    await rejected;
    expect(log.state.passages).toEqual([]);
    expect(present(log.state.rounds[0]).admitted).toHaveLength(2);
    expect(Object.keys(present(log.state.rounds[0]).responses)).toHaveLength(2);
    expect(
      (await readSimulationRun(log.path)).events.at(-1)?.event,
    ).toMatchObject({ type: "generation.failed", reason: "aborted" });
  });

  it("stops scheduling after a failure, saves an in-flight success and resumes only missing participants", async () => {
    const log = await createLog(config(), scenario(3));
    const enteredA = deferred<void>();
    const enteredB = deferred<void>();
    const resultA = deferred<ModelResult>();
    const resultB = deferred<ModelResult>();
    const generate = vi.fn<Generate>(async (request) => {
      const id = participantId(request);
      if (id === "a") {
        enteredA.resolve();
        return resultA.promise;
      }
      if (id === "b") {
        enteredB.resolve();
        return resultB.promise;
      }
      throw new Error("A new participant was scheduled after failure.");
    });
    const advance = new SimulationController(log, generate).advance(
      new AbortController().signal,
      hooks(),
    );
    const rejected = expect(advance).rejects.toThrow();
    await Promise.all([enteredA.promise, enteredB.promise]);
    resultA.reject(new Error("Provider unavailable"));
    await vi.waitFor(() =>
      expect(present(log.state.rounds[0]).attempts.a).toBeUndefined(),
    );
    expect(generate).toHaveBeenCalledTimes(2);
    resultB.resolve({ text: "SAVED_B" });
    await rejected;
    expect(present(log.state.rounds[0]).responses.b?.text).toBe("SAVED_B");
    expect(present(log.state.rounds[0]).responses.a).toBeUndefined();
    await closeLog(log);
    const resumed = await resumeLog(log.path);
    const retry = vi.fn<Generate>(async (request) => ({
      text:
        request.config.model === "composer-model"
          ? "Recovered collective"
          : `${participantId(request)} recovered`,
    }));
    await new SimulationController(resumed, retry).advance(
      new AbortController().signal,
      hooks(),
    );
    expect(
      retry.mock.calls
        .filter(([request]) => request.config.model === "participant-model")
        .map(([request]) => participantId(request)),
    ).toEqual(["a", "c"]);
    for (const [request] of retry.mock.calls.filter(
      ([request]) => request.config.model === "participant-model",
    )) {
      expect(sourceFrom(request.messages)).toEqual({
        openingInvitation: scenario().openingInvitation,
        latestCollective: null,
        ownHistory: [],
      });
    }
    expect(present(resumed.state.rounds[0]).responses.b?.text).toBe("SAVED_B");
    expect(resumed.state.rounds).toHaveLength(1);
    expect(resumed.state.complete).toBe(true);
  });

  it("rejects late participant results after abort and starts no additional voices", async () => {
    const log = await createLog(config(), scenario(3));
    const entered = deferred<void>();
    const result = deferred<ModelResult>();
    let calls = 0;
    const signals: AbortSignal[] = [];
    const generate = vi.fn<Generate>(async (request) => {
      signals.push(request.signal);
      calls++;
      if (calls === 2) entered.resolve();
      return result.promise;
    });
    const abort = new AbortController();
    const advance = new SimulationController(log, generate).advance(
      abort.signal,
      hooks(),
    );
    const rejected = expect(advance).rejects.toThrow();
    await entered.promise;
    abort.abort();
    result.resolve({ text: "TOO_LATE" });
    await rejected;
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(Object.keys(present(log.state.rounds[0]).responses)).toEqual([]);
    expect(log.state.passages).toEqual([]);
    expect(
      (await readSimulationRun(log.path)).events.filter(
        (record) => record.event.type === "participant.failed",
      ),
    ).toHaveLength(2);
  });

  it("does not regenerate participant responses when the composer fails", async () => {
    const log = await createLog();
    let composerCalls = 0;
    const generate = vi.fn<Generate>(async (request) => {
      if (request.config.model === "participant-model")
        return { text: `${participantId(request)} response` };
      if (++composerCalls === 1) throw new Error("Composer unavailable");
      return { text: "Recovered collective" };
    });
    const controller = new SimulationController(log, generate);
    await expect(
      controller.advance(new AbortController().signal, hooks()),
    ).rejects.toThrow();
    expect(log.state.passages).toEqual([]);
    expect(Object.keys(present(log.state.rounds[0]).responses)).toHaveLength(2);
    const before = present(
      generate.mock.calls.find(
        ([request]) => request.config.model === "composer-model",
      ),
    )[0].messages;
    await closeLog(log);
    const resumed = await resumeLog(log.path);
    await new SimulationController(resumed, generate).advance(
      new AbortController().signal,
      hooks(),
    );
    expect(
      generate.mock.calls.filter(
        ([request]) => request.config.model === "participant-model",
      ),
    ).toHaveLength(2);
    expect(present(generate.mock.calls.at(-1))[0].messages).toEqual(before);
    expect(resumed.state.complete).toBe(true);
  });

  it.each(["empty", "truncated"])(
    "rejects %s participant output and leaves the round unfinished",
    async (code) => {
      const log = await createLog(config(), scenario(1));
      const generate = vi.fn<Generate>(async () => {
        if (code === "empty") return { text: " \n " };
        throw Object.assign(new Error("Token limit"), { code: "truncated" });
      });
      await expect(
        new SimulationController(log, generate).advance(
          new AbortController().signal,
          hooks(),
        ),
      ).rejects.toThrow();
      expect(present(log.state.rounds[0]).responses.a).toBeUndefined();
      expect(log.state.roundsCompleted).toBe(0);
      expect(
        (await readSimulationRun(log.path)).events.at(-1)?.event,
      ).toMatchObject({ type: "participant.failed", code });
    },
  );
});

describe("interrupted attempt recovery", () => {
  it("finishes a round whose collective passage was accepted before a crash without regenerating anything", async () => {
    const log = await createLog(config(), scenario(1));
    const participantAttempt = randomUUID();
    const composerAttempt = randomUUID();
    const passageId = randomUUID();
    await log.append(start());
    await log.append(participantStart("a", participantAttempt));
    await log.append(response("a", participantAttempt, "A_RESPONSE"));
    await log.append({
      type: "round.admitted",
      roundIndex: 0,
      contributions: roundContributions(
        log.state,
        present(log.state.rounds[0]),
      ),
    });
    await log.append({
      type: "generation.started",
      roundIndex: 0,
      attemptId: composerAttempt,
      messages: [{ role: "user", content: "Saved collective prompt" }],
    });
    await log.append({
      type: "passage.accepted",
      roundIndex: 0,
      attemptId: composerAttempt,
      passageId,
      text: "Already accepted",
      durationMs: 1,
    });
    await closeLog(log);
    const resumed = await resumeLog(log.path);
    const generate = vi.fn<Generate>();
    await new SimulationController(resumed, generate).advance(
      new AbortController().signal,
      hooks(),
    );
    expect(generate).not.toHaveBeenCalled();
    expect(resumed.state.complete).toBe(true);
    expect(resumed.state.passages).toEqual([
      { id: passageId, text: "Already accepted", roundIndex: 0 },
    ]);
  });

  it("finishes a run whose final round completion was saved before a crash", async () => {
    const log = await createLog(config(), scenario(1));
    const attemptId = randomUUID();
    await log.append(start());
    await log.append(participantStart("a", attemptId));
    await log.append(response("a", attemptId, "A_RESPONSE"));
    await log.append({
      type: "round.admitted",
      roundIndex: 0,
      contributions: roundContributions(
        log.state,
        present(log.state.rounds[0]),
      ),
    });
    const composerAttempt = randomUUID();
    await log.append({
      type: "generation.started",
      roundIndex: 0,
      attemptId: composerAttempt,
      messages: [{ role: "user", content: "Saved collective prompt" }],
    });
    await log.append({
      type: "passage.accepted",
      roundIndex: 0,
      attemptId: composerAttempt,
      passageId: randomUUID(),
      text: "Accepted before crash",
      durationMs: 1,
    });
    await log.append({ type: "round.completed", roundIndex: 0 });
    await closeLog(log);
    const resumed = await resumeLog(log.path);
    const generate = vi.fn<Generate>();
    await new SimulationController(resumed, generate).advance(
      new AbortController().signal,
      hooks(),
    );
    expect(generate).not.toHaveBeenCalled();
    expect(resumed.state.complete).toBe(true);
  });

  it("fails interrupted participant attempts on resume while retaining already saved responses", async () => {
    const log = await createLog();
    const a = randomUUID();
    const b = randomUUID();
    await log.append(start());
    await log.append(participantStart("a", a));
    await log.append(participantStart("b", b));
    await log.append(response("b", b, "SAVED_B"));
    await closeLog(log);
    const resumed = await resumeLog(log.path);
    expect(
      (await readSimulationRun(log.path)).events.at(-1)?.event,
    ).toMatchObject({
      type: "participant.failed",
      participantId: "a",
      attemptId: a,
      reason: "interrupted",
    });
    const generate = vi.fn<Generate>(async (request) => ({
      text:
        request.config.model === "composer-model"
          ? "A collective passage"
          : "SAVED_A",
    }));
    await new SimulationController(resumed, generate).advance(
      new AbortController().signal,
      hooks(),
    );
    expect(
      generate.mock.calls
        .filter(([request]) => request.config.model === "participant-model")
        .map(([request]) => participantId(request)),
    ).toEqual(["a"]);
    expect(resumed.state.complete).toBe(true);
  });

  it("fails an interrupted composer attempt without regenerating any participants", async () => {
    const log = await createLog();
    await log.append(start());
    for (const id of ["a", "b"]) {
      const attemptId = randomUUID();
      await log.append(participantStart(id, attemptId));
      await log.append(response(id, attemptId, `${id} response`));
    }
    await log.append({
      type: "round.admitted",
      roundIndex: 0,
      contributions: roundContributions(
        log.state,
        present(log.state.rounds[0]),
      ),
    });
    const attemptId = randomUUID();
    await log.append({
      type: "generation.started",
      roundIndex: 0,
      attemptId,
      messages: [{ role: "user", content: "Saved collective prompt" }],
    });
    await closeLog(log);
    const resumed = await resumeLog(log.path);
    expect(
      (await readSimulationRun(log.path)).events.at(-1)?.event,
    ).toMatchObject({
      type: "generation.failed",
      attemptId,
      reason: "interrupted",
    });
    const generate = vi
      .fn<Generate>()
      .mockResolvedValue({ text: "Recovered collective" });
    await new SimulationController(resumed, generate).advance(
      new AbortController().signal,
      hooks(),
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(present(generate.mock.calls[0])[0].config).toEqual(
      config().composer,
    );
  });
});

describe("recorded participant reruns", () => {
  it("reuses complete participant rounds and their original collective links without participant calls", async () => {
    const source = await createLog(config(2));
    const controller = new SimulationController(source, async (request) => ({
      text:
        request.config.model === "composer-model"
          ? "ORIGINAL_COLLECTIVE"
          : `${participantId(request)} response`,
    }));
    await controller.advance(new AbortController().signal, hooks());
    await controller.advance(new AbortController().signal, hooks());
    const original = await readFile(source.path, "utf8");
    const recordedRounds = recordedRoundsFor(source.state);
    const rerun = await SimulationLog.create(join(directory, "rerun.jsonl"), {
      type: "simulation.created",
      scenario: scenario(),
      config: config(2),
      sourceRunId: source.state.runId,
      recordedRounds,
    });
    activeLogs.push(rerun);
    const generate = vi
      .fn<Generate>()
      .mockResolvedValue({ text: "NEW_COLLECTIVE" });
    const rerunController = new SimulationController(rerun, generate);
    await rerunController.advance(new AbortController().signal, hooks());
    await rerunController.advance(new AbortController().signal, hooks());
    expect(generate).toHaveBeenCalledTimes(2);
    expect(
      generate.mock.calls.every(
        ([request]) => request.config.model === "composer-model",
      ),
    ).toBe(true);
    expect(
      Object.values(present(rerun.state.rounds[1]).responses).map(
        (item) => item.respondingToPassageId,
      ),
    ).toEqual([
      present(source.state.passages[0]).id,
      present(source.state.passages[0]).id,
    ]);
    expect(present(rerun.state.passages[0]).id).not.toBe(
      present(source.state.passages[0]).id,
    );
    expect((await readSimulationRun(rerun.path)).state).toEqual(rerun.state);
    expect(await readFile(source.path, "utf8")).toBe(original);
  });

  it("selects fully recorded participant rounds even if composition failed, excluding partial rounds", async () => {
    const log = await createLog(config(2));
    const a = randomUUID();
    const b = randomUUID();
    await log.append(start());
    await log.append(participantStart("a", a));
    await log.append(response("a", a, "A_RESPONSE"));
    expect(recordedRoundsFor(log.state)).toEqual([]);
    await log.append(participantStart("b", b));
    await log.append(response("b", b, "B_RESPONSE"));
    expect(recordedRoundsFor(log.state)).toEqual([
      [
        { participantId: "a", text: "A_RESPONSE", respondingToPassageId: null },
        { participantId: "b", text: "B_RESPONSE", respondingToPassageId: null },
      ],
    ]);
    expect(log.state.roundsCompleted).toBe(0);
  });

  it.each([
    [
      "missing source",
      undefined,
      [
        [
          { participantId: "a", text: "A", respondingToPassageId: null },
          {
            participantId: "b",
            text: "B_RESPONSE",
            respondingToPassageId: null,
          },
        ],
      ],
    ],
    [
      "missing participant",
      randomUUID(),
      [[{ participantId: "a", text: "A", respondingToPassageId: null }]],
    ],
    [
      "duplicate participant",
      randomUUID(),
      [
        [
          { participantId: "a", text: "A", respondingToPassageId: null },
          { participantId: "a", text: "B", respondingToPassageId: null },
        ],
      ],
    ],
    [
      "mixed collective anchors",
      randomUUID(),
      [
        [
          { participantId: "a", text: "A", respondingToPassageId: null },
          { participantId: "b", text: "B", respondingToPassageId: "other" },
        ],
      ],
    ],
  ] satisfies [string, string | undefined, RecordedResponse[][]][])(
    "rejects recorded headers with %s",
    async (_label, sourceRunId, recordedRounds) => {
      const path = await writeEvents([
        {
          type: "simulation.created",
          scenario: scenario(),
          config: config(),
          ...(sourceRunId ? { sourceRunId } : {}),
          recordedRounds,
        },
      ]);
      await expect(readSimulationRun(path)).rejects.toThrow();
    },
  );
});

describe("simulation journal integrity", () => {
  const a = randomUUID();
  it.each([
    ["wrong initial collective anchor", [opening(), start(0, "invented")]],
    ["skipped round", [opening(), start(1)]],
    [
      "unknown participant",
      [opening(), start(), participantStart("unknown", a)],
    ],
    [
      "response without an attempt",
      [opening(), start(), response("a", a, "A")],
    ],
    [
      "response to the wrong collective",
      [
        opening(),
        start(),
        participantStart("a", a),
        response("a", a, "A", "wrong"),
      ],
    ],
    [
      "reused attempt identifier",
      [opening(), start(), participantStart("a", a), participantStart("b", a)],
    ],
    [
      "duplicate response",
      [
        opening(),
        start(),
        participantStart("a", a),
        response("a", a, "A"),
        response("a", a, "again"),
      ],
    ],
    [
      "admission without all responses",
      [
        opening(),
        start(),
        { type: "round.admitted", roundIndex: 0, contributions: [] },
      ],
    ],
    [
      "composer before admission",
      [
        opening(),
        start(),
        {
          type: "generation.started",
          roundIndex: 0,
          attemptId: a,
          messages: [{ role: "user", content: "A" }],
        },
      ],
    ],
    [
      "premature round completion",
      [opening(), start(), { type: "round.completed", roundIndex: 0 }],
    ],
    ["premature run completion", [opening(), { type: "run.completed" }]],
    [
      "replayed response in a live run",
      [
        opening(),
        start(),
        {
          type: "participant.replayed",
          roundIndex: 0,
          participantId: "a",
          text: "A",
          respondingToPassageId: null,
        },
      ],
    ],
    ["overlapping rounds", [opening(config(2)), start(), start(1)]],
  ] satisfies [string, SimulationEvent[]][])(
    "rejects %s on read-only replay",
    async (_label, events) => {
      const path = await writeEvents(events);
      const before = await readFile(path);
      await expect(readSimulationRun(path)).rejects.toThrow();
      expect(await readFile(path)).toEqual(before);
    },
  );
});
