import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { percentageRanges } from "../src/composition.ts";
import { LiveController, sourceOffsets } from "../src/live.ts";
import { LiveLog, readLiveRun } from "../src/live-runs.ts";
import { type LiveConfig, liveConfigSchema } from "../src/live-schema.ts";
import type { Generate, ModelRequest } from "../src/models.ts";
import type { ContinuousScore, SimulationScenario } from "../src/schema.ts";

const scenario: SimulationScenario = {
  schemaVersion: 1,
  title: "One developing contribution per person",
  openingInvitation: "What could we change?",
  voices: ["a", "b"].map((id) => ({
    id,
    name: id,
    perspective: `Perspective ${id}`,
    background: `Context ${id}`,
  })),
};
const score: ContinuousScore = {
  schemaVersion: 2,
  title: "Frozen contributions",
  chunkPercent: 20,
  voices: [
    { id: "a", name: "a", text: "organising work together. " },
    { id: "b", name: "b", text: "😀 Different limits apply." },
  ],
};
function config(mode: "chunked" | "fixed"): LiveConfig {
  const model = {
    provider: "ollama" as const,
    model: "composer",
    maxOutputTokens: 256,
    timeoutMs: 2_000,
  };
  return {
    schemaVersion: 2,
    composer: model,
    instructions: "Develop our collective contribution.",
    history: { maxPassages: 0, maxCharacters: 0 },
    live: {
      mode,
      ...(mode === "fixed" ? { score } : {}),
      participants: { ...model, model: "participant" },
      instructions: "Develop your own contribution.",
      maxDurationMs: 60_000,
      feedbackIntervalMs: 100,
      refreshIntervalMs: 100,
      maxContextCharacters: 100_000,
    },
  };
}
function user(request: ModelRequest) {
  const message = request.messages.find((message) => message.role === "user");
  if (!message) throw new Error("Missing user context.");
  return JSON.parse(message.content);
}
function prefix(request: ModelRequest) {
  return request.messages.find((message) => message.role === "assistant")
    ?.content;
}
function hold(signal: AbortSignal): Promise<never> {
  signal.throwIfAborted();
  return new Promise((_resolve, reject) =>
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    }),
  );
}
function budget(): never {
  throw Object.assign(new Error("Inference budget reached."), {
    code: "truncated",
  });
}
async function eventually(check: () => void) {
  await vi.waitFor(check, { timeout: 2_000, interval: 5 });
}
let directory: string;
let logs: LiveLog[];
let controllers: LiveController[];
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "collective-modes-"));
  logs = [];
  controllers = [];
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
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function create(settings: LiveConfig) {
  const log = await LiveLog.create(join(directory, `${randomUUID()}.jsonl`), {
    type: "live.created",
    scenario,
    config: settings,
  });
  logs.push(log);
  return log;
}
function controllerFor(log: LiveLog, generate: Generate) {
  const controller = new LiveController(log, generate);
  controllers.push(controller);
  return controller;
}
async function savedAttempt(
  log: LiveLog,
  actorId: string,
  text: string,
  finished = true,
) {
  const attemptId = randomUUID();
  const writer =
    actorId === "collective"
      ? log.state.composer
      : log.state.participants.find((writer) => writer.id === actorId);
  if (!writer) throw new Error("Unknown saved writer.");
  await log.append({
    type: "generation.started",
    actorId,
    attemptId,
    contextVersion: log.state.collectiveVersion,
    sourceOffsets: actorId === "collective" ? sourceOffsets(log.state) : {},
    messages: [{ role: "user", content: "Saved context" }],
  });
  await log.append({
    type: "text.appended",
    actorId,
    attemptId,
    offset: writer.text.length,
    text,
  });
  if (finished)
    await log.append({
      type: "generation.finished",
      actorId,
      attemptId,
      reason: "budget",
    });
}
async function recover(log: LiveLog) {
  await log.close();
  logs.splice(logs.indexOf(log), 1);
  const resumed = await LiveLog.resume(log.path);
  logs.push(resumed);
  return resumed;
}

