import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import {
  prepareExperiments,
  promptVariants,
  runExperiments,
} from "../src/prompt-experiments.ts";
import { prepareRehearsal } from "../src/prompt-rehearsal.ts";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function directory() {
  const p = await mkdtemp(join(tmpdir(), "prompt-batch-"));
  dirs.push(p);
  return p;
}
it("isolates prompt deletions from input presentation in a balanced sixteen-run batch", async () => {
  const source = "examples/prompt-rehearsal/plan.json";
  const batch = await prepareExperiments(source, source);
  expect(batch.jobs).toHaveLength(16);
  expect(new Set(batch.jobs.map((j) => j.label)).size).toBe(16);
  expect(new Set(batch.jobs.map((j) => j.plan.inputFingerprint)).size).toBe(1);
  for (const input of ["live", "recorded"])
    for (const variant of ["A", "B", "C", "D"])
      expect(
        batch.jobs.filter((j) => j.input === input && j.variant === variant),
      ).toHaveLength(2);
  const plans = ["A", "B", "C", "D"].map(
    (v) => batch.jobs.find((j) => j.variant === v)?.plan,
  );
  expect(plans[1]?.config.instructions).not.toContain(
    "Let qualifications change",
  );
  expect(plans[2]?.config.instructions).not.toContain(
    "a desire can encounter a limit",
  );
  expect(plans[2]?.config.instructions).toBe(plans[3]?.config.instructions);
  expect(plans[2]?.config.live.sourcePresentation).toBeUndefined();
  expect(plans[3]?.config.live.sourcePresentation).toBe("complete");
  expect(() => promptVariants("Different baseline")).toThrow();
});
it("preserves replacements and deletions in replay rather than appending repeated snapshots", async () => {
  const dir = await directory();
  const path = join(dir, "plan.json");
  await writeFile(
    path,
    JSON.stringify({
      schemaVersion: 1,
      title: "Revisions",
      invitation: "What changes?",
      hypothesis: "",
      config: resolve("examples/live-projection.json"),
      tracks: [
        {
          id: "a",
          timingNote: "Synthetic revision times",
          cues: [
            { endMs: 1, text: "We want a park", replace: true },
            { endMs: 2, text: "We want a garden", replace: true },
            { endMs: 3, text: "", replace: true },
          ],
        },
      ],
    }),
  );
  const plan = await prepareRehearsal(path);
  expect(plan.timeline.map((e) => e.text)).toEqual([
    "We want a park",
    "We want a garden",
    "",
  ]);
});
it("stops dispatch after failure and saves a reading copy and unstarted jobs without raw errors", async () => {
  const batch = await prepareExperiments(
    "examples/prompt-rehearsal/plan.json",
    "examples/prompt-rehearsal/plan.json",
  );
  const dir = join(await directory(), "run");
  const run = vi.fn(async () => {
    throw new Error("SECRET provider detail");
  });
  expect(await runExperiments(batch, dir, undefined, run)).toBe(false);
  expect(run.mock.calls.length).toBeLessThanOrEqual(2);
  const outcomes = await readFile(join(dir, "outcomes.json"), "utf8");
  expect(outcomes).not.toContain("SECRET");
  expect(JSON.parse(outcomes).notStarted.length).toBeGreaterThanOrEqual(14);
  const reading = JSON.parse(
    await readFile(join(dir, "reading-copy.json"), "utf8"),
  );
  expect(reading).toHaveLength(16);
  expect(reading[0]).not.toHaveProperty("variant");
  await expect(runExperiments(batch, dir, undefined, run)).rejects.toThrow();
});

it("explains an existing CLI destination without overwriting it or dispatching models", async () => {
  const dir = await directory();
  const batch = await prepareExperiments(
    "examples/prompt-rehearsal/plan.json",
    "examples/prompt-rehearsal/plan.json",
  );
  const path = join(dir, "batch.json");
  await writeFile(path, JSON.stringify(batch));
  await writeFile(join(dir, "sentinel.txt"), "keep this");
  const result = await promisify(execFile)(process.execPath, [
    "src/prompt-experiments-cli.ts",
    "--plan",
    path,
    "--out",
    dir,
  ]).then(
    () => ({ code: 0, stderr: "" }),
    (error: { code: number; stderr: string }) => error,
  );
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("output destination already exists");
  expect(result.stderr).toContain("--inspect");
  expect(await readFile(join(dir, "sentinel.txt"), "utf8")).toBe("keep this");
  expect(await readFile(path, "utf8")).toBe(JSON.stringify(batch));
});
