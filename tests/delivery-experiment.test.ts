import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  deliveryInputs,
  pairReservation,
  runDeliveryExperiment,
} from "../src/delivery-experiment.ts";
import { configSchema, scoreSchema } from "../src/schema.ts";

let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

async function inputs() {
  const config = configSchema.parse(
    JSON.parse(await readFile("examples/composer-terra.json", "utf8")),
  );
  const score = scoreSchema.parse(
    JSON.parse(await readFile("examples/score.json", "utf8")),
  );
  return { config, score, ...deliveryInputs(score, config) };
}

it("reuses four exact original prefixes and excludes unrevealed source from the first packet", async () => {
  const { initial, update, sources, score } = await inputs();
  const firstMessage = initial[1];
  if (!firstMessage) throw new Error("Missing first source packet.");
  const first = JSON.parse(firstMessage.content);
  const second = JSON.parse(update.content);
  expect(sources.map(({ id }) => id)).toEqual(["chris", "rosa", "alex", "mo"]);
  for (const source of sources) {
    const voice = score.voices.find(({ id }) => id === source.id);
    if (!voice) throw new Error("Missing original voice.");
    const prefix = Array.from(voice.text)
      .slice(0, Math.floor((Array.from(voice.text).length * 4) / 5))
      .join("");
    const start = first.participants.find(
      (participant: { id: string }) => participant.id === source.id,
    );
    const end = second.participants.find(
      (participant: { id: string }) => participant.id === source.id,
    );
    expect(start.text).toBe(prefix);
    expect(end.text).toBe(voice.text);
    expect(end.newText).toBe(voice.text.slice(prefix.length));
    expect(end.newFrom).toBe(prefix.length);
    expect(firstMessage.content).not.toContain(end.newText);
  }
  expect(JSON.stringify(initial)).not.toContain("assessment");
  expect(first).not.toHaveProperty("existingText");
  expect(second).not.toHaveProperty("existingText");
});

it("reserves both ceilings and reused output before dispatch without changing provider settings", async () => {
  directory = await mkdtemp(join(tmpdir(), "delivery-experiment-"));
  const ledgerPath = join(directory, "ledger.jsonl");
  const { config, initial, update } = await inputs();
  const envelope = pairReservation(
    initial,
    update,
    config,
    new AbortController().signal,
  );
  expect(envelope.config.maxOutputTokens).toBe(8192);
  expect(envelope.messages.at(-1)?.content.length).toBe(4096);
  const prompts = new Set<string>();
  const result = await runDeliveryExperiment({
    outputDir: join(directory, "run"),
    ledgerPath,
    pair: async (options) => {
      const reservations = (await readFile(ledgerPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(reservations.at(-1)).toMatchObject({
        type: "reserved",
        maxOutputTokens: 8192,
      });
      expect(options.config.maxOutputTokens).toBe(4096);
      prompts.add(JSON.stringify([options.initial, options.update]));
      await options.onRecord({ kind: "delta", delta: "We" });
      await options.onRecord({ kind: "delta", delta: " continue." });
      return {
        text: "We continue.",
        finishReason: "completed",
        usage: { inputTokens: 50, outputTokens: 5, totalTokens: 55 },
      };
    },
  });
  expect(prompts.size).toBe(1);
  expect(result.outcomes).toHaveLength(9);
  expect(result.outcomes.every(({ status }) => status === "completed")).toBe(
    true,
  );
  await expect(
    runDeliveryExperiment({ outputDir: join(directory, "run"), ledgerPath }),
  ).rejects.toThrow();
});

it("keeps partial output and the reservation, skips unsupported steering, and stops on a later generic failure", async () => {
  directory = await mkdtemp(join(tmpdir(), "delivery-failure-"));
  const ledgerPath = join(directory, "ledger.jsonl");
  const result = await runDeliveryExperiment({
    outputDir: join(directory, "run"),
    ledgerPath,
    pair: async (options) => {
      if (options.policy === "steer") {
        await options.onRecord({ kind: "delta", delta: "We might" });
        await options.onRecord({
          kind: "failed",
          code: "steering_not_supported",
        });
        throw new Error("private provider error");
      }
      if (options.phase === "during") throw new Error("another private error");
      await options.onRecord({ kind: "delta", delta: "We continue." });
      return {
        text: "We continue.",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      };
    },
  });
  expect(result.outcomes.map(({ status }) => status)).toEqual([
    "completed",
    "completed",
    "failed",
    "not_dispatched",
    "failed",
  ]);
  expect(result.outcomes[2]).toMatchObject({ prefix: "We might" });
  const outcomes = await readFile(
    join(result.directory, "outcomes.json"),
    "utf8",
  );
  expect(outcomes).not.toContain("private");
  const ledger = (await readFile(ledgerPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(ledger.at(-1)).toMatchObject({ outcome: "failure" });
  expect(ledger.at(-1)).not.toHaveProperty("actualUsd");
});