describe("chunked writing", () => {
  it("continues after EOS using the saved contribution as append context", async () => {
    const log = await create(config("chunked"));
    let calls = 0;
    const generate: Generate = async (request, onToken) => {
      calls++;
      if (calls === 4) {
        expect(prefix(request)).toBeUndefined();
        expect(user(request).existingText).toBe("A complete thought.");
        await onToken("Then we continue");
        return hold(request.signal);
      }
      const text =
        calls === 1
          ? "A complete thought."
          : calls === 2
            ? "Another position."
            : "We have begun.";
      await onToken(text);
      return { text };
    };
    const controller = controllerFor(log, generate);
    await controller.start();
    await eventually(() =>
      expect(log.state.participants[0]?.text).toBe(
        "A complete thought. Then we continue",
      ),
    );
    await controller.pause();
    expect(calls).toBe(4);
  });

  it("serialises bounded inference, grows the same texts across midword cuts, and feeds the collective into the next cycle", async () => {
    const log = await create(config("chunked"));
    let active = 0;
    let peak = 0;
    const order: string[] = [];
    const generate: Generate = async (request, onToken) => {
      active++;
      peak = Math.max(peak, active);
      try {
        expect(request.config.maxOutputTokens).toBe(96);
        const actor =
          log.state.participants.find((writer) => writer.active)?.id ??
          "collective";
        order.push(actor);
        if (order.length === 1) await onToken("organis");
        else if (order.length === 2) await onToken("Our limits differ");
        else if (order.length === 3) {
          expect(
            user(request).participants.map(
              (participant: { text: string }) => participant.text,
            ),
          ).toEqual(["organis", "Our limits differ"]);
          await onToken("We are organis");
        } else if (order.length === 4) {
          expect(prefix(request)).toBe("organis");
          expect(user(request).collective).toEqual({
            version: 1,
            text: "We are organis",
          });
          await onToken("ing our work");
        } else return hold(request.signal);
        return budget();
      } finally {
        active--;
      }
    };
    const controller = controllerFor(log, generate);
    await controller.start();
    await eventually(() => expect(order).toHaveLength(5));
    await controller.pause();
    expect(peak).toBe(1);
    expect(order).toEqual([
      "participant/a",
      "participant/b",
      "collective",
      "participant/a",
      "participant/b",
    ]);
    expect(log.state.participants[0]?.text).toBe("organising our work");
    expect(log.state.scheduler).toEqual({
      cycle: 1,
      participantIndex: 1,
      phase: "participants",
    });
    expect(log.state.composer.text).toBe("We are organis");
  });

  it("resumes an unfinished prefix in the same scheduled inference after pause", async () => {
    const log = await create(config("chunked"));
    let calls = 0;
    const generate: Generate = async (request, onToken) => {
      if (++calls === 1) await onToken("organis");
      else {
        expect(prefix(request)).toBe("organis");
        await onToken("ing");
      }
      return hold(request.signal);
    };
    const controller = controllerFor(log, generate);
    await controller.start();
    await eventually(() =>
      expect(log.state.participants[0]?.text).toBe("organis"),
    );
    await controller.pause();
    expect(log.state.scheduler.participantIndex).toBe(0);
    await controller.start();
    await eventually(() =>
      expect(log.state.participants[0]?.text).toBe("organising"),
    );
    await controller.pause();
    expect(log.state.scheduler.participantIndex).toBe(0);
    expect(calls).toBe(2);
  });

  it("recovers the durable cursor without repeating completed writers, and retains interrupted text", async () => {
    let log = await create(config("chunked"));
    await log.append({ type: "session.started" });
    await savedAttempt(log, "participant/a", "Completed first continuation");
    await savedAttempt(log, "participant/b", "organis", false);
    log = await recover(log);
    expect(log.state.scheduler).toEqual({
      cycle: 0,
      participantIndex: 1,
      phase: "participants",
    });
    const generate = vi.fn<Generate>(async (request, onToken) => {
      expect(log.state.participants[1]?.active).not.toBeNull();
      expect(prefix(request)).toBe("organis");
      await onToken("ing");
      return hold(request.signal);
    });
    const controller = controllerFor(log, generate);
    await controller.start();
    await eventually(() =>
      expect(log.state.participants[1]?.text).toBe("organising"),
    );
    await controller.pause();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(log.state.participants[0]?.text).toBe(
      "Completed first continuation",
    );
  });

  it("publishes a composer completion recovered at the event boundary before generating the next participant", async () => {
    let log = await create(config("chunked"));
    await log.append({ type: "session.started" });
    await savedAttempt(log, "participant/a", "organis");
    await savedAttempt(log, "participant/b", "Different limits");
    await savedAttempt(log, "collective", "We are organis");
    log = await recover(log);
    expect(log.state.collectiveVersion).toBe(0);
    const generate = vi.fn<Generate>(async (request) => {
      expect(user(request).collective).toEqual({
        version: 1,
        text: "We are organis",
      });
      expect(prefix(request)).toBe("organis");
      return hold(request.signal);
    });
    const controller = controllerFor(log, generate);
    await controller.start();
    await eventually(() => expect(generate).toHaveBeenCalledTimes(1));
    await controller.pause();
    expect(log.state.scheduler.cycle).toBe(1);
  });
});

