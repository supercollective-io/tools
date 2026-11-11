import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { ContinuousController } from "./continuous.ts";
import {
  type ContinuousContribution,
  ContinuousLog,
  type ContinuousState,
  isContinuousRun,
  readContinuousRun,
} from "./continuous-runs.ts";
import {
  type ContinuousConfig,
  continuousConfigSchema,
} from "./continuous-schema.ts";
import { GenerationError } from "./controller.ts";
import { generate, validateModelEnvironment } from "./models.ts";
import { readJson, scenarioSchema } from "./schema.ts";

type Options = {
  scenario?: string;
  config?: string;
  run?: string;
  out?: string;
  auto?: boolean;
};

function name(state: ContinuousState, id: string): string {
  return state.scenario.voices.find((voice) => voice.id === id)?.name ?? id;
}

function showInputs(
  state: ContinuousState,
  batchId: string,
  contributions: ContinuousContribution[],
): void {
  process.stdout.write(
    `\n[INPUTS — continuous batch ${batchId} — saved simulated text]\n`,
  );
  for (const contribution of contributions) {
    process.stdout.write(
      `\n${name(state, contribution.participantId)} — turn ${contribution.turnId}, characters [${contribution.from}, ${contribution.to})${contribution.from > 0 ? " — continuation" : ""}:\n${contribution.text}\n`,
    );
  }
}

function showOutstanding(state: ContinuousState): void {
  if (state.pendingBatch) {
    showInputs(state, state.pendingBatch.id, state.pendingBatch.contributions);
    process.stdout.write(
      "\n[COLLECTIVE — pending; no accepted passage for this batch]\n",
    );
  }
  for (const turn of state.turns) {
    if (turn.status !== "completed")
      process.stdout.write(
        `\n[${name(state, turn.participantId)} — turn ${turn.id}: ${turn.status}; saved text retained]\n`,
      );
    const remaining = Array.from(turn.text).slice(turn.consumed).join("");
    if (remaining)
      process.stdout.write(
        `\n[UNCONSUMED INPUT — ${name(state, turn.participantId)} — turn ${turn.id}, from character ${turn.consumed}]\n${remaining}\n`,
      );
  }
}

function validateNeeded(
  config: ContinuousConfig,
  participants: boolean,
  composer: boolean,
): void {
  if (composer) validateModelEnvironment(config.composer);
  if (participants) validateModelEnvironment(config.continuous.participants);
}

async function run(log: ContinuousLog): Promise<void> {
  const cancellation = new AbortController();
  const interrupt = () => cancellation.abort();
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  let composing = false;
  const statuses: string[] = [];
  const arriving = new Set<string>();
  const status = (text: string) => {
    if (composing) statuses.push(text);
    else process.stdout.write(text);
  };
  const flush = () => {
    if (composing) process.stdout.write("\n");
    composing = false;
    for (const text of statuses.splice(0)) process.stdout.write(text);
  };
  try {
    process.stdout.write(
      `Continuous simulation: ${log.path}\n${log.state.scenario.title}\nParticipant chunks are saved as they arrive; interrupted partial text is retained.\nCollective text is provisional until [accepted and saved]. Ctrl+C pauses.\nAt most ${log.state.config.continuous.concurrency} participant calls and one composer call run concurrently.\n`,
    );
    const last = log.state.passages.at(-1);
    if (last)
      process.stdout.write(
        `\nLast accepted collective passage:\n${last.text}\n`,
      );
    showOutstanding(log.state);
    try {
      await new ContinuousController(log, generate).run(cancellation.signal, {
        onParticipantStart: (id, turnId) =>
          status(`\n[${name(log.state, id)} — turn ${turnId}: generating]\n`),
        onParticipantText: (id, turnId) => {
          if (!arriving.has(turnId)) {
            arriving.add(turnId);
            status(
              `\n[${name(log.state, id)} — turn ${turnId}: input arriving and saved]\n`,
            );
          }
        },
        onParticipantEnd: (id, turnId, outcome) =>
          status(`\n[${name(log.state, id)} — turn ${turnId}: ${outcome}]\n`),
        onBatch: (id, contributions) => {
          flush();
          showInputs(log.state, id, contributions);
          if (contributions.some((contribution) => contribution.text.trim())) {
            process.stdout.write("\n[COLLECTIVE — provisional]\n");
            composing = true;
          } else
            process.stdout.write(
              "\n[COLLECTIVE — whitespace-only input; no passage]\n",
            );
        },
        onComposerToken: (token) => {
          if (!composing) {
            process.stdout.write("\n[COLLECTIVE — provisional]\n");
            composing = true;
          }
          process.stdout.write(token);
        },
        onPassage: () => {
          process.stdout.write("\n[accepted and saved]\n");
          flush();
        },
      });
    } catch (error) {
      flush();
      const nativeAbort =
        cancellation.signal.aborted &&
        error instanceof Error &&
        error.name === "AbortError";
      if (!(error instanceof GenerationError) && !nativeAbort) throw error;
      process.stderr.write(
        `\n[not accepted] ${cancellation.signal.aborted ? "Continuous simulation interrupted; saved participant text is retained." : (error as GenerationError).message}\n`,
      );
      if (!cancellation.signal.aborted) process.exitCode = 1;
    }
    flush();
    if (log.state.complete)
      process.stdout.write("\nContinuous simulation complete.\n");
    else {
      showOutstanding(log.state);
      process.stdout.write(
        `\nPaused. Resume with: pnpm cli resume --run '${log.path.replaceAll("'", "'\\''")}'\n`,
      );
    }
    if (cancellation.signal.aborted) process.exitCode = 130;
  } finally {
    flush();
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    await log.close();
  }
}

