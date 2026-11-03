import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { contributionsFor } from "./composition.ts";
import { Controller, GenerationError } from "./controller.ts";
import type { Generate } from "./models.ts";
import { RunLog, readRun } from "./runs.ts";
import {
  type Contribution,
  configSchema,
  readJson,
  type Score,
  scoreSchema,
} from "./schema.ts";

const help = `Collective Microphone — scripted collective writing

  pnpm cli run --score <score.json> --config <config.json> [--out <new.jsonl>]
  pnpm cli resume --run <run.jsonl>
  pnpm cli replay --run <run.jsonl>
  pnpm cli rerun --run <run.jsonl> [--config <config.json>] [--out <new.jsonl>]

At the prompt: Enter/next advances one batch; retry retries a failed batch;
q/quit pauses the run. Ctrl+C cancels the current attempt. Resume later.
Replay displays accepted passages immediately without contacting a model.
Rerun composes again from admitted inputs, starting a separate history.
New logs default to runs/<UUID>.jsonl. Existing files are never overwritten.
`;

function showInputs(
  score: Score,
  batchIndex: number,
  inputs: Contribution[],
): void {
  process.stdout.write(
    `\n[INPUTS — batch ${batchIndex + 1}/${score.batches.length} — scripted/fixed text]\n`,
  );
  for (const contribution of inputs) {
    const participant = score.voices.find(
      (voice) => voice.id === contribution.participantId,
    );
    process.stdout.write(
      `\n${participant?.name ?? contribution.participantId}:\n${contribution.text}\n`,
    );
  }
}

function showCollectiveLabel(
  score: Score,
  batchIndex: number,
  status: string,
): void {
  process.stdout.write(
    `\n[COLLECTIVE — batch ${batchIndex + 1}/${score.batches.length} — ${status}]\n`,
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
      `\n[${state.passages.length}/${state.score.batches.length} accepted] Enter: ${state.pending ? "retry" : "next"}; q: pause > `,
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
        initial.admitted[last.batchIndex] ?? [],
      );
      showCollectiveLabel(initial.score, last.batchIndex, "accepted and saved");
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
      showInputs(state.score, batchIndex, inputs);
      showCollectiveLabel(state.score, batchIndex, "provisional");
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
    !["run", "resume", "replay", "rerun"].includes(command)
  )
    throw new Error(
      "Expected run, resume, replay or rerun. Use --help for usage.",
    );
  const allowed: Record<string, string[]> = {
    run: ["score", "config", "out"],
    resume: ["run"],
    replay: ["run"],
    rerun: ["run", "config", "out"],
  };
  if (Object.keys(values).some((key) => !allowed[command]?.includes(key)))
    throw new Error(
      "An option is not supported by this command. Use --help for usage.",
    );

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
      showInputs(read.state.score, index, read.state.admitted[index] ?? []);
      showCollectiveLabel(read.state.score, index, "accepted and saved");
      process.stdout.write(`${passage.text}\n`);
    }
    if (read.state.pending) {
      const batchIndex = read.state.passages.length;
      showInputs(read.state.score, batchIndex, read.state.pending);
      showCollectiveLabel(
        read.state.score,
        batchIndex,
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
    if (read.state.passages.length === read.state.score.batches.length) {
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
  const score: Score = {
    ...read.state.score,
    batches: read.state.score.batches.slice(0, read.state.admitted.length),
  };
  const { generate, validateModelEnvironment } = await import("./models.ts");
  validateModelEnvironment(config.composer);
  const log = await RunLog.create(
    resolve(values.out ?? `runs/${randomUUID()}.jsonl`),
    { type: "run.created", score, config, sourceRunId: read.state.runId },
  );
  await rehearse(log, generate);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Error: ${error instanceof Error ? error.message : "Command failed."}\n`,
  );
  process.exitCode = 1;
});
