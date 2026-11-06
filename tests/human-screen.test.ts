import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { runScreen, screenPlanSchema } from "../src/collective-screen.ts";

const exec = promisify(execFile);
const directories: string[] = [];
const fixture = {
  invitation: "What would you change?",
  contributions: Array.from({ length: 6 }, (_, index) => ({
    id: `h0${index + 1}`,
    text: `Fictional contribution ${index + 1}, with its original wording.`,
  })),
};
async function prepare(input: unknown) {
  const dir = await mkdtemp(join(tmpdir(), "human-screen-"));
  directories.push(dir);
  const inputs = join(dir, "inputs.json");
  const out = join(dir, "plan.json");
  await writeFile(inputs, JSON.stringify(input));
  const args = [
    "scripts/prepare-human-screen.ts",
    "--inputs",
    inputs,
    "--out",
    out,
  ];
  return { dir, out, args };
}
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

it("prepares human-only matched conditions and preserves sources through adaptation", async () => {
  const { dir, out, args } = await prepare(fixture);
  const { stdout } = await exec(process.execPath, args);
  expect(JSON.parse(stdout)).toMatchObject({ finalPassages: 10, calls: 12 });
  const plan = screenPlanSchema.parse(JSON.parse(await readFile(out, "utf8")));
  expect(plan.datasets).toEqual([{ ...fixture, id: "human-06" }]);
  expect(
    plan.variants.every(({ stages }) =>
      stages.every(
        ({ instructions }) => !instructions.includes("British English"),
      ),
    ),
  ).toBe(true);
  const reference = plan.variants.find(
    ({ id }) => id === "thinking-aloud-reference",
  );
  const luna = plan.variants.find(
    ({ id }) => id === "thinking-aloud-reference-luna",
  );
  expect(luna?.stages).toEqual(reference?.stages);
  expect(luna?.model).toEqual({ ...plan.model, model: "gpt-6-luna" });
  const removed = plan.variants.find(({ id }) => id === "range-removed");
  expect(removed?.stages[0]?.instructions).toBe(
    reference?.stages[0]?.instructions.replace(
      "Carry as much of the range of meanings as you meaningfully can; there is no requirement to mention each person or topic. ",
      "",
    ),
  );
  let calls = 0;
  let adaptations = 0;
  const results = await runScreen(
    plan,
    join(dir, "run"),
    async (request, onToken) => {
      calls++;
      const payload = JSON.parse(request.messages[1]?.content ?? "{}");
      expect(payload.contributions).toEqual(fixture.contributions);
      if (payload.previousStageText) {
        adaptations++;
        expect(payload.previousStageText).toBe(
          "Exploratory text, not a final passage.",
        );
      }
      const text = request.messages[0]?.content.includes("300–450")
        ? "Exploratory text, not a final passage."
        : "A final passage.";
      await onToken(text);
      return { text };
    },
  );
  expect(calls).toBe(12);
  expect(adaptations).toBe(2);
  expect(results.every(({ status }) => status === "completed")).toBe(true);
  expect(results.flatMap(({ candidates }) => candidates ?? [])).toHaveLength(
    10,
  );
  expect(
    await readFile(join(dir, "run", "reading-copy.txt"), "utf8"),
  ).not.toContain("Exploratory text");
  const saved = await readFile(out, "utf8");
  await expect(exec(process.execPath, args)).rejects.toThrow();
  expect(await readFile(out, "utf8")).toBe(saved);
});

it("refuses five contributions rather than silently labelling them human six", async () => {
  const { out, args } = await prepare({
    ...fixture,
    contributions: fixture.contributions.slice(0, 5),
  });
  await expect(exec(process.execPath, args)).rejects.toThrow("exactly six");
  await expect(readFile(out)).rejects.toMatchObject({ code: "ENOENT" });
});

it("rejects private metadata and empty contributions before writing a plan", async () => {
  for (const contributions of [
    fixture.contributions.map((item) => ({
      ...item,
      privateContext: "not composer material",
    })),
    fixture.contributions.map((item, index) => ({
      ...item,
      text: index ? item.text : "  ",
    })),
  ]) {
    const { out, args } = await prepare({ ...fixture, contributions });
    await expect(exec(process.execPath, args)).rejects.toThrow();
    await expect(readFile(out)).rejects.toMatchObject({ code: "ENOENT" });
  }
});
