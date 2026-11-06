import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import {
  contributionDesignSchema,
  prepareCorpus,
  readCorpusBundle,
  runContributionPilot,
  wordCount,
  writeCorpusBundle,
} from "../src/contribution-corpus.ts";
import type { ModelRequest } from "../src/models.ts";
import { scoreSchema } from "../src/schema.ts";

const design = contributionDesignSchema.parse(
  JSON.parse(await readFile("examples/contribution-design.json", "utf8")),
);
const config = JSON.parse(
  await readFile("examples/contribution-generator.json", "utf8"),
);
const prepared = prepareCorpus(design, config);
const directories: string[] = [];
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing test fixture value.");
  return value;
}
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "contribution-corpus-"));
  directories.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

it("reproduces all assignments, preserves exact counts and compatibility, and spreads pairings", () => {
  expect(prepareCorpus(design, config)).toEqual(prepared);
  const changed = prepareCorpus({ ...design, seed: design.seed + 1 }, config);
  expect(changed.slots).not.toEqual(prepared.slots);
  for (const bundle of [prepared, changed]) {
    expect(bundle.slots).toHaveLength(64);
    expect(new Set(bundle.slots.map((s) => s.id)).size).toBe(64);
    for (const dimension of bundle.coverage.full.dimensions)
      for (const option of dimension.options)
        expect(option.actual).toBe(option.targetIn64);
    for (const situation of bundle.coverage.full.situations)
      expect(situation.actual).toBe(situation.targetIn64);
    for (const slot of bundle.slots) {
      const situation = design.situations.find(
        (s) => s.id === slot.situationId,
      );
      for (const [key, values] of Object.entries(situation?.allowed ?? {}))
        expect(values).toContain(slot.assignments[key]);
    }
    const actualCollisions = bundle.coverage.full.pairs.reduce(
      (sum, pair) =>
        sum +
        Object.values(pair.counts).reduce((s, n) => s + (n * (n - 1)) / 2, 0),
      0,
    );
    expect(actualCollisions).toBe(bundle.optimisation.finalPairCollisions);
    expect(actualCollisions).toBeLessThan(
      bundle.optimisation.initialPairCollisions,
    );
  }
});

it("selects varied nested subsets, rather than assuming the first IDs form the pilot", () => {
  const subsets = prepared.subsets;
  expect(subsets.map((s) => s.size)).toEqual([8, 16, 32, 64]);
  for (const subset of subsets) {
    expect(new Set(subset.ids).size).toBe(subset.size);
    expect(subsets.at(-1)?.ids.slice(0, subset.size)).toEqual(subset.ids);
  }
  expect(prepared.requests.map((r) => r.id)).toEqual(subsets[0]?.ids);
  expect(subsets[0]?.ids).not.toEqual(
    prepared.slots.slice(0, 8).map((s) => s.id),
  );
  for (const key of ["interpretation", "tone", "form"])
    expect(
      prepared.coverage.pilot.dimensions
        .find((d) => d.id === key)
        ?.options.filter((o) => o.actual > 0).length,
    ).toBeGreaterThanOrEqual(5);
});

it("rejects malformed, unknown and infeasible assignments rather than relaxing their counts", () => {
  const wrongCounts = structuredClone(design);
  required(required(wrongCounts.dimensions[0]).options[0]).count++;
  expect(() => prepareCorpus(wrongCounts, config)).toThrow(/total 64/u);
  const unknown = structuredClone(design);
  required(unknown.situations[0]).allowed.missing = ["unknown"];
  expect(() => prepareCorpus(unknown, config)).toThrow(/compatibility/u);
  const impossible = structuredClone(design);
  for (const situation of impossible.situations)
    situation.allowed.interpretation = ["personal"];
  expect(() => prepareCorpus(impossible, config)).toThrow(/Infeasible/u);
  const duplicated = structuredClone(design);
  required(duplicated.dimensions[1]).id = required(duplicated.dimensions[0]).id;
  expect(() => prepareCorpus(duplicated, config)).toThrow(/unique/u);
});

it("checks the committed bundle offline and rejects altered prompts, IDs or model configuration", async () => {
  expect(
    await readCorpusBundle("examples/contribution-pilot/bundle.json"),
  ).toEqual(prepared);
  const path = join(await directory(), "bundle.json");
  const changed = structuredClone(prepared);
  required(required(changed.requests[0]).messages[1]).content +=
    "Extra instruction.";
  await writeFile(path, JSON.stringify(changed));
  await expect(readCorpusBundle(path)).rejects.toThrow(/does not match/u);
  const changedModel = structuredClone(prepared);
  changedModel.generator.model = "different-model";
  await writeFile(path, JSON.stringify(changedModel));
  await expect(readCorpusBundle(path)).rejects.toThrow(/does not match/u);
  required(changed.requests[0]).id = "p999";
  await expect(
    runContributionPilot(
      changed,
      join(await directory(), "never-created"),
      async () => {
        throw new Error("Must not dispatch.");
      },
      new AbortController().signal,
    ),
  ).rejects.toThrow(/Invalid pilot/u);
});

