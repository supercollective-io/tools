import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { createBudgetedGenerate } from "./experiment-budget.ts";
import { type Generate, generate } from "./models.ts";
import { inspectNaturalTiming } from "./natural-comparison-metrics.ts";
import {
  type FrozenRehearsal,
  fingerprint,
  type inspectRehearsal,
  prepareRehearsal,
  runRehearsal,
} from "./prompt-rehearsal.ts";

const POLICIES = ["natural-ordinary", "natural-short"] as const;
const TRACKS = 100;
const TIMELINE_MS = 300_000;
const TAIL_MS = 30_000;
const ORDINARY_REQUESTS = 50;
const SHORT_REQUESTS = 125;
const INPUT_TOKENS = 50_000;
const INPUT_RATE = 0.125;
const OUTPUT_RATE = 0.5;

const preparedSchema = z.strictObject({
  schemaVersion: z.literal(1),
  inputFingerprint: z.string().length(64),
  sourceFingerprint: z.string().length(64),
  planFingerprints: z.record(z.string(), z.string().length(64)),
  policies: z.array(z.enum(POLICIES)).length(2),
  trackCount: z.literal(TRACKS),
  timelineMs: z.literal(TIMELINE_MS),
  tailMs: z.literal(TAIL_MS),
  cost: z.strictObject({
    planningEstimateUsd: z.literal(1.1),
    lowUsd: z.literal(0.55),
    highUsd: z.literal(2.2),
    assumptions: z.object({
      ordinaryRequests: z.literal(ORDINARY_REQUESTS),
      shortRequests: z.literal(SHORT_REQUESTS),
      inputTokens: z.literal(INPUT_TOKENS),
      inputUsdPerMillion: z.literal(INPUT_RATE),
      outputUsdPerMillion: z.literal(OUTPUT_RATE),
      note: z.string(),
    }),
  }),
  preflight: z.strictObject({
    sourceCharacters: z.number().int().nonnegative(),
    maxContextCharacters: z.literal(1_000_000),
    estimatedRequestCharacters: z.number().int().positive(),
    scheduleEvents: z.number().int().positive(),
    note: z.string(),
  }),
});

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const json = async (path: string, value: unknown) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });

async function sourceFingerprint() {
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
  const modules = [
    "natural-comparison",
    "natural-comparison-metrics",
    "prompt-rehearsal",
    "live",
    "live-runs",
    "live-schema",
    "participation-store",
    "participation-admission",
    "journal",
    "models",
    "experiment-budget",
  ];
  const sources = await Promise.all(
    modules.map((name) =>
      readFile(new URL(`./${name}.${extension}`, import.meta.url), "utf8"),
    ),
  );
  return fingerprint(sources);
}

/** Preserve and validate the same five-minute multi-revision schedule. */
export function createNaturalComparisonPlans(input: FrozenRehearsal) {
  if (input.tracks.length !== TRACKS)
    throw new Error("Natural comparison requires exactly 100 tracks.");
  if (
    input.config.composer.provider !== "openai" ||
    input.config.composer.model !== "gpt-6-luna" ||
    input.config.composer.reasoningEffort !== "none"
  )
    throw new Error(
      "Natural comparison requires the OpenAI gpt-6-luna composer with reasoning disabled so the declared planning rates and budget ledger apply.",
    );
  if (
    input.timeline.length < TRACKS * 3 ||
    input.timeline.some((entry) => entry.atMs > TIMELINE_MS) ||
    new Set(
      input.timeline
        .map((entry) => entry.atMs)
        .filter((atMs) => atMs !== 150_000),
    ).size < 20 ||
    input.tracks.some((track) => {
      const events = input.timeline.filter((entry) => entry.track === track.id);
      return events.length < 3 || (events[0]?.atMs ?? Infinity) > 40_000;
    }) ||
    Math.max(...input.timeline.map((entry) => entry.atMs)) !== TIMELINE_MS ||
    input.tracks.filter((track) =>
      input.timeline.some(
        (entry) => entry.track === track.id && entry.atMs === 150_000,
      ),
    ).length !== TRACKS
  )
    throw new Error(
      "Input must contain 100 tracks with three or more revisions, all present by 40 seconds, an all-track burst at 150 seconds, and a final cue at 300 seconds.",
    );

  const timeline = input.timeline;
  const tracks = input.tracks;
  return POLICIES.map((policy) => {
    const config = structuredClone(input.config);
    config.live.continuationPolicy = policy;
    config.live.maxDurationMs = TIMELINE_MS + TAIL_MS + 1000;
    config.live.maxContextCharacters = 1_000_000;
    return {
      ...input,
      arrangement: input.arrangement,
      tracks,
      timeline,
      endMs: TIMELINE_MS + TAIL_MS,
      tailMs: TAIL_MS,
      config,
      configFingerprint: fingerprint(config),
      inputFingerprint: fingerprint({ tracks, timeline }),
    };
  });
}

