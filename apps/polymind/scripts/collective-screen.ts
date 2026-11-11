import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runScreen, screenPlanSchema } from "../src/collective-screen.ts";
import { createBudgetedGenerate } from "../src/experiment-budget.ts";
import { generate, validateModelEnvironment } from "../src/models.ts";
import { generateScreenResponses } from "../src/screen-responses.ts";

const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(name);
  const result = index < 0 ? undefined : args[index + 1];
  if (!result) throw new Error(`Missing ${name} argument.`);
  return result;
};
const plan = screenPlanSchema.parse(
  JSON.parse(await readFile(value("--plan"), "utf8")),
);
const out = value("--out");
validateModelEnvironment(plan.model);
for (const variant of plan.variants)
  if (variant.model) validateModelEnvironment(variant.model);
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
let callId = 0;
const budgetedGenerate = (
  request: Parameters<typeof generate>[0],
  onToken: Parameters<typeof generate>[1],
) =>
  createBudgetedGenerate(
    plan.api === "responses" ? generateScreenResponses : generate,
    {
      ledgerPath: resolve(out, "usage.jsonl"),
      totalBudgetUsd: 2,
      sliceCapUsd: 2,
      sliceId: "collective-screen",
      runId: `collective-screen-call-${String(++callId).padStart(4, "0")}`,
    },
  )(request, onToken);
const outcomes = await runScreen(
  plan,
  out,
  budgetedGenerate,
  controller.signal,
);
process.stdout.write(
  `${JSON.stringify({ out, completed: outcomes.filter((item) => item.status === "completed").length, failed: outcomes.filter((item) => item.status === "failed").length, aborted: outcomes.filter((item) => item.status === "aborted" || item.status === "not_dispatched").length })}\n`,
);
if (outcomes.some((item) => item.status !== "completed")) process.exitCode = 1;
