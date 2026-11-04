import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectComposer } from "./composer-audit.ts";
import { fixedComposerExperiment } from "./composer-experiment.ts";
import { createBudgetedGenerate } from "./experiment-budget.ts";
import { LiveController } from "./live.ts";
import { LiveLog } from "./live-runs.ts";
import { generate } from "./models.ts";
import { configSchema, scoreSchema } from "./schema.ts";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const root = resolve("runs/composer-pilot");
const scoreHashes: Record<string, string> = {
  eight: "c11c6c06f394797ec1f551b0e2e9cc14c39a04c0e6b2fc48ba4ff8a8c259769c",
  correction:
    "95303ede80e442b41953ae7587049cb03e8b905c05898226c05a18b40b22fbdd",
};

export function screeningOrder(extraScore?: "eight" | "correction") {
  if (extraScore)
    return ["luna", "terra"].map((model) => ({
      repetition: 3,
      score: extraScore,
      model,
    }));
  return [1, 2].flatMap((repetition) =>
    ["eight", "correction"].flatMap((score) =>
      (repetition === 1 ? ["luna", "terra"] : ["terra", "luna"]).map(
        (model) => ({ repetition, score, model }),
      ),
    ),
  );
}

/** One process, one new attempt; all attempts share the same spending ledger. */
export async function screenLuna(
  previousAttempt?: string,
  extraScore?: "eight" | "correction",
) {
  if (extraScore && !previousAttempt)
    throw new Error("A follow-up must link its original attempt.");
  await mkdir(root, { recursive: true });
  const directory = resolve(root, `luna-${randomUUID()}`);
  await mkdir(directory);
  const reviewDirectory = resolve(root, `assessment-${randomUUID()}`);
  await mkdir(reviewDirectory);
  const protocol = await readFile("docs/composer-luna-protocol.md", "utf8");
  const inputs = await Promise.all(
    screeningOrder(extraScore).map(async (condition) => {
      const scoreText = await readFile(
        condition.score === "eight"
          ? "examples/score.json"
          : "examples/composer-corrections.json",
        "utf8",
      );
      const configText = await readFile(
        `examples/composer-${condition.model}.json`,
        "utf8",
      );
      if (hash(scoreText) !== scoreHashes[condition.score])
        throw new Error("The frozen screening score has changed.");
      const config = configSchema.parse(JSON.parse(configText));
      if (
        config.composer.provider !== "openai" ||
        config.composer.model !==
          (condition.model === "luna" ? "gpt-6-luna" : "gpt-6.1-terra") ||
        config.composer.reasoningEffort !== "none" ||
        config.composer.maxOutputTokens !== 4096 ||
        config.composer.timeoutMs !== 120000 ||
        config.composer.baseUrl
      )
        throw new Error("The frozen screening configuration has changed.");
      return {
        ...condition,
        label: `${condition.score}-${condition.repetition}-${condition.model}`,
        score: scoreSchema.parse(JSON.parse(scoreText)),
        config,
        scoreFingerprint: hash(scoreText),
        configFingerprint: hash(configText),
      };
    }),
  );
  const comparisonConfig = (config: (typeof inputs)[number]["config"]) =>
    JSON.stringify({
      ...config,
      composer: { ...config.composer, model: "paired" },
    });
  const firstInput = inputs[0];
  if (!firstInput) throw new Error("Screening design is empty.");
  if (
    inputs.some(
      (input) =>
        comparisonConfig(input.config) !== comparisonConfig(firstInput.config),
    )
  )
    throw new Error(
      "Screening configurations differ beyond the model identifier.",
    );
  // Save the complete design before the first dispatch, separately from prompts.
  await writeFile(
    `${directory}/manifest.json`,
    `${JSON.stringify({ schemaVersion: 1, previousAttempt, extraScore, reviewDirectory, protocol, protocolFingerprint: hash(protocol), inputs }, null, 2)}\n`,
    { flag: "wx" },
  );
  console.log(`Attempt: ${directory}`);
  const blinding: Record<string, string> = {};
  try {
    for (const input of inputs) {
      const { label, score, config } = input;
      const log = await LiveLog.create(`${directory}/${label}.jsonl`, {
        type: "live.created",
        ...fixedComposerExperiment(score, config),
      });
      const paid = createBudgetedGenerate(generate, {
        ledgerPath: `${root}/usage.jsonl`,
        totalBudgetUsd: 5,
        sliceCapUsd: 0.5,
        sliceId: "luna-screen",
        runId: log.path,
      });
      let calls = 0;
      const controller = new LiveController(log, (request, onToken) => {
        if (++calls > 5) throw new Error("Screening request ceiling reached.");
        return paid(request, onToken);
      });
      let finish: () => void = () => {};
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const observe = () => {
        if (
          !controller.snapshot().running &&
          ["ended", "paused"].includes(log.state.status)
        )
          finish();
      };
      const unsubscribe = controller.onChange(observe);
      const interrupt = () => void controller.pause();
      const timer = setTimeout(interrupt, 650_000);
      process.once("SIGINT", interrupt);
      process.once("SIGTERM", interrupt);
      console.log(`Starting ${label}`);
      try {
        await controller.start();
        observe();
        await finished;
      } finally {
        clearTimeout(timer);
        unsubscribe();
        process.off("SIGINT", interrupt);
        process.off("SIGTERM", interrupt);
        await controller.close();
        await log.close();
        const audit = await inspectComposer(log.path);
        await writeFile(
          `${directory}/${label}-audit.json`,
          `${JSON.stringify(audit, null, 2)}\n`,
          { flag: "wx" },
        );
        const anonymousId = randomUUID();
        blinding[anonymousId] = label;
        await writeFile(
          `${reviewDirectory}/${anonymousId}.json`,
          `${JSON.stringify(
            {
              id: anonymousId,
              speakingSpace: audit.speakingSpace,
              requests: audit.requests.map((request) => ({
                sequence: request.sequence,
                collectiveBefore: request.collectiveBefore,
                appended: request.appended,
                sources: request.sources,
                inputVerified: request.inputVerified,
              })),
            },
            null,
            2,
          )}\n`,
          { flag: "wx" },
        );
        console.log(
          JSON.stringify({
            label,
            status: audit.status,
            responses: audit.requests.length,
            words: audit.speakingSpace.collectiveWords,
          }),
        );
      }
      if (log.state.status !== "ended" || log.state.scheduler.cycle !== 5)
        throw new Error("Incomplete screening run; inspect the saved attempt.");
    }
  } finally {
    await writeFile(
      `${directory}/blinding-key.json`,
      `${JSON.stringify(blinding, null, 2)}\n`,
      { flag: "wx" },
    );
  }
  return directory;
}

if (import.meta.main) {
  const score = process.argv[3];
  if (
    process.argv.length > 4 ||
    (score !== undefined && score !== "eight" && score !== "correction")
  )
    throw new Error(
      "Expected optional previous attempt path and follow-up score: eight or correction.",
    );
  await screenLuna(process.argv[2], score);
}
