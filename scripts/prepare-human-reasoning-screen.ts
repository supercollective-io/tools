import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { screenPlanSchema } from "../src/collective-screen.ts";

const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(name);
  const result = index < 0 ? undefined : args[index + 1];
  if (!result || result.startsWith("--")) throw new Error(`Missing ${name}.`);
  return result;
};
const previous = screenPlanSchema.parse(
  JSON.parse(await readFile(value("--previous-plan"), "utf8")),
);
const reference = previous.variants.find(
  ({ id }) => id === "thinking-aloud-reference-luna",
);
if (
  reference?.stages.length !== 1 ||
  previous.datasets.length !== 1 ||
  previous.datasets[0]?.id !== "human-06" ||
  previous.datasets[0].contributions.length !== 6
)
  throw new Error(
    "Expected the frozen human-six plan and its single-stage Luna reference.",
  );
const voiceInstruction =
  "Speak the collective thought itself. Do not refer to contributions, inputs, sources, participants or the composition process in the spoken passage. Where a distinction within the collective matters, prefer part of us to one of us or another of us. This is an available expression, not a refrain to repeat mechanically. Let differences move within the same we. Keep personally specific facts accurate in scope, or leave them out; do not turn an individual's biography into a shared experience.";
const model = {
  ...previous.model,
  model: "gpt-6-luna",
  reasoningEffort: "none" as const,
  maxOutputTokens: 8192,
  timeoutMs: 180000,
};
const instructions = `${reference.stages[0]?.instructions}\n\n${voiceInstruction}`;
const plan = screenPlanSchema.parse({
  api: "responses",
  model,
  concurrency: 3,
  repetitions: 2,
  datasets: previous.datasets,
  variants: (["none", "medium", "high"] as const).map((effort) => ({
    id: `collective-voice-${effort}`,
    model: { ...model, reasoningEffort: effort },
    stages: [{ instructions }],
  })),
});
const out = resolve(value("--out"));
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
process.stdout.write(
  `${JSON.stringify({ out, dataset: "human-06", finalPassages: 6, calls: 6, api: "responses", summaryPolicy: "auto when effort is medium or high; omitted for none" })}\n`,
);