/** Offline preparation. Writes a reviewable, hash-frozen two-policy plan. */
export async function prepareNaturalComparison(
  inputPlanPath: string,
  outputDir: string,
) {
  const base = await prepareRehearsal(inputPlanPath);
  const plans = createNaturalComparisonPlans(base);
  const sourceCharacters = base.tracks.reduce(
    (sum, track) =>
      sum +
      Math.max(
        ...base.timeline
          .filter((event) => event.track === track.id)
          .map((event) => JSON.stringify(event.text).length),
      ),
    0,
  );
  // Both full text and the fresh suffix can appear in the same prompt.
  // Future output is unknown; reserve a deliberately explicit history scenario.
  const estimatedRequestCharacters =
    2 * sourceCharacters +
    100_000 +
    50_000 +
    base.config.instructions.length +
    base.invitation.length;
  if (estimatedRequestCharacters > 1_000_000)
    throw new Error(
      "Source and history allowance exceed the comparison context limit.",
    );
  const directory = resolve(outputDir);
  await mkdir(directory, { recursive: false, mode: 0o700 });
  const planFingerprints: Record<string, string> = {};
  for (let index = 0; index < POLICIES.length; index++) {
    const policy = POLICIES[index];
    const plan = plans[index];
    if (!policy || !plan) throw new Error("Comparison plan is incomplete.");
    const serialized = `${JSON.stringify(plan, null, 2)}\n`;
    await writeFile(join(directory, `${policy}.plan.json`), serialized, {
      flag: "wx",
      mode: 0o600,
    });
    planFingerprints[policy] = sha256(serialized);
  }
  const manifest = {
    schemaVersion: 1 as const,
    inputFingerprint: base.inputFingerprint,
    sourceFingerprint: await sourceFingerprint(),
    planFingerprints,
    policies: [...POLICIES],
    trackCount: TRACKS as 100,
    timelineMs: TIMELINE_MS as 300_000,
    tailMs: TAIL_MS as 30_000,
    cost: {
      planningEstimateUsd: 1.1 as 1.1,
      lowUsd: 0.55 as 0.55,
      highUsd: 2.2 as 2.2,
      assumptions: {
        ordinaryRequests: ORDINARY_REQUESTS as 50,
        shortRequests: SHORT_REQUESTS as 125,
        inputTokens: INPUT_TOKENS as 50_000,
        inputUsdPerMillion: INPUT_RATE as 0.125,
        outputUsdPerMillion: OUTPUT_RATE as 0.5,
        note: "Scenario planning allowance; the durable ledger records actual usage at its approved gpt-6-luna rates (USD 0.10 input and USD 0.50 output per million tokens).",
      },
    },
    preflight: {
      sourceCharacters,
      maxContextCharacters: 1_000_000,
      estimatedRequestCharacters,
      scheduleEvents: base.timeline.length,
      note: "Scenario preflight: twice the largest JSON-escaped source per participant, 100,000 characters of collective history, plus 50,000 characters of structural allowance and instructions. Future history is unknown; the live context guard remains authoritative. This is a character estimate, not a provider token count.",
    },
  };
  await json(join(directory, "comparison.json"), manifest);
  return { directory, manifest };
}

