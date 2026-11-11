import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readLiveRun } from "./live-runs.ts";
import { liveConfigSchema } from "./live-schema.ts";
import { LocalModels, modelChoices } from "./local-models.ts";
import { readJson, scenarioSchema, scoreSchema } from "./schema.ts";
import { startWorkspace } from "./workspace.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const runs = resolve(root, "runs");
const help = `Collective Microphone

  pnpm start     Open the workspace; choose mode and model in the browser
  pnpm replay    Read the latest saved rehearsal offline

Optional: --all, --scenario <file>, --score <file>, --config <file>, --run <file>, --port <number>, --no-open
Qwen 3B is prepared locally when you press Start. Installed Gemma 12B is available for chunked and fixed-text writing.
Saved sessions can be reopened in the browser.
`;

export async function latestRun(directory: string, unfinished: boolean) {
  const paths = await readdir(directory).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const candidates = await Promise.all(
    paths
      .filter((name) => name.endsWith(".jsonl"))
      .map(async (name) => {
        const path = resolve(directory, name);
        return { path, modified: (await stat(path)).mtimeMs };
      }),
  );
  for (const { path } of candidates.sort((a, b) => b.modified - a.modified)) {
    // Skip historical formats; a damaged live journal must remain an explicit error.
    const first = (await readFile(path, "utf8")).split("\n")[0];
    if (!first) continue;
    let type: unknown;
    try {
      type = JSON.parse(first).event?.type;
    } catch {
      continue;
    }
    if (type !== "live.created") continue;
    const { state } = await readLiveRun(path);
    if (
      !unfinished ||
      (state.status !== "ended" &&
        (state.config.live.mode === "fixed" ||
          state.elapsedMs < state.config.live.maxDurationMs))
    )
      return path;
  }
  throw new Error(
    unfinished
      ? "No unfinished rehearsal. Use pnpm start to begin one."
      : "No saved rehearsal yet. Use pnpm start.",
  );
}

function openBrowser(url: string) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "explorer.exe"
        : "xdg-open";
  const child = spawn(command, [url], { stdio: "ignore" });
  child.on("error", () =>
    process.stdout.write(`Open ${url} in your browser.\n`),
  );
  child.unref();
}

export async function start(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      all: { type: "boolean" },
      "no-open": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      run: { type: "string" },
      scenario: { type: "string" },
      score: { type: "string" },
      config: { type: "string" },
      port: { type: "string" },
    },
  });
  if (values.help) {
    process.stdout.write(help);
    return;
  }
  const mode = positionals[0] ?? "start";
  // Keep the former source-level resume entry point compatible, without a public pnpm command.
  if (positionals.length > 1 || !["start", "resume", "replay"].includes(mode))
    throw new Error(help);
  if (values.all && values.scenario)
    throw new Error("Choose --all or --scenario, not both.");
  if (
    mode !== "start" &&
    (values.all || values.scenario || values.score || values.config)
  )
    throw new Error(
      "Saved rehearsals keep their original settings. Use pnpm start for new settings.",
    );
  if (
    values.run &&
    (values.all || values.scenario || values.score || values.config)
  )
    throw new Error(
      "--run reopens saved settings; omit scenario, score and configuration overrides.",
    );
  if (
    values.port &&
    (!/^\d+$/.test(values.port) || Number(values.port) > 65535)
  )
    throw new Error("Port must be between 0 and 65535.");
  if (existsSync(resolve(root, ".env")))
    process.loadEnvFile(resolve(root, ".env"));
  await mkdir(runs, { recursive: true });
  const run = values.run
    ? resolve(values.run)
    : mode !== "start"
      ? await latestRun(runs, mode === "resume")
      : undefined;
  if (mode === "replay") {
    if (!run) throw new Error("No saved rehearsal selected.");
    const child = spawn(
      process.execPath,
      [resolve(root, "src/cli.ts"), "replay", "--run", run],
      { stdio: "inherit", cwd: root },
    );
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error("Could not replay the saved rehearsal.")),
      );
    });
    return;
  }
  const config = await readJson(
    resolve(values.config ?? resolve(root, "examples/live-local-pair.json")),
    liveConfigSchema,
    "Live configuration",
  );
  if (config.live.mode === "typed")
    throw new Error("Use pnpm participate for typed sessions.");
  const score = values.score
    ? await readJson(resolve(values.score), scoreSchema, "Score")
    : (config.live.score ??
      (await readJson(
        resolve(root, "examples/score.json"),
        scoreSchema,
        "Score",
      )));
  const scenario =
    (values.score || config.live.score) && !values.scenario
      ? scenarioSchema.parse({
          schemaVersion: 1,
          title: score.title,
          openingInvitation: score.title,
          voices: score.voices.map((voice) => ({
            id: voice.id,
            name: voice.name,
            background: voice.text,
            perspective:
              "Develop your own position from your starting context.",
          })),
        })
      : await readJson(
          resolve(values.scenario ?? resolve(root, "examples/simulation.json")),
          scenarioSchema,
          "Scenario",
        );
  const models = new LocalModels(!values.config);
  const choices = await modelChoices(config, Boolean(values.config));
  let server: Awaited<ReturnType<typeof startWorkspace>> | undefined;
  let done: (() => void) | undefined;
  const stopped = new Promise<void>((resolve) => {
    done = resolve;
  });
  let closing: Promise<void> | undefined;
  const close = () => {
    models.cancel();
    closing ??= (async () => {
      try {
        await server?.close();
      } finally {
        await models.close();
        done?.();
      }
    })();
    return closing;
  };
  const interrupt = () => {
    void close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    server = await startWorkspace({
      runsDirectory: run ? dirname(run) : runs,
      scenario,
      score,
      config,
      models: choices,
      useDefaults: !values.config,
      prepare: (settings, selected) => models.prepare(settings, selected),
      port: Number(values.port ?? 0),
      initialRun: run,
      initialSettings: {
        mode: config.live.mode ?? "continuous",
        model: choices[0]?.id,
        participants: values.all
          ? scenario.voices.length
          : Math.min(2, scenario.voices.length),
      },
    });
    if (closing) {
      await server.close();
      return;
    }
    process.stdout.write(
      `Rehearsal: ${server.url}\nChoose a mode and model in the browser. Ctrl+C saves and closes.\n`,
    );
    if (!values["no-open"]) openBrowser(server.url);
    await stopped;
    await closing;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    await close();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  start(process.argv.slice(2)).catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Could not open workspace."}\n`,
    );
    process.exitCode = 1;
  });
}
