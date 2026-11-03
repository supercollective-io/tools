import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { contributionsFor, percentageRanges } from "./composition.ts";
import { handleContinuousCommand } from "./continuous-cli.ts";
import { isContinuousRun } from "./continuous-runs.ts";
import { Controller, GenerationError } from "./controller.ts";
import { handleLiveCommand } from "./live-cli.ts";
import type { Generate } from "./models.ts";
import { RunLog, readRun } from "./runs.ts";
import {
  type Contribution,
  configSchema,
  readJson,
  type Score,
  scoreSchema,
} from "./schema.ts";
import { handleSimulationCommand } from "./simulation-cli.ts";

const help = `Collective Microphone — collective writing rehearsals

  pnpm cli run --score <score.json> --config <config.json> [--out <new.jsonl>]
  pnpm cli simulate --scenario <scenario.json> --config <config.json> [--out <new.jsonl>] [--auto]
  pnpm cli rehearse --scenario <scenario.json> --config <config.json> [--out <new.jsonl>] [--port <3000>]
  pnpm cli rehearse --run <run.jsonl> [--port <3000>]
  pnpm cli simulate-continuous --scenario <scenario.json> --config <config.json> [--out <new.jsonl>]
  pnpm cli resume --run <run.jsonl> [--auto]
  pnpm cli replay --run <run.jsonl>
  pnpm cli rerun --run <run.jsonl> [--config <config.json>] [--out <new.jsonl>]

At the prompt: Enter/next advances one step; retry retries a failed step;
q/quit pauses the run. Ctrl+C cancels the current attempt. Resume later.
Replay displays accepted passages immediately without contacting a model.
Rerun composes again from admitted inputs, starting a separate history.
Simulate generates participant responses in rounds. --auto advances simulation rounds automatically.
Simulation rerun uses frozen participant contributions; use simulate for fresh contributions.
Rehearse opens a local live monitor in Ready state; press Start in the browser.
Simulate-continuous co-writes in the terminal with schemaVersion 2 live configuration; Ctrl+C pauses it.
New logs default to runs/<UUID>.jsonl. Existing files are never overwritten.
`;

function showInputs(
  score: Score,
  batchIndex: number,
  totalSteps: number,
  inputs: Contribution[],
): void {
  process.stdout.write(
    `\n[INPUTS — ${stepLabel(score, batchIndex, totalSteps)} — scripted/fixed text]\n`,
  );
  for (const contribution of inputs) {
    const participant = score.voices.find(
      (voice) => voice.id === contribution.participantId,
    );
    process.stdout.write(
      `\n${participant?.name ?? contribution.participantId}:\n${contribution.text}${contribution.text.length === 0 ? "(no new characters in this interval)" : ""}\n`,
    );
  }
}

function stepLabel(score: Score, index: number, totalSteps: number): string {
  if (score.schemaVersion === 1) return `batch ${index + 1}/${totalSteps}`;
  const range = percentageRanges(score)[index];
  if (!range) throw new Error("Score step has no percentage range.");
  return `step ${index + 1}/${totalSteps} — ${range.from}–${range.to}%`;
}

function showCollectiveLabel(
  score: Score,
  batchIndex: number,
  totalSteps: number,
  status: string,
): void {
  process.stdout.write(
    `\n[COLLECTIVE — ${stepLabel(score, batchIndex, totalSteps)} — ${status}]\n`,
  );
}

async function rehearse(log: RunLog, generate: Generate): Promise<void> {
  const controller = new Controller(log, generate);
  const cancellation = new AbortController();
  let lastAttemptFailed = false;
  const input = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  });
  const interrupt = () => {
    cancellation.abort();
    input.close();
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  input.on("SIGINT", interrupt);
  const prompt = () => {
    const state = log.state;
    process.stdout.write(
      `\n[${state.passages.length}/${state.totalSteps} accepted] Enter: ${state.pending ? "retry" : "next"}; q: pause > `,
    );
  };
  try {
    process.stdout.write(
      `Run: ${log.path}\n${log.state.score.title}\nStreamed text is provisional until [accepted].\n`,
    );
    const initial = log.state;
    const last = initial.passages.at(-1);
    if (last) {
      showInputs(
        initial.score,
        last.batchIndex,
        initial.totalSteps,
        initial.admitted[last.batchIndex] ?? [],
      );
      showCollectiveLabel(
        initial.score,
        last.batchIndex,
        initial.totalSteps,
        "accepted and saved",
      );
      process.stdout.write(`\nLast accepted passage:\n${last.text}\n`);
    }
    prompt();
    for await (const line of input) {
      if (cancellation.signal.aborted) break;
      const command = line.trim().toLowerCase();
      if (command === "q" || command === "quit") break;
      if (!["", "n", "next", "retry"].includes(command)) {
        process.stdout.write("\nUse Enter, next, retry or q.\n");
        prompt();
        continue;
      }
      const state = log.state;
      const batchIndex = state.passages.length;
      const inputs =
        state.pending ??
        contributionsFor(
          state.score,
          batchIndex,
          state.passages.at(-1)?.id ?? null,
        );
      showInputs(state.score, batchIndex, state.totalSteps, inputs);
      showCollectiveLabel(
        state.score,
        batchIndex,
        state.totalSteps,
        "provisional",
      );
      try {
        await controller.advance(cancellation.signal, (token) =>
          process.stdout.write(token),
        );
        lastAttemptFailed = false;
        process.stdout.write("\n[accepted and saved]\n");
      } catch (error) {
        if (!(error instanceof GenerationError)) throw error;
        lastAttemptFailed = true;
        process.stderr.write(`\n[not accepted] ${error.message}\n`);
        if (cancellation.signal.aborted) break;
      }
      if (log.state.complete) break;
      prompt();
    }
    process.stdout.write(
      log.state.complete
        ? "\nRun complete.\n"
        : `\nPaused. Resume with: pnpm cli resume --run '${log.path.replaceAll("'", "'\\''")}'\n`,
    );
    if (cancellation.signal.aborted) process.exitCode = 130;
    else if (lastAttemptFailed) process.exitCode = 1;
  } finally {
    input.close();
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    await log.close();
  }
}

