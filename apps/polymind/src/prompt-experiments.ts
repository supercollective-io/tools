import { randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type FrozenRehearsal,
  fingerprint,
  inspectRehearsal,
  prepareRehearsal,
  runRehearsal,
} from "./prompt-rehearsal.ts";

export function promptVariants(instructions: string) {
  const paragraphs = instructions.trim().split(/\n\s*\n/);
  if (
    paragraphs.length !== 4 ||
    !paragraphs[1]?.startsWith("Speak directly as we.") ||
    !paragraphs[3]?.startsWith("Let qualifications change what we say")
  ) {
    throw new Error(
      "Expected the four-paragraph G-derived prompt; review the experiment before changing its baseline.",
    );
  }
  const withoutQualification = paragraphs.slice(0, 3).join("\n\n");
  const simple = [
    paragraphs[0],
    "Speak directly as we. Let the thought develop through relationships between the particular meanings in these voices.",
    paragraphs[2],
  ].join("\n\n");
  return [
    {
      id: "A",
      instructions,
      complete: false,
      hypothesis: "Current improved live baseline.",
    },
    {
      id: "B",
      instructions: withoutQualification,
      complete: false,
      hypothesis:
        "Removing the qualification paragraph reduces habitual caution.",
    },
    {
      id: "C",
      instructions: simple,
      complete: false,
      hypothesis:
        "Removing prescribed desire-to-limit movement allows more varied development.",
    },
    {
      id: "D",
      instructions: simple,
      complete: true,
      hypothesis:
        "Showing complete current accounts without duplicated new-text markers reduces recency bias while preserving responsiveness.",
    },
  ];
}
export type ExperimentBatch = {
  schemaVersion: 1;
  concurrency: 2;
  jobs: {
    label: string;
    variant: string;
    input: string;
    repetition: number;
    plan: FrozenRehearsal;
  }[];
};

export async function prepareExperiments(
  livePath: string,
  recordedPath: string,
): Promise<ExperimentBatch> {
  const [live, recorded] = await Promise.all([
    prepareRehearsal(livePath),
    prepareRehearsal(recordedPath),
  ]);
  if (
    fingerprint(live.config.composer) !==
      fingerprint(recorded.config.composer) ||
    live.config.instructions !== recorded.config.instructions
  )
    throw new Error(
      "Both inputs must use the same baseline prompt and model settings.",
    );
  const variants = promptVariants(live.config.instructions);
  const jobs: ExperimentBatch["jobs"] = [];
  for (const [input, source] of [
    ["live", live],
    ["recorded", recorded],
  ] as const) {
    for (const variant of variants) {
      for (let repetition = 1; repetition <= 2; repetition++) {
        const plan = structuredClone(source);
        plan.config.instructions = variant.instructions;
        delete plan.config.live.sourcePresentation;
        if (variant.complete) plan.config.live.sourcePresentation = "complete";
        plan.configFingerprint = fingerprint(plan.config);
        plan.hypothesis = variant.hypothesis;
        jobs.push({ label: "", variant: variant.id, input, repetition, plan });
      }
    }
  }
  // Randomise execution order and conceal conditions in the reading copy.
  for (let i = jobs.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const a = jobs[i],
      b = jobs[j];
    if (a && b) {
      jobs[i] = b;
      jobs[j] = a;
    }
  }
  jobs.forEach((job, i) => {
    job.label = `text-${String(i + 1).padStart(3, "0")}`;
  });
  return { schemaVersion: 1, concurrency: 2, jobs };
}
const save = (path: string, value: unknown) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });

export async function runExperiments(
  batch: ExperimentBatch,
  directory: string,
  signal?: AbortSignal,
  run = runRehearsal,
) {
  if (
    batch.schemaVersion !== 1 ||
    batch.concurrency !== 2 ||
    batch.jobs.length !== 16 ||
    new Set(batch.jobs.map((j) => j.label)).size !== 16 ||
    batch.jobs.some(
      (j) =>
        !/^text-\d{3}$/.test(j.label) ||
        j.plan.configFingerprint !== fingerprint(j.plan.config),
    )
  )
    throw new Error("Invalid frozen batch.");
  await mkdir(directory, { mode: 0o700 });
  await save(join(directory, "batch.json"), batch);
  await save(
    join(directory, "key.json"),
    batch.jobs.map(({ plan: _plan, ...key }) => key),
  );
  const abort = new AbortController();
  const stop = () => abort.abort();
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) stop();
  let next = 0;
  const outcomes: { label: string; status: string }[] = [];
  try {
    await Promise.all(
      Array.from({ length: 2 }, async () => {
        while (!abort.signal.aborted) {
          const job = batch.jobs[next++];
          if (!job) return;
          try {
            const report = await run(
              job.plan,
              join(directory, job.label),
              undefined,
              abort.signal,
            );
            const ok =
              report.status === "ended" &&
              report.completion.allInputsSeen &&
              report.completion.allInputsAdmitted &&
              !report.completion.failedAttempts.length &&
              !report.completion.unfinishedAttempts.length;
            outcomes.push({
              label: job.label,
              status: ok ? "completed" : "incomplete",
            });
            if (!ok) stop();
          } catch {
            // Do not persist provider errors or private environment details.
            outcomes.push({ label: job.label, status: "failed" });
            stop();
          }
        }
      }),
    );
  } finally {
    signal?.removeEventListener("abort", stop);
    await save(join(directory, "outcomes.json"), {
      outcomes,
      notStarted: batch.jobs
        .filter((j) => !outcomes.some((o) => o.label === j.label))
        .map((j) => j.label),
    });
  }
  await inspectExperiments(directory);
  return (
    outcomes.length === batch.jobs.length &&
    outcomes.every((o) => o.status === "completed")
  );
}

export async function inspectExperiments(directory: string) {
  const batch: ExperimentBatch = JSON.parse(
    await readFile(join(directory, "batch.json"), "utf8"),
  );
  const readings = [];
  for (const job of batch.jobs) {
    try {
      const report = await inspectRehearsal(join(directory, job.label));
      readings.push({
        label: job.label,
        status: report.status,
        completion: report.completion,
        text: report.finalText,
        steps: report.steps.map(({ atMs, appended, finishReason }) => ({
          atMs,
          appended,
          finishReason,
        })),
      });
    } catch {
      readings.push({
        label: job.label,
        status: "unavailable",
        text: "",
        steps: [],
      });
    }
  }
  await save(join(directory, "reading-copy.json"), readings);
  await writeFile(
    join(directory, "reading-copy.txt"),
    readings
      .map(
        (r) =>
          `${r.label} (${r.status})\n\n${r.text || "[No saved writing]"}\n`,
      )
      .join("\n"),
    { mode: 0o600 },
  );
  return readings;
}
