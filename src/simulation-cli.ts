import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { GenerationError } from "./controller.ts";
import { generate, validateModelEnvironment } from "./models.ts";
import {
  parse,
  readJson,
  type SimulationConfig,
  scenarioSchema,
  simulationConfigSchema,
} from "./schema.ts";
import { SimulationController } from "./simulation.ts";
import {
  isSimulationRun,
  readSimulationRun,
  recordedRoundsFor,
  SimulationLog,
} from "./simulation-runs.ts";

type SimulationState = Awaited<ReturnType<typeof readSimulationRun>>["state"];
type Options = {
  scenario?: string;
  config?: string;
  run?: string;
  out?: string;
  auto?: boolean;
};

function showParticipant(
  state: SimulationState,
  id: string,
  text: string,
): void {
  const name =
    state.scenario.voices.find((voice) => voice.id === id)?.name ?? id;
  process.stdout.write(
    `\n${name} — ${state.recordedRounds ? "recorded" : "simulated"} participant:\n${text}\n`,
  );
}

function showRound(
  state: SimulationState,
  round: SimulationState["rounds"][number],
): void {
  process.stdout.write(
    `\n[INPUTS — round ${round.index + 1}/${state.config.simulation.maxRounds} — ${state.recordedRounds ? "recorded responses" : "simulated participants"}]\n`,
  );
  for (const voice of state.scenario.voices) {
    const response = round.responses[voice.id];
    if (response) showParticipant(state, voice.id, response.text);
    else process.stdout.write(`\n${voice.name}: (response pending)\n`);
  }
  if (round.passage)
    process.stdout.write(
      `\n[COLLECTIVE — accepted and saved]\n${round.passage.text}\n`,
    );
  else process.stdout.write("\n[COLLECTIVE — pending; no accepted passage]\n");
}

function validateEnvironment(
  config: SimulationConfig,
  participantsRequired: boolean,
): void {
  validateModelEnvironment(config.composer);
  if (participantsRequired)
    validateModelEnvironment(config.simulation.participants);
}

async function rehearse(log: SimulationLog, automatic: boolean): Promise<void> {
  const controller = new SimulationController(log, generate);
  const cancellation = new AbortController();
  // Automatic mode needs no stdin and must also work when stdin is closed.
  const input = automatic
    ? undefined
    : createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      });
  const interrupt = () => {
    cancellation.abort();
    input?.close();
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  input?.on("SIGINT", interrupt);
  let failed = false;
  const prompt = () =>
    process.stdout.write(
      `\n[${log.state.roundsCompleted}/${log.state.config.simulation.maxRounds} rounds complete] Enter: next/retry; q: pause > `,
    );
  const advance = async () => {
    const state = log.state;
    const active = state.rounds.at(-1);
    const index =
      active && !active.complete ? active.index : state.roundsCompleted;
    if (index < state.config.simulation.maxRounds) {
      process.stdout.write(
        `\n[INPUTS — round ${index + 1}/${state.config.simulation.maxRounds} — ${state.recordedRounds ? "recorded responses" : "simulated participants"}]\n`,
      );
      if (active && !active.complete) {
        for (const voice of state.scenario.voices) {
          const saved = active.responses[voice.id];
          if (saved) showParticipant(state, voice.id, saved.text);
        }
      }
    }
    try {
      await controller.advance(cancellation.signal, {
        onParticipantStart: (id) => {
          const name =
            log.state.scenario.voices.find((voice) => voice.id === id)?.name ??
            id;
          process.stdout.write(`\n[${name} contributing…]\n`);
        },
        onParticipant: (id, text) => showParticipant(log.state, id, text),
        onComposerStart: () =>
          process.stdout.write("\n[COLLECTIVE — provisional]\n"),
        onToken: (token) => process.stdout.write(token),
      });
      failed = false;
      if (log.state.passages.length > state.passages.length)
        process.stdout.write("\n[accepted and saved]\n");
    } catch (error) {
      if (
        cancellation.signal.aborted &&
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        failed = true;
        process.stderr.write(
          "\n[not accepted] Simulation interrupted; completed responses remain saved.\n",
        );
        return;
      }
      if (!(error instanceof GenerationError)) throw error;
      failed = true;
      process.stderr.write(`\n[not accepted] ${error.message}\n`);
    }
  };
  try {
    process.stdout.write(
      `Simulation: ${log.path}\n${log.state.scenario.title}\nStreamed collective text is provisional until accepted.\n`,
    );
    if (log.state.recordedRounds)
      process.stdout.write(
        "Recorded rerun: frozen participant contributions from the original run; no new participant contributions are generated.\n",
      );
    const initial = log.state;
    const last = initial.rounds.at(-1);
    if (last) showRound(initial, last);
    if (automatic) {
      while (!log.state.complete && !cancellation.signal.aborted) {
        await advance();
        if (failed || log.state.complete || cancellation.signal.aborted) break;
        try {
          await delay(log.state.config.simulation.intervalMs, undefined, {
            signal: cancellation.signal,
          });
        } catch {
          if (!cancellation.signal.aborted)
            throw new Error("Cannot wait for the next simulation round.");
        }
      }
    } else if (input) {
      prompt();
      for await (const line of input) {
        if (cancellation.signal.aborted) break;
        const command = line.trim().toLowerCase();
        if (["q", "quit"].includes(command)) break;
        if (!["", "n", "next", "retry"].includes(command))
          process.stdout.write("\nUse Enter, next, retry or q.\n");
        else await advance();
        if (log.state.complete || cancellation.signal.aborted) break;
        prompt();
      }
    }
    process.stdout.write(
      log.state.complete
        ? "\nSimulation complete.\n"
        : `\nPaused. Resume with: pnpm cli resume --run '${log.path.replaceAll("'", "'\\''")}'\n`,
    );
    if (cancellation.signal.aborted) process.exitCode = 130;
    else if (failed) process.exitCode = 1;
  } finally {
    input?.close();
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    await log.close();
  }
}

