import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { screenPlanSchema } from "../src/collective-screen.ts";

// Offline preparation only. Dispatch is a separate, explicitly budgeted command.
const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(name);
  const result = index < 0 ? undefined : args[index + 1];
  if (!result || result.startsWith("--")) throw new Error(`Missing ${name}.`);
  return result;
};
const root = fileURLToPath(new URL("../", import.meta.url));
const inputPath = resolve(value("--inputs"));
const out = resolve(value("--out"));
const inputBytes = await readFile(inputPath, "utf8");
const input = JSON.parse(inputBytes);
const catalogue = JSON.parse(
  await readFile(
    resolve(root, "examples/collective-human-variants.json"),
    "utf8",
  ),
);
const historical = JSON.parse(
  await readFile(
    resolve(root, "examples/collective-framing-variants.json"),
    "utf8",
  ),
);
const model = {
  provider: "openai",
  model: "gpt-6.1-terra",
  reasoningEffort: "none",
  maxOutputTokens: 4096,
  timeoutMs: 120000,
};
const plan = screenPlanSchema.parse({
  model,
  concurrency: 4,
  repetitions: 2,
  datasets: [{ ...input, id: "human-06" }],
  variants: catalogue.variants,
});
if (plan.datasets[0]?.contributions.length !== 6)
  throw new Error("Human-six screening requires exactly six contributions.");
if (plan.datasets[0].contributions.some(({ text }) => !text.trim()))
  throw new Error("Human contributions must not be blank.");
const reference = plan.variants.find(
  ({ id }) => id === "thinking-aloud-reference",
);
const expectedReference = structuredClone(historical.variants[0]);
for (const stage of expectedReference.stages)
  stage.instructions = stage.instructions.replaceAll(
    "British English",
    "English",
  );
if (
  !reference ||
  JSON.stringify(reference) !== JSON.stringify(expectedReference)
)
  throw new Error(
    "The reference must match the historical prompt with only its regional language qualifier removed.",
  );
plan.variants.push({
  ...structuredClone(reference),
  id: "thinking-aloud-reference-luna",
  model: { ...plan.model, model: "gpt-6-luna" },
});
await mkdir(dirname(out), { recursive: true });
await writeFile(
  out,
  `${JSON.stringify(screenPlanSchema.parse(plan), null, 2)}\n`,
  {
    flag: "wx",
  },
);
process.stdout.write(
  `${JSON.stringify({
    out,
    inputPath,
    inputSha256: createHash("sha256").update(inputBytes).digest("hex"),
    dataset: "human-06",
    finalPassages: plan.variants.length * plan.repetitions,
    calls:
      plan.variants.reduce((sum, item) => sum + item.stages.length, 0) *
      plan.repetitions,
  })}\n`,
);