export async function handleContinuousCommand(
  command: string,
  values: Options,
): Promise<boolean> {
  if (command === "simulate-continuous") {
    if (!values.scenario || !values.config)
      throw new Error("simulate-continuous requires --scenario and --config.");
    const scenario = await readJson(
      values.scenario,
      scenarioSchema,
      "Scenario",
    );
    const config = await readJson(
      values.config,
      continuousConfigSchema,
      "Continuous configuration",
    );
    validateNeeded(config, true, true);
    await run(
      await ContinuousLog.create(
        resolve(values.out ?? `runs/${randomUUID()}.jsonl`),
        { type: "continuous.created", scenario, config },
      ),
    );
    return true;
  }
  if (!["resume", "replay", "rerun"].includes(command) || !values.run)
    return false;
  const path = resolve(values.run);
  if (!(await isContinuousRun(path))) return false;
  if (command === "rerun")
    throw new Error(
      "Rerun is not supported for continuous simulations. Replay the saved history or start a new simulate-continuous run.",
    );
  const read = await readContinuousRun(path);
  if (read.tail.length)
    process.stderr.write(
      "Warning: ignored an interrupted final log line. Resume preserves that fragment before recovery.\n",
    );
  if (command === "replay") {
    process.stdout.write(
      `${read.state.scenario.title}\nContinuous simulation — saved input portions and accepted collective passages.\n`,
    );
    for (const batch of read.state.batches) {
      if (batch.id === read.state.pendingBatch?.id) continue;
      showInputs(read.state, batch.id, batch.contributions);
      if (batch.passage)
        process.stdout.write(
          `\n[COLLECTIVE — accepted and saved]\n${batch.passage.text}\n`,
        );
      else
        process.stdout.write(
          "\n[COLLECTIVE — whitespace-only input; no passage]\n",
        );
    }
    showOutstanding(read.state);
    process.stdout.write(
      `\n${read.state.passages.length} accepted passages; ${read.state.complete ? "complete" : "paused or interrupted"}.\n`,
    );
    return true;
  }
  if (read.state.complete) {
    process.stdout.write(
      "Continuous simulation already complete. Use replay to display it.\n",
    );
    return true;
  }
  const participants = read.state.scenario.voices.some(
    (voice) =>
      read.state.turns.filter((turn) => turn.participantId === voice.id)
        .length < read.state.config.continuous.maxTurnsPerParticipant,
  );
  const composer =
    participants ||
    Boolean(
      read.state.pendingBatch?.contributions.some((contribution) =>
        contribution.text.trim(),
      ),
    ) ||
    read.state.turns.some((turn) =>
      Array.from(turn.text).slice(turn.consumed).join("").trim(),
    );
  validateNeeded(read.state.config, participants, composer);
  await run(await ContinuousLog.resume(path));
  return true;
}
