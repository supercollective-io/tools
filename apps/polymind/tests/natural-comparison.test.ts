import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  createNaturalComparisonPlans,
  prepareNaturalComparison,
  runNaturalComparison,
} from "../src/natural-comparison.ts";
import type { inspectNaturalTiming } from "../src/natural-comparison-metrics.ts";
import {
  type FrozenRehearsal,
  type inspectRehearsal,
  prepareRehearsal,
} from "../src/prompt-rehearsal.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "natural-comparison-"));
  directories.push(directory);
  const config = JSON.parse(
    await readFile("examples/live-projection.json", "utf8"),
  );
  config.composer = {
    provider: "openai",
    model: "gpt-6-luna",
    reasoningEffort: "none",
    maxOutputTokens: 100,
    timeoutMs: 1000,
  };
  await writeFile(join(directory, "config.json"), JSON.stringify(config));
  const tracks = Array.from({ length: 100 }, (_, index) => ({
    id: `track-${String(index).padStart(3, "0")}`,
    timingNote: "Fictional test timing",
    cues: [
      { endMs: index * 400, text: `first ${index}` },
      { endMs: 150_000, text: `burst ${index}` },
      {
        endMs: 180_000 + Math.round((index * 120_000) / 99),
        text: `later ${index}`,
      },
    ],
  }));
  const path = join(directory, "plan.json");
  await writeFile(
    path,
    JSON.stringify({
      schemaVersion: 1,
      title: "Comparison fixture",
      invitation: "What changes?",
      hypothesis: "Test natural completion policies",
      config: "config.json",
      tailMs: 30_000,
      tracks,
    }),
  );
  return { directory, path };
}

it("freezes two policies over identical 100-track inputs and revisions", async () => {
  const { path } = await fixture();
  const base = await prepareRehearsal(path);
  const [ordinary, short] = createNaturalComparisonPlans(base);
  expect(ordinary?.tracks).toHaveLength(100);
  expect(ordinary?.timeline).toHaveLength(300);
  expect(ordinary?.timeline).toEqual(base.timeline);
  expect(short?.timeline).toEqual(ordinary?.timeline);
  expect(ordinary?.inputFingerprint).toBe(short?.inputFingerprint);
  expect(ordinary?.tailMs).toBe(30_000);
  expect(ordinary?.endMs).toBe(330_000);
  expect(ordinary?.config.live.maxContextCharacters).toBe(1_000_000);
  expect(ordinary?.config.live.continuationPolicy).toBe("natural-ordinary");
  expect(short?.config.live.continuationPolicy).toBe("natural-short");
});

it("prepares offline with planning cost assumptions and refuses a changed frozen plan", async () => {
  const { directory, path } = await fixture();
  const preparedPath = join(directory, "prepared");
  const { manifest } = await prepareNaturalComparison(path, preparedPath);
  expect(manifest.cost).toMatchObject({
    planningEstimateUsd: 1.1,
    lowUsd: 0.55,
    highUsd: 2.2,
    assumptions: {
      ordinaryRequests: 50,
      shortRequests: 125,
      inputTokens: 50_000,
      inputUsdPerMillion: 0.125,
      outputUsdPerMillion: 0.5,
    },
  });
  expect(manifest.preflight.estimatedRequestCharacters).toBeGreaterThan(0);
  const frozenPath = join(preparedPath, "natural-ordinary.plan.json");
  const frozen = JSON.parse(await readFile(frozenPath, "utf8"));
  frozen.timeline[0].text = "tampered";
  await writeFile(frozenPath, JSON.stringify(frozen));
  let dispatched = false;
  await expect(
    runNaturalComparison(preparedPath, 2.2, async () => {
      dispatched = true;
      throw new Error("not expected");
    }),
  ).rejects.toThrow("fingerprint mismatch");
  expect(dispatched).toBe(false);
});

it("dispatches two policies serially with equal inputs and stops after an incomplete run", async () => {
  const { directory, path } = await fixture();
  const preparedPath = join(directory, "complete");
  await prepareNaturalComparison(path, preparedPath);
  const dispatched: string[] = [];
  let running = false;
  const runner = async (plan: FrozenRehearsal) => {
    expect(running).toBe(false);
    running = true;
    dispatched.push(plan.config.live.continuationPolicy ?? "missing");
    await new Promise((resolve) => setTimeout(resolve, 2));
    running = false;
    return {
      runId: "offline-double",
      status: "ended",
      finalText: "A completed collective passage.",
      steps: [
        {
          atMs: 10,
          appended: "A completed collective passage.",
          finishReason: "eos",
        },
      ],
      completion: {
        allInputsAdmitted: true,
        allInputsSeen: true,
        failedAttempts: [],
        unfinishedAttempts: [],
        incompleteTailBytes: 0,
      },
    } as unknown as Awaited<ReturnType<typeof inspectRehearsal>>;
  };
  const timing = async () =>
    ({ freshness: {}, publicationGaps: {} }) as Awaited<
      ReturnType<typeof inspectNaturalTiming>
    >;
  const complete = await runNaturalComparison(
    preparedPath,
    2.2,
    async () => {
      throw new Error("The offline runner must not dispatch the model.");
    },
    undefined,
    runner,
    timing,
  );
  expect(dispatched).toEqual(["natural-ordinary", "natural-short"]);
  expect(complete.status).toBe("completed");
  expect(complete.unblindedMapping).toEqual({
    A: "natural-ordinary",
    B: "natural-short",
  });
  const reading = JSON.parse(
    await readFile(join(preparedPath, "reading-copy.json"), "utf8"),
  );
  expect(reading.runs).toHaveLength(2);
  expect(reading.runs[0].label).not.toBe("natural-ordinary");
  expect(JSON.stringify(reading)).not.toContain("natural-short");

  const incompletePath = join(directory, "incomplete");
  await prepareNaturalComparison(path, incompletePath);
  dispatched.length = 0;
  await expect(
    runNaturalComparison(
      incompletePath,
      2.2,
      async () => {
        throw new Error("The offline runner must not dispatch the model.");
      },
      undefined,
      async (plan: FrozenRehearsal) => {
        dispatched.push(plan.config.live.continuationPolicy ?? "missing");
        return {
          runId: "offline-incomplete",
          status: "paused",
          finalText: "",
          steps: [],
          completion: {
            allInputsAdmitted: false,
            allInputsSeen: false,
            failedAttempts: [],
            unfinishedAttempts: [],
            incompleteTailBytes: 0,
          },
        } as unknown as Awaited<ReturnType<typeof inspectRehearsal>>;
      },
      timing,
    ),
  ).rejects.toThrow("remaining policy runs were not dispatched");
  expect(dispatched).toEqual(["natural-ordinary"]);
  const stopped = JSON.parse(
    await readFile(join(incompletePath, "result.json"), "utf8"),
  );
  expect(stopped.status).toBe("stopped_incomplete");
  expect(stopped.attemptedPolicies).toEqual(["natural-ordinary"]);
});