it("prepares via CLI without credentials or provider access and never overwrites an existing preparation", async () => {
  const root = await directory();
  const output = join(root, "prepared");
  const args = [
    resolve("src/contribution-cli.ts"),
    "prepare",
    "--design",
    resolve("examples/contribution-design.json"),
    "--config",
    resolve("examples/contribution-generator.json"),
    "--out",
    output,
  ];
  const env = { ...process.env, OPENAI_API_KEY: "", LANGSMITH_TRACING: "true" };
  const { stdout } = await promisify(execFile)(process.execPath, args, { env });
  expect(stdout).toContain("No models contacted");
  expect(await readCorpusBundle(join(output, "bundle.json"))).toEqual(prepared);
  await expect(writeCorpusBundle(output, prepared)).rejects.toThrow(/EEXIST/u);
  const invalid = args.map((a) => (a === "prepare" ? "preapre" : a));
  await expect(
    promisify(execFile)(process.execPath, invalid, { env }),
  ).rejects.toThrow();
});

it("makes exactly eight isolated calls, preserves raw text and usage, and exports no private labels", async () => {
  const output = join(await directory(), "pilot");
  const requests: Pick<ModelRequest, "config" | "messages">[] = [];
  const result = await runContributionPilot(
    prepared,
    output,
    async (request, onToken) => {
      const number = requests.push(
        structuredClone({
          config: request.config,
          messages: request.messages,
        }),
      );
      const text = `  Contribution ${number}: ${"thought ".repeat(number === 1 ? 30 : 110)}\n`;
      await onToken(text.slice(0, 15));
      await onToken(text.slice(15));
      return {
        text,
        finishReason: "stop",
        usage: { inputTokens: 80, outputTokens: 120, totalTokens: 200 },
      };
    },
    new AbortController().signal,
  );
  expect(requests).toHaveLength(8);
  expect(result.status).toBe("awaiting-editorial-review");
  expect(result.contributions[0]?.flags).toContain("length-review");
  for (const [index, request] of requests.entries()) {
    expect(request.messages).toEqual(prepared.requests[index]?.messages);
    expect(request.messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(JSON.stringify(request.messages)).not.toContain("Contribution 1:");
    expect(JSON.parse(request.messages[1]?.content ?? "{}").invitation).toEqual(
      design.invitation,
    );
  }
  const score = scoreSchema.parse(
    JSON.parse(await readFile(join(output, "score.json"), "utf8")),
  );
  expect(score.voices).toHaveLength(8);
  expect(score.voices[0]?.text).toBe(result.contributions[0]?.text);
  for (const voice of score.voices)
    expect(Object.keys(voice).sort()).toEqual(["id", "name", "text"]);
  const events = (await readFile(join(output, "events.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  expect(
    events
      .filter((e) => e.type === "completed")
      .every((e) => e.usage.totalTokens === 200),
  ).toBe(true);
  expect(events.filter((e) => e.type === "prefix")).toHaveLength(16);
  await expect(
    runContributionPilot(
      prepared,
      output,
      async () => {
        throw new Error("Must not dispatch.");
      },
      new AbortController().signal,
    ),
  ).rejects.toThrow(/EEXIST/u);
});

it("stops at a failed request, preserves streamed prefixes and excludes raw provider errors", async () => {
  const output = join(await directory(), "failed");
  let calls = 0;
  const result = await runContributionPilot(
    prepared,
    output,
    async (_request, onToken) => {
      calls++;
      if (calls === 1)
        return { text: "First contribution.", finishReason: "stop" };
      await onToken("Interrupted thought");
      throw Object.assign(
        new Error("SECRET provider response and credentials"),
        { code: "timeout" },
      );
    },
    new AbortController().signal,
  );
  expect(calls).toBe(2);
  expect(result).toMatchObject({
    status: "incomplete",
    completed: 1,
    failure: { code: "timeout" },
  });
  const journal = await readFile(join(output, "events.jsonl"), "utf8");
  expect(journal).toContain("Interrupted thought");
  expect(journal).not.toContain("SECRET");
  await expect(readFile(join(output, "score.json"))).rejects.toThrow(/ENOENT/u);
});

it.each(["empty", "truncated", "stream-mismatch", "aborted"])(
  "does not accept %s output",
  async (kind) => {
    const controller = new AbortController();
    const output = join(await directory(), kind);
    let calls = 0;
    const result = await runContributionPilot(
      prepared,
      output,
      async (_request, onToken) => {
        calls++;
        if (kind === "stream-mismatch") await onToken("Different text");
        if (kind === "aborted") controller.abort();
        return {
          text: kind === "empty" ? "  " : "Saved text",
          finishReason: kind === "truncated" ? "length" : "stop",
        };
      },
      controller.signal,
    );
    expect(calls).toBe(1);
    expect(result.failure?.code).toBe(kind);
    expect(result.completed).toBe(0);
  },
);

it("uses the documented word convention", () => {
  expect(wordCount("  I'd like\nlong-term change.  ")).toBe(4);
  expect(wordCount(" \n")).toBe(0);
});
