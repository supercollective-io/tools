import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import {
  generate as defaultGenerate,
  type Generate,
  type ModelConfig,
  type PromptMessage,
} from "./models.ts";
import {
  generateScreenResponses,
  screenResponsesBody,
} from "./screen-responses.ts";

const modelSchema = z.strictObject({
  provider: z.enum(["openai", "ollama"]),
  model: z.string().min(1),
  baseUrl: z.string().optional(),
  temperature: z.number().optional(),
  think: z.boolean().optional(),
  numCtx: z.number().optional(),
  rawPrefill: z.boolean().optional(),
  reasoningEffort: z.enum(["none", "low", "medium", "high"]).optional(),
  maxOutputTokens: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
});
export const screenPlanSchema = z
  .strictObject({
    api: z.literal("responses").optional(),
    model: modelSchema,
    concurrency: z.number().int().positive().max(32),
    datasets: z
      .array(
        z.strictObject({
          id: z.string().min(1),
          invitation: z.string(),
          contributions: z
            .array(z.strictObject({ id: z.string().min(1), text: z.string() }))
            .min(1),
        }),
      )
      .min(1),
    variants: z
      .array(
        z.strictObject({
          id: z.string().min(1),
          model: modelSchema.optional(),
          stages: z
            .array(
              z.strictObject({
                instructions: z.string().min(1),
                includePrevious: z.boolean().optional(),
                includeHistory: z.boolean().optional(),
                retainAsCandidate: z.boolean().optional(),
              }),
            )
            .min(1),
        }),
      )
      .min(1),
    repetitions: z.number().int().positive(),
  })
  .superRefine((plan, ctx) => {
    if (plan.api === "responses") {
      for (const model of [
        plan.model,
        ...plan.variants.flatMap((variant) =>
          variant.model ? [variant.model] : [],
        ),
      ]) {
        if (model.provider !== "openai" || model.reasoningEffort === undefined)
          ctx.addIssue({
            code: "custom",
            message:
              "Responses screens require OpenAI and explicit reasoning effort.",
          });
      }
    }
    for (const [list, path] of [
      [plan.datasets, "datasets"],
      [plan.variants, "variants"],
    ] as const) {
      const ids = list.map((item) => item.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: "IDs must be unique.",
        });
    }
    for (const dataset of plan.datasets) {
      const ids = dataset.contributions.map((item) => item.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          path: ["datasets", dataset.id],
          message: "Contribution IDs must be unique.",
        });
    }
  });
export type ScreenPlan = z.infer<typeof screenPlanSchema>;

