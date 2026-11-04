import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { fixedComposerExperiment } from "./composer-experiment.ts";
import { LiveController } from "./live.ts";
import {
  isLiveRun,
  LiveLog,
  type LiveState,
  readLiveRun,
} from "./live-runs.ts";
import { type LiveConfig, liveConfigSchema } from "./live-schema.ts";
import { startLiveServer } from "./live-server.ts";
import { generate, validateModelEnvironment } from "./models.ts";
import {
  configSchema,
  parse,
  readJson,
  scenarioSchema,
  scoreSchema,
} from "./schema.ts";

type Options = {
  score?: string;
  scenario?: string;
  config?: string;
  run?: string;
  out?: string;
  auto?: boolean;
  port?: string;
};

function validateModels(config: LiveConfig): void {
  validateModelEnvironment(config.composer);
  if (config.live.mode !== "fixed")
    validateModelEnvironment(config.live.participants);
}

async function readConfig(path: string): Promise<LiveConfig> {
  const value = await readJson(path, z.unknown(), "Live configuration");
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 1
  )
    throw new Error(
      "Legacy continuous configuration uses turns and batches. Migrate to schemaVersion 2 with live settings; see examples/live-ollama.json.",
    );
  return parse(liveConfigSchema, value, "Live configuration");
}

function writerName(state: LiveState, id: string): string {
  if (id === "collective") return "COLLECTIVE";
  return (
    state.scenario.voices.find((voice) => `participant/${voice.id}` === id)
      ?.name ?? id
  );
}

/** Show journalled additions immediately, even while another writer is active. */
async function runTerminal(log: LiveLog): Promise<void> {
  const controller = new LiveController(log, generate);
  const offsets = new Map<string, number>();
  let lastWriter: string | undefined;
  let begun = false;
  let finish: (() => void) | undefined;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const show = () => {
    const state = log.state;
    for (const writer of [...state.participants, state.composer]) {
      const previous = offsets.get(writer.id) ?? 0;
      const delta = writer.text.slice(previous);
      offsets.set(writer.id, writer.text.length);
      if (!delta) continue;
      if (lastWriter !== writer.id) {
        process.stdout.write(
          `\n[${writerName(state, writer.id)} — saved live text]\n`,
        );
        lastWriter = writer.id;
      }
      process.stdout.write(delta);
    }
    const runtime = controller.snapshot();
    if (
      begun &&
      (["paused", "ended"].includes(state.status) || runtime.error) &&
      !runtime.running
    )
      finish?.();
  };
  const unsubscribe = controller.onChange(show);
  let interrupted = false;
  const interrupt = () => {
    if (interrupted) return;
    interrupted = true;
    void controller
      .pause()
      .then(() => finish?.())
      .catch(() => finish?.());
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    process.stdout.write(
      `Live rehearsal: ${log.path}\n${log.state.scenario.title}\nMode: ${log.state.config.live.mode ?? "continuous"}. Appended text is saved immediately. Ctrl+C pauses.\n`,
    );
    show();
    begun = true;
    await controller.start();
    show();
    await finished;
    const runtime = controller.snapshot();
    if (runtime.error) {
      process.stderr.write(`\n${runtime.error}\n`);
      process.exitCode = 1;
    }
    process.stdout.write(
      log.state.status === "ended"
        ? "\nLive rehearsal ended.\n"
        : `\nPaused. Resume with: pnpm cli resume --run '${log.path.replaceAll("'", "'\\''")}'\n`,
    );
    if (interrupted) process.exitCode = 130;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    unsubscribe();
    try {
      await controller.close();
    } finally {
      await log.close();
    }
  }
}

