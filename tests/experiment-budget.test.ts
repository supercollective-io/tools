import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createBudgetedGenerate } from "../src/experiment-budget.ts";
import type { Generate, ModelRequest } from "../src/models.ts";

let directory = "";
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = "";
});

async function ledgerPath(): Promise<string> {
  directory = await mkdtemp(join(tmpdir(), "composer-budget-"));
  return join(directory, "runs", "budget.jsonl");
}

function request(maxOutputTokens = 20): ModelRequest {
  return {
    config: {
      provider: "openai",
      model: "gpt-6-luna",
      maxOutputTokens,
      timeoutMs: 1_000,
    },
    messages: [{ role: "user", content: "Compose from these contributions." }],
    signal: new AbortController().signal,
  };
}

const noTokens = () => {};

it("rejects a request over the configured total before dispatch", async () => {
  const path = await ledgerPath();
  const generate = vi.fn<Generate>().mockResolvedValue({ text: "unused" });
  const budgeted = createBudgetedGenerate(generate, {
    ledgerPath: path,
    totalBudgetUsd: 0.000001,
  });

  await expect(budgeted(request(), noTokens)).rejects.toThrow(/remaining/u);
  expect(generate).not.toHaveBeenCalled();
});

it.each([
  ["missing", {}],
  ["partial", { inputTokens: 10 }],
  ["negative", { inputTokens: -1, outputTokens: 4 }],
  ["fractional", { inputTokens: 1.5, outputTokens: 4 }],
  ["inconsistent total", { inputTokens: 2, outputTokens: 4, totalTokens: 9 }],
])("keeps the full reservation when usage is %s", async (_label, usage) => {
  const path = await ledgerPath();
  const generate = vi.fn<Generate>().mockResolvedValue({
    text: "result",
    ...(Object.keys(usage).length ? { usage } : {}),
  });
  const budgeted = createBudgetedGenerate(generate, {
    ledgerPath: path,
    totalBudgetUsd: 0.00004,
  });
  await budgeted(request(), noTokens);

  const rows = (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(rows).toHaveLength(2);
  expect(rows[1].outcome).toBe(
    Object.keys(usage).length ? "usage_invalid" : "usage_unavailable",
  );
  expect(rows[1]).not.toHaveProperty("actualUsd");

  const afterRestart = createBudgetedGenerate(generate, {
    ledgerPath: path,
    totalBudgetUsd: 0.00004,
  });
  await expect(afterRestart(request(), noTokens)).rejects.toThrow(/remaining/u);
  expect(generate).toHaveBeenCalledTimes(1);
});

it("retains a reservation after provider failure and saves no raw error", async () => {
  const path = await ledgerPath();
  const generate = vi
    .fn<Generate>()
    .mockRejectedValue(new Error("secret provider detail"));
  const budgeted = createBudgetedGenerate(generate, {
    ledgerPath: path,
    totalBudgetUsd: 0.00004,
  });

  await expect(budgeted(request(), noTokens)).rejects.toThrow(
    /reservation remains held/u,
  );
  const source = await readFile(path, "utf8");
  expect(source).not.toContain("secret provider detail");
  expect(JSON.parse(source.trim().split("\n")[1] ?? "{}").outcome).toBe(
    "failure",
  );
  const afterRestart = createBudgetedGenerate(generate, {
    ledgerPath: path,
    totalBudgetUsd: 0.00004,
  });
  await expect(afterRestart(request(), noTokens)).rejects.toThrow(/remaining/u);
  expect(generate).toHaveBeenCalledTimes(1);
});

it("settles a reservation using valid known usage", async () => {
  const path = await ledgerPath();
  const generate = vi.fn<Generate>().mockResolvedValue({
    text: "result",
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    finishReason: "stop",
  });
  const budgeted = createBudgetedGenerate(generate, {
    ledgerPath: path,
    totalBudgetUsd: 0.00004,
  });

  await expect(budgeted(request(), noTokens)).resolves.toMatchObject({
    text: "result",
  });
  const rows = (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(rows).toHaveLength(2);
  expect(rows[0].type).toBe("reserved");
  expect(rows[0].requestFingerprint).toMatch(/^[a-f0-9]{64}$/u);
  expect(rows[0].estimatedInputTokens).toBeGreaterThan(
    Buffer.byteLength("Compose from these contributions."),
  );
  expect(rows[1]).toMatchObject({
    type: "finished",
    outcome: "success",
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    finishReason: "stop",
  });
  expect(rows[1].actualUsd).toBeCloseTo(0.000011, 12);
  expect(rows[1].endedAt).toBeTypeOf("string");
});

it("enforces a per-slice cap before dispatch", async () => {
  const path = await ledgerPath();
  const generate = vi.fn<Generate>();
  const budgeted = createBudgetedGenerate(generate, {
    ledgerPath: path,
    sliceCapUsd: 0.000001,
  });

  await expect(budgeted(request(), noTokens)).rejects.toThrow(/per-slice/u);
  expect(generate).not.toHaveBeenCalled();
});
