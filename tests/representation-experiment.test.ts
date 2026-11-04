import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  fullPacket,
  packetTokens,
  readerMessages,
} from "../src/composer-evidence.ts";
import type { Generate, PromptMessage } from "../src/models.ts";
import {
  representationCases,
  representationPrompt,
  runRepresentationExperiment,
} from "../src/representation-experiment.ts";

let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

const double: Generate = async (request, onToken) => {
  let text = " We are still finding the words.";
  if (request.config.model === "gpt-6-luna") {
    const sources = JSON.parse(request.messages[1]?.content ?? "{}")
      .sources as { sourceId: string; text: string }[];
    text = JSON.stringify({
      records: sources.map((source) => ({
        sourceId: source.sourceId,
        quote: source.text.split(".")[0],
        kind: "experience",
        interpretation: "An attributed experience.",
      })),
    });
  }
  await onToken(text);
  return {
    text,
    finishReason: "stop",
    usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
  };
};

it("freezes unfinished and developed snapshots with no future text in reader or composer prompts", async () => {
  const cases = await representationCases();
  const partial = cases.find(({ id }) => id === "belonging-unfinished");
  const developed = cases.find(({ id }) => id === "belonging-developed");
  if (!partial || !developed) throw new Error("Missing snapshot.");
  const ari = partial.sources.find(({ id }) => id === "ari");
  expect(ari?.text.slice(0, ari.availableTo)).toMatch(/wel$/u);
  const packet = fullPacket(partial.sources);
  expect(packet.text).not.toContain("coming, even with the shutters down");
  expect(JSON.stringify(readerMessages(partial.sources))).not.toContain(
    "coming, even with the shutters down",
  );
  expect(fullPacket(developed.sources).text).toContain(
    "welcoming, even with the shutters down",
  );
  const messages = representationPrompt(
    partial,
    packet.text,
    "Common instructions.",
  );
  expect(messages.at(-1)).toEqual({
    role: "assistant",
    content: partial.prefix,
  });
  expect(JSON.stringify(messages)).not.toContain("Frozen assessment key");
});

it("keeps all paired prefixes and common prompts identical, reserves count calls, and saves exact streamed text", async () => {
  directory = await mkdtemp(join(tmpdir(), "representation-"));
  const ledgerPath = join(directory, "ledger.jsonl");
  const prompts: PromptMessage[][] = [];
  const result = await runRepresentationExperiment({
    outputDir: join(directory, "run"),
    ledgerPath,
    generate: async (request, token) => {
      if (request.config.model === "gpt-6.1-terra")
        prompts.push(request.messages);
      return double(request, token);
    },
    countTokens: async (text) => {
      const events = (await readFile(ledgerPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(events.at(-1)).toMatchObject({
        type: "reserved",
        maxOutputTokens: 1,
      });
      return packetTokens(text);
    },
  });
  expect(result.outcomes).toHaveLength(9);
  expect(result.outcomes.every(({ status }) => status === "completed")).toBe(
    true,
  );
  for (let i = 0; i < 9; i += 3) {
    const common = (messages: PromptMessage[]) => [
      messages[0],
      messages[1],
      messages[3],
    ];
    expect(common(prompts[i + 1] ?? [])).toEqual(common(prompts[i] ?? []));
    expect(common(prompts[i + 2] ?? [])).toEqual(common(prompts[i] ?? []));
  }
  for (const outcome of result.outcomes)
    expect(outcome.collectiveText).toBe(
      `${String(outcome.prefix)} We are still finding the words.`,
    );
  const ledger = (await readFile(ledgerPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(
    ledger.filter(
      (event) => event.type === "finished" && event.finishReason === "counted",
    ),
  ).toHaveLength(9);
  expect(
    ledger
      .filter(
        (event) =>
          event.type === "finished" && event.finishReason === "counted",
      )
      .every((event) => event.actualUsd === undefined),
  ).toBe(true);
});

it("does not compose an over-budget packet and preserves failures without raw provider errors", async () => {
  directory = await mkdtemp(join(tmpdir(), "representation-budget-"));
  let composerCalls = 0;
  const result = await runRepresentationExperiment({
    outputDir: join(directory, "run"),
    ledgerPath: join(directory, "ledger.jsonl"),
    countTokens: async () => 801,
    generate: async (request, onToken) => {
      if (request.config.model === "gpt-6.1-terra") {
        composerCalls++;
        await onToken(" partial");
        throw new Error("secret upstream body");
      }
      return double(request, onToken);
    },
  });
  expect(composerCalls).toBe(3); // Only the unbounded full-text controls.
  expect(
    result.outcomes.filter(({ failedStage }) => failedStage === "token_count"),
  ).toHaveLength(6);
  expect(
    result.outcomes
      .filter(({ failedStage }) => failedStage === "composer")
      .every(({ partialText }) => partialText === " partial"),
  ).toBe(true);
  const saved = await readFile(join(result.directory, "outcomes.json"), "utf8");
  expect(saved).not.toContain("secret upstream body");
});