describe("fixed percentage sources", () => {
  it("finishes every source slice when a slow composer exceeds the elapsed duration setting", async () => {
    const settings = config("fixed");
    settings.live.maxDurationMs = 1_000;
    const log = await create(settings);
    const generate = vi.fn<Generate>(async (request, onToken) => {
      await onToken("We continue ");
      if (generate.mock.calls.length === 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1_200));
        request.signal.throwIfAborted();
      }
      return budget();
    });
    const controller = controllerFor(log, generate);
    await controller.start();
    await eventually(() => expect(log.state.status).toBe("ended"));
    expect(log.state.elapsedMs).toBeGreaterThanOrEqual(
      settings.live.maxDurationMs,
    );
    expect(log.state.scheduler.phase).toBe("complete");
    expect(generate).toHaveBeenCalledTimes(percentageRanges(score).length);
    expect(log.state.participants.map((writer) => writer.text)).toEqual(
      score.voices.map((voice) => voice.text),
    );
  });

  it("resumes unfinished fixed sources after their elapsed duration setting", async () => {
    const settings = config("fixed");
    const log = await create(settings);
    await log.append({ type: "session.started" });
    await log.append({ type: "source.revealed", step: 0 });
    await log.append({
      type: "session.paused",
      elapsedMs: settings.live.maxDurationMs,
      reason: "A long preparation.",
    });
    const generate = vi.fn<Generate>(async (_request, onToken) => {
      await onToken("We continue ");
      return budget();
    });
    const controller = controllerFor(log, generate);
    await controller.start();
    await eventually(() => expect(log.state.status).toBe("ended"));
    expect(log.state.scheduler.phase).toBe("complete");
    expect(generate).toHaveBeenCalledTimes(percentageRanges(score).length);
  });

  it.each([false, true])(
    "completes a recovered final composer result offline without another inference (duration exhausted: %s)",
    async (exhausted) => {
      const settings = config("fixed");
      settings.composer.provider = "openai";
      let log = await create(settings);
      await log.append({ type: "session.started" });
      for (let step = 0; step < percentageRanges(score).length; step++) {
        await log.append({ type: "source.revealed", step });
        await savedAttempt(log, "collective", step === 0 ? "We organis" : "e");
      }
      if (exhausted)
        await log.append({
          type: "session.paused",
          elapsedMs: settings.live.maxDurationMs,
          reason: "Saved at the session deadline.",
        });
      log = await recover(log);
      vi.stubEnv("OPENAI_API_KEY", "");
      const generate = vi.fn<Generate>();
      const controller = controllerFor(log, generate);
      await controller.start();
      await eventually(() => expect(log.state.status).toBe("ended"));
      expect(generate).not.toHaveBeenCalled();
      expect(log.state.publishedOffset).toBe(log.state.composer.text.length);
      expect(log.state.participants.map((writer) => writer.text)).toEqual(
        score.voices.map((voice) => voice.text),
      );
    },
  );

  it("reveals original percentage prefixes, invokes only the composer and ends after the final slice", async () => {
    const settings = config("fixed");
    settings.live.participants.provider = "openai";
    vi.stubEnv("OPENAI_API_KEY", "");
    const log = await create(settings);
    const observed: string[][] = [];
    const generate = vi.fn<Generate>(async (request, onToken) => {
      expect(request.config.model).toBe("composer");
      observed.push(
        user(request).participants.map(
          (participant: { text: string }) => participant.text,
        ),
      );
      await onToken(observed.length === 1 ? "We organis" : "e");
      return budget();
    });
    const controller = controllerFor(log, generate);
    await controller.start();
    await eventually(() => expect(log.state.status).toBe("ended"));
    const ranges = percentageRanges(score);
    expect(observed).toEqual(
      ranges.map((range) =>
        score.voices.map((voice) => {
          const characters = Array.from(voice.text);
          return characters
            .slice(0, Math.floor((characters.length * range.to) / 100))
            .join("");
        }),
      ),
    );
    expect(observed[0]?.[0]).toBe("organ");
    expect(log.state.participants.map((writer) => writer.text)).toEqual(
      score.voices.map((voice) => voice.text),
    );
    expect(generate).toHaveBeenCalledTimes(5);
    expect(log.state.collectiveVersion).toBe(5);
    expect(log.state.scheduler.phase).toBe("complete");
    expect(
      (await readLiveRun(log.path)).events.filter(
        (record) => record.event.type === "source.revealed",
      ),
    ).toHaveLength(5);
  });

  it("does not reveal a second copy of an admitted source slice after a crash during composition", async () => {
    let log = await create(config("fixed"));
    await log.append({ type: "session.started" });
    await log.append({ type: "source.revealed", step: 0 });
    await savedAttempt(log, "collective", "We organis", false);
    log = await recover(log);
    const generate = vi.fn<Generate>(async (request, onToken) => {
      expect(prefix(request)).toBe("We organis");
      expect(user(request).participants[0].text).toBe("organ");
      await onToken("e");
      return hold(request.signal);
    });
    const controller = controllerFor(log, generate);
    await controller.start();
    await eventually(() => expect(log.state.composer.text).toBe("We organise"));
    await controller.pause();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(log.state.scheduler).toEqual({
      cycle: 0,
      participantIndex: 0,
      phase: "collective",
    });
    expect(
      (await readLiveRun(log.path)).events.filter(
        (record) => record.event.type === "source.revealed",
      ),
    ).toHaveLength(1);
  });

  it("validates frozen scores and prevents participant generation or out-of-order reveal in fixed mode", async () => {
    const settings = config("fixed");
    const { score: _score, ...withoutScore } = settings.live;
    expect(
      liveConfigSchema.safeParse({ ...settings, live: withoutScore }).success,
    ).toBe(false);
    const mismatched = config("fixed");
    mismatched.live.score = { ...score, voices: [...score.voices].reverse() };
    await expect(create(mismatched)).rejects.toThrow("same IDs and order");
    const log = await create(settings);
    await log.append({ type: "session.started" });
    await expect(
      savedAttempt(log, "participant/a", "Invalid"),
    ).rejects.toThrow();
    await expect(
      log.append({ type: "source.revealed", step: 1 }),
    ).rejects.toThrow();
    await log.append({ type: "source.revealed", step: 0 });
    await expect(
      log.append({ type: "source.revealed", step: 0 }),
    ).rejects.toThrow();
  });
});