type Outcome = {
  label: string;
  datasetId: string;
  variantId: string;
  repetition: number;
  status: "completed" | "failed" | "aborted" | "not_dispatched";
  failedStage?: number;
  finalText?: string;
  candidates?: { label: string; stage: number; text: string }[];
};
export async function runScreen(
  rawPlan: ScreenPlan,
  outDir: string,
  generate?: Generate,
  signal: AbortSignal = new AbortController().signal,
): Promise<Outcome[]> {
  const plan = screenPlanSchema.parse(rawPlan);
  const dispatch =
    generate ??
    (plan.api === "responses" ? generateScreenResponses : defaultGenerate);
  const reasoningSummaries: { label: string; stage: number; text: string }[] =
    [];
  const directory = resolve(outDir);
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory, { recursive: false });
  await writeFile(
    resolve(directory, "frozen-plan.json"),
    `${JSON.stringify(plan, null, 2)}\n`,
    { flag: "wx" },
  );
  const requestPath = resolve(directory, "requests.jsonl");
  const resultPath = resolve(directory, "results.jsonl");
  await writeFile(requestPath, "", { flag: "wx" });
  await writeFile(resultPath, "", { flag: "wx" });
  let writeQueue = Promise.resolve();
  const log = (path: string, value: unknown) => {
    writeQueue = writeQueue.then(() =>
      appendFile(path, `${JSON.stringify(value)}\n`),
    );
    return writeQueue;
  };
  const jobs = plan.datasets.flatMap((dataset) =>
    plan.variants.flatMap((variant) =>
      Array.from({ length: plan.repetitions }, (_, repetition) => ({
        dataset,
        variant,
        repetition,
      })),
    ),
  );
  const outcomes: Outcome[] = [];
  let next = 0;
  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= jobs.length) return;
      const job = jobs[index];
      if (!job) return;
      const { dataset, variant, repetition } = job;
      const label = `text-${String(index + 1).padStart(3, "0")}`;
      const base = {
        label,
        datasetId: dataset.id,
        variantId: variant.id,
        repetition,
      };
      if (signal.aborted) {
        const outcome: Outcome = { ...base, status: "not_dispatched" };
        outcomes[index] = outcome;
        await log(resultPath, outcome);
        continue;
      }
      let prior = "";
      const history: { stage: number; text: string }[] = [];
      const candidates: NonNullable<Outcome["candidates"]> = [];
      const model = variant.model ?? plan.model;
      let stage = -1;
      try {
        for (stage = 0; stage < variant.stages.length; stage++) {
          signal.throwIfAborted();
          const stageSpec = variant.stages[stage];
          if (!stageSpec) throw new Error("missing_stage");
          const messages: PromptMessage[] = [
            { role: "system", content: stageSpec.instructions },
            {
              role: "user",
              content: JSON.stringify({
                invitation: dataset.invitation,
                contributions: dataset.contributions.map(({ id, text }) => ({
                  id,
                  text,
                })),
                ...(stageSpec.includePrevious && prior
                  ? { previousStageText: prior }
                  : {}),
                ...(stageSpec.includeHistory && history.length
                  ? { previousStages: history }
                  : {}),
              }),
            },
          ];
          await log(requestPath, {
            label,
            stage,
            config: model,
            messages,
            ...(plan.api === "responses"
              ? {
                  api: plan.api,
                  providerRequest: screenResponsesBody(model, messages),
                }
              : {}),
          });
          let streamed = "";
          const startedAt = performance.now();
          const result = await dispatch(
            {
              config: structuredClone(model) as ModelConfig,
              messages: structuredClone(messages),
              signal,
            },
            async (token) => {
              streamed += token;
              await log(requestPath, { label, stage, prefix: streamed });
            },
          );
          signal.throwIfAborted();
          if (!result.text.trim()) throw new Error("empty");
          if (result.finishReason === "length") throw new Error("length");
          if (
            streamed.length !== result.text.length ||
            streamed !== result.text
          )
            throw new Error("stream_mismatch");
          prior = result.text;
          history.push({ stage, text: prior });
          if (
            stageSpec.retainAsCandidate ||
            stage === variant.stages.length - 1
          )
            candidates.push({
              label: stageSpec.retainAsCandidate
                ? `${label}-stage-${stage + 1}`
                : label,
              stage,
              text: prior,
            });
          await log(resultPath, {
            label,
            stage,
            status: "stage_completed",
            text: result.text,
            usage: result.usage,
            finishReason: result.finishReason,
            ...(result.reasoning ? { reasoning: result.reasoning } : {}),
            startedAt,
            finishedAt: performance.now(),
          });
          if (result.reasoning)
            reasoningSummaries.push({
              label,
              stage,
              text: result.reasoning.summary.length
                ? result.reasoning.summary.join("\n\n")
                : result.reasoning.summaryRequested
                  ? "Summary requested; provider returned none."
                  : "Summary not requested (reasoning off).",
            });
        }
        const outcome: Outcome = {
          ...base,
          status: "completed",
          finalText: prior,
          candidates,
        };
        outcomes[index] = outcome;
        await log(resultPath, outcome);
      } catch {
        const status = signal.aborted ? "aborted" : "failed";
        const outcome: Outcome = {
          ...base,
          status,
          failedStage: Math.max(stage, 0),
          candidates,
        };
        outcomes[index] = outcome;
        await log(resultPath, outcome);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(plan.concurrency, jobs.length) }, worker),
  );
  await writeQueue;
  if (plan.api === "responses")
    await writeFile(
      resolve(directory, "reasoning-summaries.txt"),
      "Provider-supplied reasoning summaries, not raw reasoning or a faithful transcript of internal computation. Read the passages first. Failed stages may have no summary.\n\n" +
        reasoningSummaries
          .sort((a, b) => a.label.localeCompare(b.label) || a.stage - b.stage)
          .map(
            (item) => `${item.label}, stage ${item.stage + 1}\n${item.text}\n`,
          )
          .join("\n"),
      { flag: "wx" },
    );
  const passages = outcomes.flatMap((item) =>
    (item.candidates ?? []).map((candidate) => ({
      ...candidate,
      datasetId: item.datasetId,
      variantId: item.variantId,
      repetition: item.repetition,
      jobStatus: item.status,
    })),
  );
  const readingOrder = [...passages].sort((left, right) => {
    const key = (item: { label: string }) =>
      createHash("sha256").update(item.label).digest("hex");
    return key(left).localeCompare(key(right));
  });
  await writeFile(
    resolve(directory, "results.json"),
    `${JSON.stringify(outcomes, null, 2)}\n`,
    { flag: "wx" },
  );
  await writeFile(
    resolve(directory, "reading-copy.txt"),
    readingOrder
      .map(
        (item) =>
          `${item.label}${item.jobStatus === "completed" ? "" : ` (job ${item.jobStatus})`}\n${item.text}\n`,
      )
      .join("\n"),
    { flag: "wx" },
  );
  await writeFile(
    resolve(directory, "key.json"),
    `${JSON.stringify(
      passages.map(
        ({ label, datasetId, variantId, repetition, stage, jobStatus }) => ({
          label,
          datasetId,
          variantId,
          repetition,
          stage,
          jobStatus,
        }),
      ),
      null,
      2,
    )}\n`,
    { flag: "wx" },
  );
  return outcomes;
}