export async function handleSimulationCommand(
  command: string,
  values: Options,
): Promise<boolean> {
  if (command === "simulate") {
    if (!values.scenario || !values.config)
      throw new Error("simulate requires --scenario and --config.");
    const scenario = await readJson(
      values.scenario,
      scenarioSchema,
      "Scenario",
    );
    const config = await readJson(
      values.config,
      simulationConfigSchema,
      "Simulation configuration",
    );
    validateEnvironment(config, true);
    await rehearse(
      await SimulationLog.create(
        resolve(values.out ?? `runs/${randomUUID()}.jsonl`),
        { type: "simulation.created", scenario, config },
      ),
      Boolean(values.auto),
    );
    return true;
  }
  if (!["resume", "replay", "rerun"].includes(command) || !values.run)
    return false;
  const path = resolve(values.run);
  if (!(await isSimulationRun(path))) return false;
  const read = await readSimulationRun(path);
  if (read.tail.length)
    process.stderr.write(
      "Warning: ignored an interrupted final log line. Resume preserves that fragment before recovery.\n",
    );
  if (command === "replay") {
    process.stdout.write(`${read.state.scenario.title}\n`);
    if (read.state.recordedRounds)
      process.stdout.write(
        "Recorded rerun: frozen participant contributions from the original run; no new participant contributions are generated.\n",
      );
    for (const round of read.state.rounds) showRound(read.state, round);
    process.stdout.write(
      `\n${read.state.roundsCompleted} rounds complete; ${read.state.complete ? "complete" : "paused or interrupted"}.\n`,
    );
    return true;
  }
  if (command === "resume") {
    if (read.state.complete) {
      process.stdout.write(
        "Simulation already complete. Use replay or rerun.\n",
      );
      return true;
    }
    const final = read.state.rounds.at(-1);
    const finishRound =
      final &&
      !final.complete &&
      final.index === read.state.config.simulation.maxRounds - 1 &&
      final.passage !== null;
    if (
      read.state.roundsCompleted === read.state.config.simulation.maxRounds ||
      finishRound
    ) {
      const log = await SimulationLog.resume(path);
      try {
        // Recheck the locked state rather than relying on the earlier read.
        const current = log.state;
        if (!current.complete) {
          const round = current.rounds.at(-1);
          if (
            current.roundsCompleted < current.config.simulation.maxRounds &&
            round &&
            !round.complete &&
            round.index === current.config.simulation.maxRounds - 1 &&
            round.passage !== null
          ) {
            await log.append({
              type: "round.completed",
              roundIndex: round.index,
            });
          }
          await log.append({ type: "run.completed" });
        }
      } finally {
        await log.close();
      }
      process.stdout.write("Simulation complete.\n");
      return true;
    }
    const current = read.state.rounds[read.state.roundsCompleted];
    const participantCallsRemain =
      !read.state.recordedRounds &&
      (read.state.roundsCompleted <
        read.state.config.simulation.maxRounds - 1 ||
        !current ||
        read.state.scenario.voices.some(
          (voice) => !current.responses[voice.id],
        ));
    validateEnvironment(read.state.config, participantCallsRemain);
    await rehearse(await SimulationLog.resume(path), Boolean(values.auto));
    return true;
  }
  const recordedRounds = recordedRoundsFor(read.state);
  if (!recordedRounds.length)
    throw new Error(
      "This simulation has no fully recorded participant rounds to rerun.",
    );
  let config = read.state.config;
  if (values.config) {
    let override: unknown;
    try {
      override = JSON.parse(await readFile(values.config, "utf8"));
    } catch {
      throw new Error("Cannot read a valid rerun configuration.");
    }
    if (
      typeof override !== "object" ||
      override === null ||
      Array.isArray(override)
    )
      throw new Error("Rerun configuration must be an object.");
    config = parse(
      simulationConfigSchema,
      {
        ...override,
        simulation:
          "simulation" in override
            ? override.simulation
            : read.state.config.simulation,
      },
      "Simulation configuration",
    );
  }
  config = {
    ...config,
    simulation: { ...config.simulation, maxRounds: recordedRounds.length },
  };
  validateEnvironment(config, false);
  await rehearse(
    await SimulationLog.create(
      resolve(values.out ?? `runs/${randomUUID()}.jsonl`),
      {
        type: "simulation.created",
        scenario: read.state.scenario,
        config,
        sourceRunId: read.state.runId,
        recordedRounds,
      },
    ),
    false,
  );
  return true;
}
