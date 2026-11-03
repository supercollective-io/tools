import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLivePrompt, LiveController } from "../src/live.ts";
import { LiveLog, type LiveState, readLiveRun } from "../src/live-runs.ts";
import type { LiveConfig } from "../src/live-schema.ts";
import type { Generate, ModelRequest, PromptMessage } from "../src/models.ts";
import type { SimulationScenario } from "../src/schema.ts";

function config(settings: Partial<LiveConfig["live"]> = {}): LiveConfig {
  return {
    schemaVersion: 2,
    composer: {
      provider: "ollama",
      model: "composer",
      maxOutputTokens: 100,
      timeoutMs: 2_000,
    },
    instructions: "Develop one collective contribution.",
    history: { maxPassages: 2, maxCharacters: 100 },
    live: {
      participants: {
        provider: "ollama",
        model: "participant",
        maxOutputTokens: 100,
        timeoutMs: 2_000,
      },
      instructions: "Develop your own position.",
      maxDurationMs: 5_000,
      feedbackIntervalMs: 100,
      refreshIntervalMs: 100,
      maxContextCharacters: 100_000,
      ...settings,
    },
  };
}

function scenario(count = 1): SimulationScenario {
  return {
    schemaVersion: 1,
    title: "Growing contributions",
    openingInvitation: "What could we change?",
    voices: ["a", "b"].slice(0, count).map((id) => ({
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
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

function hold(signal: AbortSignal): Promise<never> {
  signal.throwIfAborted();
  return new Promise((_resolve, reject) =>
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    }),
  );
}

function userFrom(messages: PromptMessage[]) {
  return JSON.parse(
    present(messages.find((message) => message.role === "user")).content,
  );
}

function prefix(request: ModelRequest) {
  return (
    request.messages.find((message) => message.role === "assistant")?.content ??
    ""
  );
}

function writer(state: LiveState, id: string) {
  return id === "collective"
    ? state.composer
    : present(state.participants.find((writer) => writer.id === id));
}

async function eventually(check: () => void, timeout = 1_500) {
  await vi.waitFor(check, { timeout, interval: 5 });
}

let directory: string;
let logs: LiveLog[];
let controllers: LiveController[];
let nextPath: number;
beforeEach(async () => {
  directory = await mkdtemp(
    join(tmpdir(), "collective-microphone-live-controller-"),
  );
  logs = [];
  controllers = [];
  nextPath = 0;
  for (const name of [
    "LANGSMITH_TRACING",
    "LANGSMITH_TRACING_V2",
    "LANGCHAIN_TRACING",
    "LANGCHAIN_TRACING_V2",
    "LANGCHAIN_VERBOSE",
  ])
    vi.stubEnv(name, "false");
});
afterEach(async () => {
  await Promise.allSettled(controllers.map((controller) => controller.close()));
  await Promise.all(logs.map((log) => log.close()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

async function createLog(
  settings: Partial<LiveConfig["live"]> = {},
  count = 1,
) {
  const log = await LiveLog.create(join(directory, `run-${nextPath++}.jsonl`), {
    type: "live.created",
    scenario: scenario(count),
    config: config(settings),
  });
  logs.push(log);
  return log;
}

function controllerFor(log: LiveLog, generate: Generate) {
  const controller = new LiveController(log, generate);
  controllers.push(controller);
  return controller;
}

async function savedWriting(log: LiveLog, actorId: string, text: string) {
  const attemptId = randomUUID();
  const sourceOffsets =
    actorId === "collective"
      ? Object.fromEntries(
          log.state.scenario.voices.map((voice) => [
            voice.id,
            writer(log.state, `participant/${voice.id}`).text.length,
          ]),
        )
      : {};
  await log.append({
    type: "generation.started",
    actorId,
    attemptId,
    contextVersion: log.state.collectiveVersion,
    sourceOffsets,
    messages: [{ role: "user", content: "Saved context" }],
  });
  await log.append({
    type: "text.appended",
    actorId,
    attemptId,
    offset: writer(log.state, actorId).text.length,
    text,
  });
  await log.append({
    type: "generation.finished",
    actorId,
    attemptId,
    reason: "paused",
  });
}

describe("one growing participant and collective contribution", () => {
  it("completes a real participant-to-collective-to-participant source cycle without resetting either text", async () => {
    const log = await createLog();
    const secondCollective = deferred();
    const counts = { participant: 0, composer: 0 };
    const generate = vi.fn<Generate>(async (request, onToken) => {
      const role = request.config.model as keyof typeof counts;
      const index = counts[role]++;
      if (role === "participant") {
        if (index === 0) {
          expect(prefix(request)).toBe("");
          await onToken("organis");
        } else {
          expect(prefix(request)).toBe("organis");
          expect(userFrom(request.messages).collective.text).toBe(
            "We are organis",
          );
          await onToken("ing our work");
        }
      } else if (index === 0) {
        expect(userFrom(request.messages).participants[0].text).toBe("organis");
        await onToken("We are organis");
      } else {
        expect(prefix(request)).toBe("We are organis");
        expect(userFrom(request.messages).participants[0].text).toBe(
          "organising our work",
        );
        await onToken("ing together");
        secondCollective.resolve();
      }
      return hold(request.signal);
    });
    const controller = controllerFor(log, generate);
    await controller.start();
    await secondCollective.promise;
    await controller.pause();
    expect(writer(log.state, "participant/a").text).toBe("organising our work");
    expect(log.state.composer.text).toBe("We are organising together");
    const requests = generate.mock.calls.map(([request]) => request);
    expect(requests[0]?.signal.aborted).toBe(true);
    expect(counts).toEqual({ participant: 2, composer: 2 });
    const events = (await readLiveRun(log.path)).events.map(
      (record) => record.event,
    );
    expect(
      events.filter(
        (event) =>
          event.type === "generation.finished" && event.reason === "refresh",
      ),
    ).toHaveLength(2);
    expect(log.state.participants).toHaveLength(1);
  }, 3_000);

  it("provides full own prefixes and published collective context while keeping private participant profiles out of other prompts", async () => {
    const log = await createLog({}, 2);
    await log.append({ type: "session.started" });
    await savedWriting(log, "participant/a", "A's complete developing text");
    await savedWriting(log, "participant/b", "B's complete developing text");
    await savedWriting(log, "collective", "A published collective fragment");
    await log.append({
      type: "collective.published",
      version: 1,
      offset: log.state.composer.text.length,
    });
    await savedWriting(log, "collective", " UNPUBLISHED");
    const participant = buildLivePrompt(log.state, "participant/a");
    expect(participant.at(-1)).toEqual({
      role: "assistant",
      content: "A's complete developing text",
    });
    expect(userFrom(participant).collective).toEqual({
      version: 1,
      text: "A published collective fragment",
    });
    expect(JSON.stringify(participant)).not.toContain("UNPUBLISHED");
    expect(JSON.stringify(participant)).not.toContain("PRIVATE_b");
    expect(JSON.stringify(participant)).not.toContain(
      "B's complete developing text",
    );
    const composer = buildLivePrompt(log.state, "collective");
    expect(
      userFrom(composer).participants.map(
        (participant: { text: string }) => participant.text,
      ),
    ).toEqual(["A's complete developing text", "B's complete developing text"]);
    expect(composer.at(-1)).toEqual({
      role: "assistant",
      content: "A published collective fragment UNPUBLISHED",
    });
    expect(JSON.stringify(composer)).not.toContain("PRIVATE_");
    expect(JSON.stringify(composer)).not.toContain("PERSPECTIVE_");
    for (const actorId of ["participant/a", "collective"]) {
      const prompt = buildLivePrompt(log.state, actorId, "append");
      expect(prompt.some((message) => message.role === "assistant")).toBe(
        false,
      );
      expect(userFrom(prompt).existingText).toBe(
        writer(log.state, actorId).text,
      );
    }
  });

  it("allows a slow first token despite new input, then refreshes after useful output arrives", async () => {
    const log = await createLog();
    const update = deferred();
    const firstToken = deferred();
    const firstComposer = deferred();
    const secondComposer = deferred();
    let composerCalls = 0;
    let first: AbortSignal | undefined;
    const generate = vi.fn<Generate>(async (request, onToken) => {
      if (request.config.model === "participant") {
        await onToken("alpha");
        await waitFor(update.promise, request.signal);
        await onToken(" beta");
        return hold(request.signal);
      }
      if (++composerCalls === 1) {
        first = request.signal;
        firstComposer.resolve();
        await waitFor(firstToken.promise, request.signal);
        await onToken("A collective thought");
      } else secondComposer.resolve();
      return hold(request.signal);
    });
    const controller = controllerFor(log, generate);
    await controller.start();
    await firstComposer.promise;
    update.resolve();
    await eventually(() =>
      expect(controller.snapshot().actors.collective?.refreshPending).toBe(
        true,
      ),
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 220));
    expect(first?.aborted).toBe(false);
    expect(composerCalls).toBe(1);
    expect(controller.snapshot().actors.collective?.phase).toBe("waiting");
    firstToken.resolve();
    await secondComposer.promise;
    expect(first?.aborted).toBe(true);
    expect(log.state.composer.text).toBe("A collective thought");
    await controller.pause();
  }, 3_000);

  it.each(["eos", "budget"] as const)(
    "continues the same prefix after %s instead of starting another contribution",
    async (outcome) => {
      const log = await createLog({
        feedbackIntervalMs: 60_000,
        refreshIntervalMs: 60_000,
      });
      const continued = deferred();
      const initial = outcome === "budget" ? "organis" : "A finished thought.";
      const continuation = outcome === "budget" ? "ing" : "Another thought.";
      let participants = 0;
      const generate = vi.fn<Generate>(async (request, onToken) => {
        if (request.config.model === "composer") return hold(request.signal);
        if (++participants === 1) {
          await onToken(initial);
          if (outcome === "budget")
            throw Object.assign(new Error("Provider token limit"), {
              code: "truncated",
            });
          return { text: initial };
        }
        if (outcome === "budget") {
          expect(prefix(request)).toBe(initial);
          expect(userFrom(request.messages)).not.toHaveProperty("existingText");
        } else {
          expect(prefix(request)).toBe("");
          expect(userFrom(request.messages).existingText).toBe(initial);
        }
        await onToken(continuation);
        continued.resolve();
        return hold(request.signal);
      });
      const controller = controllerFor(log, generate);
      await controller.start();
      await continued.promise;
      await controller.pause();
      expect(writer(log.state, "participant/a").text).toBe(
        outcome === "budget" ? "organising" : `${initial} ${continuation}`,
      );
      expect(participants).toBe(2);
      expect(controller.snapshot().error).toBeNull();
      expect(
        (await readLiveRun(log.path)).events.some(
          (record) =>
            record.event.type === "generation.finished" &&
            record.event.actorId === "participant/a" &&
            record.event.reason === outcome,
        ),
      ).toBe(true);
    },
  );

  it("waits after collective EOS until new participant text arrives", async () => {
    const log = await createLog({
      feedbackIntervalMs: 60_000,
      refreshIntervalMs: 100,
    });
    const update = deferred();
    const second = deferred();
    let composers = 0;
    const generate = vi.fn<Generate>(async (request, onToken) => {
      if (request.config.model === "participant") {
        await onToken("one");
        await waitFor(update.promise, request.signal);
        await onToken(" two");
        return hold(request.signal);
      }
      if (++composers === 1) {
        await onToken("we");
        return { text: "we" };
      }
      expect(prefix(request)).toBe("");
      expect(userFrom(request.messages).existingText).toBe("we");
      second.resolve();
      return hold(request.signal);
    });
    const controller = controllerFor(log, generate);
    await controller.start();
    await eventually(() => {
      expect(log.state.composer.text).toBe("we");
      expect(log.state.composer.active).toBeNull();
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 220));
    expect(composers).toBe(1);
    expect(controller.snapshot().actors.collective?.phase).toBe("idle");
    update.resolve();
    await second.promise;
    expect(composers).toBe(2);
    await controller.pause();
  });
});

describe("live session lifetime and saved failures", () => {
  it.each(["paused", "interrupted"] as const)(
    "resumes a %s collective prefix after reopening without waiting for new participant text",
    async (reason) => {
      const log = await createLog({
        feedbackIntervalMs: 60_000,
        refreshIntervalMs: 60_000,
      });
      const source = "Unchanged participant writing";
      const existing = "We are organis";
      await log.append({ type: "session.started" });
      await savedWriting(log, "participant/a", source);
      const attemptId = randomUUID();
      await log.append({
        type: "generation.started",
        actorId: "collective",
        attemptId,
        contextVersion: 0,
        sourceOffsets: { a: source.length },
        messages: [{ role: "user", content: "Original context" }],
      });
      await log.append({
        type: "text.appended",
        actorId: "collective",
        attemptId,
        offset: 0,
        text: existing,
      });
      if (reason === "paused") {
        await log.append({
          type: "generation.finished",
          actorId: "collective",
          attemptId,
          reason,
        });
        await log.append({
          type: "session.paused",
          elapsedMs: 10,
          reason: "Operator pause",
        });
      }
      await log.close();
      logs.splice(logs.indexOf(log), 1);
      const resumed = await LiveLog.resume(log.path);
      logs.push(resumed);
      expect(resumed.state.composer.lastFinishReason).toBe(reason);
      expect(resumed.state.composer.seenOffsets).toEqual({ a: source.length });
      let composerCalls = 0;
      const generate = vi.fn<Generate>(async (request, onToken) => {
        if (request.config.model === "participant") return hold(request.signal);
        composerCalls++;
        expect(prefix(request)).toBe(existing);
        expect(userFrom(request.messages)).not.toHaveProperty("existingText");
        expect(userFrom(request.messages).participants[0].text).toBe(source);
        await onToken("ing together");
        return hold(request.signal);
      });
      const controller = controllerFor(resumed, generate);
      await controller.start();
      await eventually(() =>
        expect(resumed.state.composer.text).toBe("We are organising together"),
      );
      expect(composerCalls).toBe(1);
      expect(writer(resumed.state, "participant/a").text).toBe(source);
      expect(controller.snapshot().actors["participant/a"]?.phase).toBe(
        "waiting",
      );
      await controller.pause();
      expect((await readLiveRun(resumed.path)).state.composer.text).toBe(
        "We are organising together",
      );
    },
  );

  it("retains append mode for a completed participant contribution after reopening", async () => {
    const log = await createLog({
      feedbackIntervalMs: 60_000,
      refreshIntervalMs: 60_000,
    });
    const existing = "An existing thought.";
    await log.append({ type: "session.started" });
    const attemptId = randomUUID();
    await log.append({
      type: "generation.started",
      actorId: "participant/a",
      attemptId,
      contextVersion: 0,
      sourceOffsets: {},
      messages: [{ role: "user", content: "Original context" }],
    });
    await log.append({
      type: "text.appended",
      actorId: "participant/a",
      attemptId,
      offset: 0,
      text: existing,
    });
    await log.append({
      type: "generation.finished",
      actorId: "participant/a",
      attemptId,
      reason: "eos",
    });
    await log.append({
      type: "session.paused",
      elapsedMs: 10,
      reason: "Operator pause",
    });
    await log.close();
    logs.splice(logs.indexOf(log), 1);
    const resumed = await LiveLog.resume(log.path);
    logs.push(resumed);
    expect(writer(resumed.state, "participant/a").lastFinishReason).toBe("eos");
    const generate = vi.fn<Generate>(async (request, onToken) => {
      if (request.config.model === "composer") return hold(request.signal);
      expect(prefix(request)).toBe("");
      expect(userFrom(request.messages).existingText).toBe(existing);
      await onToken("More follows.");
      return hold(request.signal);
    });
    const controller = controllerFor(resumed, generate);
    await controller.start();
    await eventually(() =>
      expect(writer(resumed.state, "participant/a").text).toBe(
        `${existing} More follows.`,
      ),
    );
    await controller.pause();
    expect(resumed.state.participants).toHaveLength(1);
    expect(controller.snapshot().error).toBeNull();
  });

  it.each([
    ["Alpha", "Beta", "Alpha Beta"],
    ["Alpha", "42", "Alpha 42"],
    ["Alpha", "écho", "Alpha écho"],
    ["Alpha ", "Beta", "Alpha Beta"],
    ["Alpha", " Beta", "Alpha Beta"],
    ["Alpha", ", beta", "Alpha, beta"],
  ])(
    "joins append output %j + %j exactly once",
    async (initial, continuation, expected) => {
      const log = await createLog({
        feedbackIntervalMs: 60_000,
        refreshIntervalMs: 60_000,
      });
      let calls = 0;
      const generate = vi.fn<Generate>(async (request, onToken) => {
        if (request.config.model === "composer") return hold(request.signal);
        calls++;
        if (calls === 1) {
          await onToken(initial);
          return { text: initial };
        }
        if (calls === 2) {
          expect(prefix(request)).toBe("");
          expect(userFrom(request.messages).existingText).toBe(initial);
          await onToken(continuation);
          await onToken("!");
          // The result is the raw model stream, excluding any inserted join space.
          return { text: `${continuation}!` };
        }
        expect(userFrom(request.messages).existingText).toBe(`${expected}!`);
        return hold(request.signal);
      });
      const controller = controllerFor(log, generate);
      await controller.start();
      await eventually(() => expect(calls).toBe(3));
      await controller.pause();
      expect(writer(log.state, "participant/a").text).toBe(`${expected}!`);
      expect(controller.snapshot().error).toBeNull();
      expect(log.state.participants).toHaveLength(1);
      const finished = (await readLiveRun(log.path)).events.filter(
        (record) =>
          record.event.type === "generation.finished" &&
          record.event.actorId === "participant/a" &&
          record.event.reason === "eos",
      );
      expect(finished).toHaveLength(2);
    },
  );

  it("retries an empty existing assistant prefix once as append and preserves the saved contribution", async () => {
    const log = await createLog({
      feedbackIntervalMs: 60_000,
      refreshIntervalMs: 60_000,
    });
    const original = "A saved thought.";
    await log.append({ type: "session.started" });
    await savedWriting(log, "participant/a", original);
    await log.append({
      type: "session.paused",
      elapsedMs: 10,
      reason: "Saved session",
    });
    let calls = 0;
    const generate = vi.fn<Generate>(async (request, onToken) => {
      if (request.config.model === "composer") return hold(request.signal);
      calls++;
      if (calls === 1) {
        expect(prefix(request)).toBe(original);
        expect(userFrom(request.messages)).not.toHaveProperty("existingText");
        return { text: "" };
      }
      expect(prefix(request)).toBe("");
      if (calls === 2) {
        expect(userFrom(request.messages).existingText).toBe(original);
        await onToken("More follows.");
        return { text: "More follows." };
      }
      expect(userFrom(request.messages).existingText).toBe(
        `${original} More follows.`,
      );
      return hold(request.signal);
    });
    const controller = controllerFor(log, generate);
    await controller.start();
    await eventually(() => expect(calls).toBe(3));
    await controller.pause();
    expect(writer(log.state, "participant/a").text).toBe(
      `${original} More follows.`,
    );
    expect(controller.snapshot().error).toBeNull();
    const failures = (await readLiveRun(log.path)).events.filter(
      (record) =>
        record.event.type === "generation.finished" &&
        record.event.reason === "failed",
    );
    expect(failures).toHaveLength(1);
    expect(present(failures[0]).event).toMatchObject({ code: "empty" });
  });

  it("pauses after an empty append retry without looping or changing existing writing", async () => {
    const log = await createLog({
      feedbackIntervalMs: 60_000,
      refreshIntervalMs: 60_000,
    });
    const original = "A saved thought.";
    await log.append({ type: "session.started" });
    await savedWriting(log, "participant/a", original);
    await log.append({
      type: "session.paused",
      elapsedMs: 10,
      reason: "Saved session",
    });
    const generate = vi.fn<Generate>(async (request) => {
      if (request.config.model === "composer") return hold(request.signal);
      return { text: "" };
    });
    const controller = controllerFor(log, generate);
    await controller.start();
    await eventually(() => expect(log.state.status).toBe("paused"));
    const requests = generate.mock.calls.filter(
      ([request]) => request.config.model === "participant",
    );
    expect(requests).toHaveLength(2);
    expect(prefix(present(requests[0])[0])).toBe(original);
    expect(prefix(present(requests[1])[0])).toBe("");
    expect(userFrom(present(requests[1])[0].messages).existingText).toBe(
      original,
    );
    expect(writer(log.state, "participant/a").text).toBe(original);
    expect(controller.snapshot().error).toContain("empty");
    expect(
      (await readLiveRun(log.path)).events.filter(
        (record) =>
          record.event.type === "generation.finished" &&
          record.event.code === "empty",
      ),
    ).toHaveLength(2);
  });

  it("pauses and resumes without late writes, preserves elapsed time and ends permanently", async () => {
    const log = await createLog({
      feedbackIntervalMs: 60_000,
      refreshIntervalMs: 60_000,
    });
    const generate = vi.fn<Generate>(async (request, onToken) => {
      const text = prefix(request)
        ? " continued"
        : request.config.model === "participant"
          ? "saved"
          : "collective";
      await onToken(text);
      await new Promise<void>((resolve) => {
        if (request.signal.aborted) resolve();
        else
          request.signal.addEventListener("abort", () => resolve(), {
            once: true,
          });
      });
      await onToken("LATE");
      return { text: `${text}LATE` };
    });
    const controller = controllerFor(log, generate);
    const visible: string[] = [];
    const unsubscribe = controller.onChange(() =>
      visible.push(writer(log.state, "participant/a").text),
    );
    await controller.start();
    await eventually(() =>
      expect(writer(log.state, "participant/a").text).toBe("saved"),
    );
    await controller.pause();
    expect(log.state.status).toBe("paused");
    expect(log.state.composer.text).not.toContain("LATE");
    expect(writer(log.state, "participant/a").text).toBe("saved");
    const elapsed = controller.snapshot().elapsedMs;
    expect(elapsed).toBeGreaterThan(0);
    const bytes = await readFile(log.path);
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    expect(controller.snapshot().elapsedMs).toBe(elapsed);
    expect(await readFile(log.path)).toEqual(bytes);
    await controller.start();
    await eventually(() =>
      expect(writer(log.state, "participant/a").text).toBe("saved continued"),
    );
    await controller.end();
    expect(log.state.status).toBe("ended");
    expect(log.state.elapsedMs).toBeGreaterThanOrEqual(elapsed);
    expect(
      log.state.participants.every((writer) => writer.active === null),
    ).toBe(true);
    expect(log.state.composer.active).toBeNull();
    expect(writer(log.state, "participant/a").text).not.toContain("LATE");
    expect(visible).toContain("saved");
    expect(visible).toContain("saved continued");
    unsubscribe();
    await expect(controller.start()).rejects.toThrow("ended");
  });

  it("ends at the elapsed session budget and releases all active requests", async () => {
    const log = await createLog({ maxDurationMs: 1_000 });
    const generate = vi.fn<Generate>(async (request) => hold(request.signal));
    const controller = controllerFor(log, generate);
    await controller.start();
    await eventually(() =>
      expect(controller.snapshot().actors["participant/a"]?.phase).toBe(
        "waiting",
      ),
    );
    await eventually(() => expect(log.state.status).toBe("ended"), 1_800);
    expect(log.state.elapsedMs).toBeGreaterThanOrEqual(1_000);
    expect(
      log.state.participants.every((writer) => writer.active === null),
    ).toBe(true);
    expect(controller.snapshot().running).toBe(false);
    await expect(controller.start()).rejects.toThrow("ended");
  }, 2_500);

  it.each(["empty", "provider"] as const)(
    "pauses on %s errors while keeping already saved prefixes",
    async (code) => {
      const log = await createLog();
      const generate = vi.fn<Generate>(async (request, onToken) => {
        if (request.config.model === "composer") return hold(request.signal);
        if (code === "empty") return { text: "" };
        await onToken("Saved prefix");
        throw new Error("Sensitive provider response body");
      });
      const controller = controllerFor(log, generate);
      await controller.start();
      await eventually(() => expect(log.state.status).toBe("paused"));
      expect(writer(log.state, "participant/a").text).toBe(
        code === "empty" ? "" : "Saved prefix",
      );
      expect(controller.snapshot().error).toContain(code);
      expect(controller.snapshot().error).not.toContain("Sensitive provider");
      if (code === "empty") {
        expect(
          generate.mock.calls.filter(
            ([request]) => request.config.model === "participant",
          ),
        ).toHaveLength(1);
      }
      expect(
        (await readLiveRun(log.path)).events.some(
          (record) =>
            record.event.type === "generation.finished" &&
            record.event.reason === "failed" &&
            record.event.code === code,
        ),
      ).toBe(true);
      expect(
        log.state.participants.every((writer) => writer.active === null),
      ).toBe(true);
    },
  );

  it("pauses at the full-context boundary without trimming saved writing or calling a model", async () => {
    const log = await createLog({ maxContextCharacters: 2_000 });
    await log.append({ type: "session.started" });
    const saved = "Existing writing. ".repeat(250);
    await savedWriting(log, "participant/a", saved);
    await log.append({
      type: "session.paused",
      elapsedMs: 10,
      reason: "Saved session",
    });
    const generate = vi.fn<Generate>();
    const controller = controllerFor(log, generate);
    await controller.start();
    await eventually(() => expect(log.state.status).toBe("paused"));
    expect(generate).not.toHaveBeenCalled();
    expect(writer(log.state, "participant/a").text).toBe(saved);
    expect(controller.snapshot().error).toContain("full-context capacity");
    expect(log.state.elapsedMs).toBeGreaterThanOrEqual(10);
  });
});
