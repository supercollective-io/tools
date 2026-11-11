import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPrompt, contributionsFor } from "../src/composition.ts";
import { Controller } from "../src/controller.ts";
import type { Generate, PromptMessage } from "../src/models.ts";
import { RunLog, readRun } from "../src/runs.ts";
import type { Config, ContinuousScore, Contribution } from "../src/schema.ts";

function contribution(
  participantId: string,
  text: string,
  id = participantId,
): Contribution {
  return {
    id,
    participantId,
    text,
    source: "script",
    respondingToPassageId: null,
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
    instructions: "Keep disagreement visible.",
    history: { maxPassages: 2, maxCharacters: 1_000 },
  };
}

function score(): ContinuousScore {
  return {
    schemaVersion: 2,
    title: "Shared conditions",
    chunkPercent: 100,
    voices: [
      { id: "a", name: "A", text: "We need safe homes" },
      { id: "b", name: "B", text: "We need secure work" },
    ],
  };
}

function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected a fixture item.");
  return value;
}

function sourceFrom(messages: PromptMessage[]) {
  return JSON.parse(
    present(messages.find((message) => message.role === "user")).content,
  );
}

describe("composition source material", () => {
  it("preserves current inputs and bounded collective history as separate source material", () => {
    const contributions = [
      contribution("a", "I can make calls during my break."),
      contribution("b", "I cannot take on another organising role."),
      contribution("c", ""),
    ];
    const messages = buildPrompt(
      { ...config(), history: { maxPassages: 1, maxCharacters: 100 } },
      contributions,
      [
        { id: "old", text: "Earlier collective thought" },
        { id: "latest", text: "A recent collective question" },
      ],
    );
    expect(sourceFrom(messages)).toEqual({
      contributions,
      recentPassages: [{ id: "latest", text: "A recent collective question" }],
    });
    const instruction = present(
      messages.find((message) => message.role === "system"),
    ).content;
    expect(instruction).toContain(config().instructions);
  });
});

describe("acceptance of generated passages", () => {
  let directory: string;
  let activeLogs: RunLog[];

  beforeEach(async () => {
    directory = await mkdtemp(
      join(tmpdir(), "collective-microphone-composition-"),
    );
    activeLogs = [];
  });

  afterEach(async () => {
    await Promise.all(activeLogs.map((log) => log.close()));
    await rm(directory, { recursive: true, force: true });
  });

  async function createLog() {
    const log = await RunLog.create(join(directory, "run.jsonl"), {
      type: "run.created",
      score: score(),
      config: config(),
    });
    activeLogs.push(log);
    return log;
  }

  it("accepts a complete passage longer than the mean input unchanged", async () => {
    const log = await createLog();
    const text =
      " \nWe need security at home and at work, but those demands can pull us in different directions. What would let us act together without asking the people with least time to carry the most responsibility?\n ";
    const generate = vi.fn<Generate>().mockResolvedValue({ text });
    await new Controller(log, generate).advance(
      new AbortController().signal,
      vi.fn(),
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(log.state.passages.map((passage) => passage.text)).toEqual([text]);
    expect(log.state.complete).toBe(true);
    const persisted = await readRun(log.path);
    const accepted = persisted.events.filter(
      (record) => record.event.type === "passage.accepted",
    );
    expect(accepted).toHaveLength(1);
    expect(present(accepted[0]).event).toMatchObject({
      type: "passage.accepted",
      text,
    });
    expect(
      persisted.events.some(
        (record) => record.event.type === "generation.failed",
      ),
    ).toBe(false);
    expect(persisted.state.passages.map((passage) => passage.text)).toEqual([
      text,
    ]);
  });

  it("rejects a provider token cutoff, keeps the batch pending and permits a manual retry", async () => {
    const log = await createLog();
    const fragment = "We need";
    const generate = vi
      .fn<Generate>()
      .mockImplementationOnce(async (_request, onToken) => {
        onToken(fragment);
        throw Object.assign(new Error("Provider token limit reached"), {
          code: "truncated",
        });
      })
      .mockResolvedValueOnce({ text: "We need shared security" });
    const onToken = vi.fn();
    const controller = new Controller(log, generate);
    await expect(
      controller.advance(new AbortController().signal, onToken),
    ).rejects.toThrow(/cut off.*not accepted/i);
    expect(onToken).toHaveBeenCalledWith(fragment);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(log.state.pending).toEqual(contributionsFor(score(), 0, null));
    expect(log.state.attemptId).toBeNull();
    expect(log.state.passages).toEqual([]);
    const failed = await readRun(log.path);
    expect(present(failed.events.at(-1)).event).toMatchObject({
      type: "generation.failed",
      reason: "failed",
      code: "truncated",
    });
    expect(
      failed.events.some((event) => event.event.type === "passage.accepted"),
    ).toBe(false);
    await controller.advance(new AbortController().signal, vi.fn());
    expect(present(generate.mock.calls[1])[0].messages).toEqual(
      present(generate.mock.calls[0])[0].messages,
    );
    expect(
      sourceFrom(present(generate.mock.calls[1])[0].messages).recentPassages,
    ).toEqual([]);
    expect(log.state.admitted).toHaveLength(1);
    expect(log.state.passages.map((passage) => passage.text)).toEqual([
      "We need shared security",
    ]);
  });
});
