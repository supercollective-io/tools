import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { fixedComposerExperiment } from "../src/composer-experiment.ts";
import { LiveController } from "../src/live.ts";
import { LiveLog } from "../src/live-runs.ts";
import { configSchema, scoreSchema } from "../src/schema.ts";

it("composes all eight frozen contributions in order without participant inference", async () => {
  const score = scoreSchema.parse(
    JSON.parse(await readFile("examples/score.json", "utf8")),
  );
  const config = configSchema.parse(
    JSON.parse(await readFile("examples/composer-baseline.json", "utf8")),
  );
  config.composer.maxOutputTokens = 4096;
  config.simulation = {
    participants: {
      ...config.composer,
      provider: "openai",
      rawPrefill: undefined,
      think: undefined,
      numCtx: undefined,
    },
    instructions: "Unused private participant instructions",
    maxRounds: 1,
    concurrency: 1,
    intervalMs: 0,
    history: { maxTurns: 1, maxCharacters: 1000 },
  };
  const inputs = fixedComposerExperiment(score, config);
  expect(inputs.config).not.toHaveProperty("simulation");
  const directory = await mkdtemp(join(tmpdir(), "composer-experiment-"));
  const log = await LiveLog.create(join(directory, "run.jsonl"), {
    type: "live.created",
    ...inputs,
  });
  let calls = 0;
  const controller = new LiveController(log, async (request, onToken) => {
    calls++;
    expect(request.config.maxOutputTokens).toBe(
      config.composer.maxOutputTokens,
    );
    const source = JSON.parse(
      request.messages.find((message) => message.role === "user")?.content ??
        "{}",
    );
    expect(source.participants).toHaveLength(8);
    for (const [index, voice] of score.voices.entries()) {
      const characters = Array.from(voice.text);
      expect(source.participants[index].text).toBe(
        characters
          .slice(0, Math.floor((characters.length * calls) / 5))
          .join(""),
      );
    }
    const text = calls === 1 ? "We can begin." : " Our limits still matter.";
    await onToken(text);
    return { text };
  });
  try {
    await controller.start();
    await vi.waitFor(() => expect(log.state.status).toBe("ended"));
    expect(calls).toBe(5);
    expect(log.state.scheduler.cycle).toBe(5);
    expect(log.state.participants.map((writer) => writer.text)).toEqual(
      score.voices.map((voice) => voice.text),
    );
    expect(log.state.composer.text).toBe(
      `We can begin.${" Our limits still matter.".repeat(4)}`,
    );
    expect(score).toEqual(inputs.config.live.score);
  } finally {
    await controller.close();
    await log.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it.each([undefined, 256])(
  "preserves saved serial budget %s on resume",
  async (serialRequestTokens) => {
    const score = scoreSchema.parse({
      schemaVersion: 2,
      title: "A fixed source",
      chunkPercent: 100,
      voices: [{ id: "a", name: "A", text: "I can help on Tuesday." }],
    });
    const config = configSchema.parse({
      schemaVersion: 1,
      instructions: "Compose from this source.",
      composer: {
        provider: "ollama",
        model: "fixture",
        maxOutputTokens: 4096,
        timeoutMs: 1000,
      },
      history: { maxPassages: 0, maxCharacters: 0 },
    });
    const inputs = fixedComposerExperiment(score, config);
    if (serialRequestTokens === undefined)
      delete inputs.config.live.serialRequestTokens;
    else inputs.config.live.serialRequestTokens = serialRequestTokens;
    const directory = await mkdtemp(join(tmpdir(), "composer-resume-"));
    const path = join(directory, "run.jsonl");
    const saved = await LiveLog.create(path, {
      type: "live.created",
      ...inputs,
    });
    await saved.append({ type: "session.started" });
    await saved.append({ type: "source.revealed", step: 0 });
    await saved.append({
      type: "session.paused",
      reason: "user",
      elapsedMs: 0,
    });
    await saved.close();
    const log = await LiveLog.resume(path);
    const budgets: number[] = [];
    const controller = new LiveController(log, async (request, onToken) => {
      budgets.push(request.config.maxOutputTokens);
      await onToken("We can help on Tuesday.");
      return { text: "We can help on Tuesday." };
    });
    try {
      await controller.start();
      await vi.waitFor(() => expect(log.state.status).toBe("ended"));
      expect(budgets).toEqual([serialRequestTokens ?? 96]);
    } finally {
      await controller.close();
      await log.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