function completionIsGood(
  report: Awaited<ReturnType<typeof inspectRehearsal>>,
) {
  return (
    report.status === "ended" &&
    report.completion.allInputsAdmitted &&
    report.completion.allInputsSeen &&
    report.completion.failedAttempts.length === 0 &&
    report.completion.unfinishedAttempts.length === 0 &&
    report.completion.incompleteTailBytes === 0
  );
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

function summarise(report: Awaited<ReturnType<typeof inspectRehearsal>>) {
  const lengths = report.steps.map((step) => wordCount(step.appended));
  return {
    runId: report.runId,
    status: report.status,
    requests: report.steps.length,
    totalWords: wordCount(report.finalText),
    passageWords: {
      min: lengths.length ? Math.min(...lengths) : 0,
      max: lengths.length ? Math.max(...lengths) : 0,
      mean: lengths.length
        ? Math.round(
            lengths.reduce((sum, value) => sum + value, 0) / lengths.length,
          )
        : 0,
    },
    naturalCompletions: report.steps.filter(
      (step) => step.finishReason === "eos",
    ).length,
    finishReasons: report.steps.map((step) => step.finishReason),
    completion: report.completion,
  };
}

/** Explicitly budgeted, serial run. Stops after any failed/incomplete policy. */
export async function runNaturalComparison(
  outputDir: string,
  budgetUsd: number,
  model: Generate = generate,
  signal?: AbortSignal,
  runner: typeof runRehearsal = runRehearsal,
  inspectTiming: typeof inspectNaturalTiming = inspectNaturalTiming,
) {
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0 || budgetUsd > 5)
    throw new Error(
      "An explicit USD budget above zero and no more than 5 is required.",
    );
  const directory = resolve(outputDir);
  const manifest = preparedSchema.parse(
    JSON.parse(await readFile(join(directory, "comparison.json"), "utf8")),
  );
  if (manifest.sourceFingerprint !== (await sourceFingerprint()))
    throw new Error(
      "Runtime source changed after preparation; prepare a new pair before dispatch.",
    );
  const frozen = new Map<string, FrozenRehearsal>();
  for (const policy of POLICIES) {
    const path = join(directory, `${policy}.plan.json`);
    const serialized = await readFile(path, "utf8");
    if (sha256(serialized) !== manifest.planFingerprints[policy])
      throw new Error(
        `Frozen ${policy} plan fingerprint mismatch; refusing dispatch.`,
      );
    const plan = JSON.parse(serialized) as FrozenRehearsal;
    if (
      plan.config.live.continuationPolicy !== policy ||
      plan.tracks.length !== TRACKS ||
      plan.timeline.length < TRACKS * 3 ||
      plan.inputFingerprint !== manifest.inputFingerprint ||
      plan.endMs !== TIMELINE_MS + TAIL_MS ||
      plan.tailMs !== TAIL_MS ||
      plan.inputFingerprint !==
        fingerprint({ tracks: plan.tracks, timeline: plan.timeline }) ||
      plan.configFingerprint !== fingerprint(plan.config)
    )
      throw new Error(`Frozen ${policy} plan is invalid; refusing dispatch.`);
    frozen.set(policy, plan);
  }
  const ledgerPath = join(directory, "usage.jsonl");
  const ledger = await open(ledgerPath, "wx", 0o600);
  await ledger.close();
  const reports: Record<string, unknown> = {};
  const anonymous: Record<string, unknown> = {};
  const readingCopy: {
    label: string;
    passages: string[];
    finalText: string;
  }[] = [];
  const blindLabels: Record<string, string> = {};
  for (let index = 0; index < POLICIES.length; index++) {
    const policy = POLICIES[index];
    if (!policy) throw new Error("Comparison plan is incomplete.");
    const plan = frozen.get(policy);
    if (!plan) throw new Error("Comparison plan is incomplete.");
    const budgeted = createBudgetedGenerate(model, {
      ledgerPath,
      totalBudgetUsd: budgetUsd,
      sliceId: policy,
      runId: `natural-comparison-${policy}`,
    });
    const report = await runner(
      plan,
      join(directory, policy),
      budgeted,
      signal,
    );
    reports[policy] = {
      ...summarise(report),
      timing: await inspectTiming(join(directory, policy)),
    };
    anonymous[index === 0 ? "A" : "B"] = report.steps.map((step) => ({
      atMs: step.atMs,
      words: wordCount(step.appended),
      natural: step.finishReason === "eos",
    }));
    const label = randomUUID();
    blindLabels[label] = policy;
    readingCopy.push({
      label,
      passages: report.steps.map((step) => step.appended),
      finalText: report.finalText,
    });
    if (!completionIsGood(report)) {
      await json(join(directory, "result.json"), {
        schemaVersion: 1,
        status: "stopped_incomplete",
        attemptedPolicies: Object.keys(reports),
        reports,
        anonymisedTrajectories: anonymous,
        unblindedMapping: { A: POLICIES[0], B: POLICIES[1] },
        stoppedAfter: policy,
      });
      throw new Error(
        `The ${policy} run failed or was incomplete; remaining policy runs were not dispatched.`,
      );
    }
  }
  await json(join(directory, "reading-copy.json"), {
    schemaVersion: 1,
    note: "Opaque labels; no policy, timing, or word-count metadata is included.",
    runs: readingCopy.sort((a, b) => a.label.localeCompare(b.label)),
  });
  const result = {
    schemaVersion: 1,
    status: "completed",
    reports,
    anonymisedTrajectories: anonymous,
    blindLabels,
    unblindedMapping: { A: POLICIES[0], B: POLICIES[1] },
  };
  await json(join(directory, "result.json"), result);
  return result;
}
