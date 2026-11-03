import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readLiveRun } from "./live-runs.ts";
import { liveConfigSchema } from "./live-schema.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const runs = resolve(root, "runs");
const model = "qwen2.5:3b-instruct-q4_K_M";
const help = `Collective Microphone

  pnpm start              Open a new two-person rehearsal
  pnpm start --all        Use all eight participants
  pnpm resume             Continue the latest unfinished rehearsal
  pnpm replay             Read the latest saved rehearsal

Options: --run <file>, --scenario <file>, --config <file>, --port <number>, --no-open
The default starts its own local Ollama service and downloads Qwen 3B if missing.
Custom configurations use the model services you specify.
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
        state.elapsedMs < state.config.live.maxDurationMs)
    )
      return path;
  }
  throw new Error(
    unfinished
      ? "No unfinished rehearsal. Use pnpm start to begin one."
      : "No saved rehearsal yet. Use pnpm start.",
  );
}

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not choose a local port.");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
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
      config: { type: "string" },
      port: { type: "string" },
    },
  });
  if (values.help) {
    process.stdout.write(help);
    return;
  }
  const mode = positionals[0] ?? "start";
  if (positionals.length > 1 || !["start", "resume", "replay"].includes(mode))
    throw new Error(help);
  if (values.all && values.scenario)
    throw new Error("Choose --all or --scenario, not both.");
  if (mode !== "start" && (values.all || values.scenario || values.config))
    throw new Error(
      "Saved rehearsals keep their original settings. Use pnpm start for new settings.",
    );
  if (values.run && (values.all || values.scenario || values.config))
    throw new Error(
      "--run reopens saved settings; omit --all, --scenario and --config.",
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
  const cancellation = new AbortController();
  const interrupt = () => cancellation.abort();
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  let ollama: ReturnType<typeof spawn> | undefined;
  let serviceDone: Promise<void> | undefined;
  let serviceError = "";
  let stopping = false;
  const childRun = async (
    command: string,
    argv: string[],
    env = process.env,
    browser = false,
  ) => {
    cancellation.signal.throwIfAborted();
    const child = spawn(command, argv, {
      cwd: root,
      env,
      stdio: ["inherit", browser ? "pipe" : "inherit", "inherit"],
    });
    let output = "",
      opened = false;
    child.stdout?.on("data", (chunk) => {
      process.stdout.write(chunk);
      output = (output + chunk.toString()).slice(-8192);
      const url = output.match(/Rehearsal: (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
      if (url && !opened && !values["no-open"]) {
        opened = true;
        openBrowser(url);
      }
    });
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      child.kill("SIGINT");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 10000);
      killTimer.unref();
    };
    cancellation.signal.addEventListener("abort", stop, { once: true });
    if (cancellation.signal.aborted) stop();
    try {
      await new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) =>
          code === 0 || cancellation.signal.aborted
            ? resolve()
            : reject(
                new Error(
                  `${command === "ollama" ? "Ollama" : "Rehearsal"} stopped (${code}).`,
                ),
              ),
        );
      });
    } finally {
      cancellation.signal.removeEventListener("abort", stop);
      clearTimeout(killTimer);
    }
  };
  try {
    if (mode === "replay") {
      if (!run) throw new Error("No saved rehearsal selected.");
      await childRun(process.execPath, [
        resolve(root, "src/cli.ts"),
        "replay",
        "--run",
        run,
      ]);
      return;
    }
    let configPath = values.config ? resolve(values.config) : undefined;
    // Saved default runs use a stable address so they can reopen unchanged.
    const saved = run ? (await readLiveRun(run)).state : undefined;
    const managed =
      !configPath &&
      (!saved ||
        [saved.config.composer, saved.config.live.participants].every(
          (role) =>
            role.provider === "ollama" &&
            role.model === model &&
            role.baseUrl === "http://127.0.0.1:11435",
        ));
    if (managed) {
      const voices =
        saved?.scenario.voices.length ??
        (values.scenario
          ? JSON.parse(await readFile(resolve(values.scenario), "utf8")).voices
              .length
          : values.all
            ? 8
            : 2);
      const baseUrl = "http://127.0.0.1:11435";
      // Refuse an occupied port rather than unknowingly reuse a serial model service.
      const portCheck = createServer();
      try {
        await new Promise<void>((resolve, reject) => {
          portCheck.once("error", reject);
          portCheck.listen(11435, "127.0.0.1", resolve);
        });
      } catch {
        throw new Error(
          "The rehearsal model service is already running on port 11435. Stop the previous rehearsal or use --config for that service.",
        );
      }
      await new Promise<void>((resolve) => portCheck.close(() => resolve()));
      const env = {
        ...process.env,
        OLLAMA_HOST: "127.0.0.1:11435",
        OLLAMA_NUM_PARALLEL: String(voices + 1),
        OLLAMA_CONTEXT_LENGTH: "8192",
        OLLAMA_MAX_LOADED_MODELS: "1",
        OLLAMA_NO_CLOUD: "1",
        OLLAMA_KEEP_ALIVE: "60s",
      };
      process.stdout.write("Preparing local model…\n");
      ollama = spawn("ollama", ["serve"], {
        env,
        stdio: ["ignore", "ignore", "pipe"],
      });
      serviceDone = new Promise((resolve) => {
        ollama?.once("error", () => {
          serviceError =
            "Install Ollama, then run pnpm start again: https://ollama.com/download";
          cancellation.abort();
          resolve();
        });
        ollama?.once("close", () => {
          if (!stopping && !cancellation.signal.aborted) {
            serviceError = "The local Ollama service stopped unexpectedly.";
            cancellation.abort();
          }
          resolve();
        });
      });
      // Drain diagnostics without exposing arbitrary service environment values.
      ollama.stderr?.resume();
      let tags: { models?: { name: string }[] } | undefined;
      for (let attempt = 0; attempt < 100; attempt++) {
        cancellation.signal.throwIfAborted();
        try {
          const response = await fetch(`${baseUrl}/api/tags`, {
            signal: AbortSignal.any([
              cancellation.signal,
              AbortSignal.timeout(1000),
            ]),
          });
          if (response.ok) {
            tags = (await response.json()) as typeof tags;
            break;
          }
        } catch {
          /* service is starting */
        }
        await delay(100, undefined, { signal: cancellation.signal });
      }
      if (!tags)
        throw new Error(
          "Ollama did not become ready. Check that Ollama is installed and can run locally.",
        );
      if (!tags.models?.some((item) => item.name === model)) {
        process.stdout.write(
          "Downloading the local writing model (about 1.9 GB, once)…\n",
        );
        await childRun("ollama", ["pull", model], env);
      }
      if (!saved) {
        const config = liveConfigSchema.parse(
          JSON.parse(
            await readFile(
              resolve(root, "examples/live-local-pair.json"),
              "utf8",
            ),
          ),
        );
        if (voices > 2) {
          config.live.refreshIntervalMs = 5000;
          config.live.maxContextCharacters = 24000;
        }
        configPath = resolve(runs, "default-live-config.json");
        await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
      }
    }
    const argv = [resolve(root, "src/cli.ts"), "rehearse"];
    if (run) argv.push("--run", run);
    else {
      if (!configPath) throw new Error("No rehearsal configuration selected.");
      argv.push(
        "--scenario",
        resolve(
          values.scenario ??
            resolve(
              root,
              values.all
                ? "examples/simulation.json"
                : "examples/simulation-pair.json",
            ),
        ),
        "--config",
        configPath,
      );
    }
    argv.push("--port", values.port ?? String(await freePort()));
    await childRun(process.execPath, argv, process.env, true);
    if (serviceError) throw new Error(serviceError);
  } catch (error) {
    if (serviceError) throw new Error(serviceError);
    if (!cancellation.signal.aborted) throw error;
  } finally {
    stopping = true;
    ollama?.kill("SIGTERM");
    const timer = setTimeout(() => ollama?.kill("SIGKILL"), 5000);
    timer.unref();
    await serviceDone;
    clearTimeout(timer);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  start(process.argv.slice(2)).catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Could not start rehearsal."}\n`,
    );
    process.exitCode = 1;
  });
}