async function main(): Promise<void> {
  const parsed = (() => {
    try {
      return parseArgs({
        allowPositionals: true,
        options: {
          help: { type: "boolean", short: "h" },
          score: { type: "string" },
          config: { type: "string" },
          run: { type: "string" },
          out: { type: "string" },
          scenario: { type: "string" },
          auto: { type: "boolean" },
          port: { type: "string" },
        },
      });
    } catch {
      throw new Error("Invalid command options. Use --help for usage.");
    }
  })();
  const { values, positionals } = parsed;
  if (values.help || positionals.length === 0) {
    process.stdout.write(help);
    return;
  }
  const command = positionals[0];
  if (
    positionals.length !== 1 ||
    !command ||
    ![
      "run",
      "rehearse",
      "simulate",
      "simulate-continuous",
      "resume",
      "replay",
      "rerun",
    ].includes(command)
  )
    throw new Error(
      "Expected run, rehearse, simulate, simulate-continuous, resume, replay or rerun. Use --help for usage.",
    );
  const allowed: Record<string, string[]> = {
    run: ["score", "config", "out"],
    rehearse: ["scenario", "config", "run", "out", "port"],
    simulate: ["scenario", "config", "out", "auto"],
    "simulate-continuous": ["scenario", "config", "out", "auto"],
    resume: ["run", "auto"],
    replay: ["run"],
    rerun: ["run", "config", "out"],
  };
  if (Object.keys(values).some((key) => !allowed[command]?.includes(key)))
    throw new Error(
      "An option is not supported by this command. Use --help for usage.",
    );

  if (await handleLiveCommand(command, values)) return;
  if (
    ["resume", "replay", "rerun"].includes(command) &&
    values.run &&
    (await isContinuousRun(resolve(values.run)))
  )
    process.stderr.write(
      "Warning: this historical continuous log uses legacy turns and batches. New live rehearsals use schemaVersion 2.\n",
    );
  if (await handleContinuousCommand(command, values)) return;
  if (await handleSimulationCommand(command, values)) return;
  if (values.auto)
    throw new Error("--auto is supported only for simulation runs.");

  if (command === "run") {
    if (!values.score || !values.config)
      throw new Error("run requires --score and --config.");
    const score = await readJson(values.score, scoreSchema, "Score");
    const config = await readJson(values.config, configSchema, "Configuration");
    const { generate, validateModelEnvironment } = await import("./models.ts");
    validateModelEnvironment(config.composer);
    const log = await RunLog.create(
      resolve(values.out ?? `runs/${randomUUID()}.jsonl`),
      { type: "run.created", score, config },
    );
    await rehearse(log, generate);
    return;
  }
  if (!values.run) throw new Error(`${command} requires --run.`);
  const path = resolve(values.run);
  const read = await readRun(path);
  if (read.tail.length)
    process.stderr.write(
      "Warning: ignored an interrupted final log line. Resume preserves that fragment before recovery.\n",
    );
  if (command === "replay") {
    process.stdout.write(`${read.state.score.title}\n`);
    for (const [index, passage] of read.state.passages.entries()) {
      showInputs(
        read.state.score,
        index,
        read.state.totalSteps,
        read.state.admitted[index] ?? [],
      );
      showCollectiveLabel(
        read.state.score,
        index,
        read.state.totalSteps,
        "accepted and saved",
      );
      process.stdout.write(`${passage.text}\n`);
    }
    if (read.state.pending) {
      const batchIndex = read.state.passages.length;
      showInputs(
        read.state.score,
        batchIndex,
        read.state.totalSteps,
        read.state.pending,
      );
      showCollectiveLabel(
        read.state.score,
        batchIndex,
        read.state.totalSteps,
        "pending — no accepted collective passage",
      );
    }
    process.stdout.write(
      `\n${read.state.passages.length} accepted passages; ${read.state.complete ? "complete" : "paused or interrupted"}.\n`,
    );
    return;
  }
  if (command === "resume") {
    if (read.state.complete) {
      process.stdout.write(
        "Run already complete. Use replay to display it or rerun to compose anew.\n",
      );
      return;
    }
    if (read.state.passages.length === read.state.totalSteps) {
      const log = await RunLog.resume(path);
      try {
        await log.append({ type: "run.completed" });
      } finally {
        await log.close();
      }
      process.stdout.write("Run complete.\n");
      return;
    }
    const { generate, validateModelEnvironment } = await import("./models.ts");
    validateModelEnvironment(read.state.config.composer);
    await rehearse(await RunLog.resume(path), generate);
    return;
  }
  if (!read.state.admitted.length)
    throw new Error("This run has no admitted contributions to rerun.");
  const config = values.config
    ? await readJson(values.config, configSchema, "Configuration")
    : read.state.config;
  const { generate, validateModelEnvironment } = await import("./models.ts");
  validateModelEnvironment(config.composer);
  const log = await RunLog.create(
    resolve(values.out ?? `runs/${randomUUID()}.jsonl`),
    {
      type: "run.created",
      score: read.state.score,
      config,
      sourceRunId: read.state.runId,
      stepLimit: read.state.admitted.length,
    },
  );
  await rehearse(log, generate);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Error: ${error instanceof Error ? error.message : "Command failed."}\n`,
  );
  process.exitCode = 1;
});