async function serve(log: LiveLog, portOption?: string): Promise<void> {
  let port = 3000;
  if (portOption !== undefined) {
    if (!/^\d+$/.test(portOption) || Number(portOption) > 65535) {
      await log.close();
      throw new Error("--port must be an integer between 0 and 65535.");
    }
    port = Number(portOption);
  }
  const controller = new LiveController(log, generate);
  let server: Awaited<ReturnType<typeof startLiveServer>>;
  try {
    server = await startLiveServer({
      log,
      controller,
      port,
      beforeStart: () => validateModels(log.state.config),
    });
  } catch (error) {
    try {
      await controller.close();
    } finally {
      await log.close();
    }
    throw error;
  }
  process.stdout.write(
    `Rehearsal: ${server.url}\nRun: ${log.path}\nReady. Press Start in the browser to begin or continue. Ctrl+C pauses and closes the local server.\n`,
  );
  await new Promise<void>((resolve, reject) => {
    let stopping = false;
    const interrupt = () => {
      if (stopping) return;
      stopping = true;
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", interrupt);
      server.close().then(resolve, reject);
    };
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", interrupt);
  });
}

export async function handleLiveCommand(
  command: string,
  values: Options,
): Promise<boolean> {
  if (command === "compose") {
    if (!values.score || !values.config)
      throw new Error("compose requires --score and --config.");
    const score = await readJson(values.score, scoreSchema, "Score");
    const config = await readJson(values.config, configSchema, "Configuration");
    validateModelEnvironment(config.composer);
    const inputs = fixedComposerExperiment(score, config);
    await runTerminal(
      await LiveLog.create(
        resolve(values.out ?? `runs/${randomUUID()}.jsonl`),
        { type: "live.created", ...inputs },
      ),
    );
    return true;
  }
  if (command === "rehearse") {
    if (values.run) {
      if (values.scenario || values.config || values.out)
        throw new Error(
          "rehearse --run cannot also use --scenario, --config or --out.",
        );
      if (!(await isLiveRun(resolve(values.run))))
        throw new Error(
          "rehearse --run requires a live rehearsal log. Use replay for historical runs.",
        );
      await serve(await LiveLog.resume(resolve(values.run)), values.port);
      return true;
    }
    if (!values.scenario || !values.config)
      throw new Error("rehearse requires --scenario and --config, or --run.");
    const scenario = await readJson(
      values.scenario,
      scenarioSchema,
      "Scenario",
    );
    const config = await readConfig(values.config);
    await serve(
      await LiveLog.create(
        resolve(values.out ?? `runs/${randomUUID()}.jsonl`),
        { type: "live.created", scenario, config },
      ),
      values.port,
    );
    return true;
  }
  if (command === "simulate-continuous") {
    if (!values.scenario || !values.config)
      throw new Error("simulate-continuous requires --scenario and --config.");
    if (values.auto)
      throw new Error(
        "Live co-writing starts every writer together; --auto is not supported.",
      );
    const scenario = await readJson(
      values.scenario,
      scenarioSchema,
      "Scenario",
    );
    const config = await readConfig(values.config);
    validateModels(config);
    await runTerminal(
      await LiveLog.create(
        resolve(values.out ?? `runs/${randomUUID()}.jsonl`),
        { type: "live.created", scenario, config },
      ),
    );
    return true;
  }
  if (!["resume", "replay", "rerun"].includes(command) || !values.run)
    return false;
  const path = resolve(values.run);
  if (!(await isLiveRun(path))) return false;
  if (values.auto) throw new Error("Live co-writing does not support --auto.");
  if (command === "rerun")
    throw new Error(
      "Rerun is not supported for live rehearsals. Replay the saved text or start a new rehearse run.",
    );
  const read = await readLiveRun(path);
  if (read.tail.length)
    process.stderr.write(
      "Warning: ignored an interrupted final log line. Resume preserves the fragment before recovery.\n",
    );
  if (command === "replay") {
    process.stdout.write(
      `${read.state.scenario.title}\nLive rehearsal — saved append-only text.\n`,
    );
    for (const writer of [...read.state.participants, read.state.composer])
      process.stdout.write(
        `\n[${writerName(read.state, writer.id)} — saved live text]\n${writer.text}\n`,
      );
    process.stdout.write(
      `\n${read.state.status}; ${(read.state.elapsedMs / 1000).toFixed(1)} s active time.\n`,
    );
    return true;
  }
  if (read.state.status === "ended") {
    process.stdout.write(
      "Live rehearsal already ended. Use replay to display it.\n",
    );
    return true;
  }
  validateModels(read.state.config);
  await runTerminal(await LiveLog.resume(path));
  return true;
}
