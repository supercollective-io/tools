import { type ChildProcess, spawn } from "node:child_process";
import {
  appendFile,
  chmod,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { LiveLog, readLiveRun } from "../src/live-runs.ts";
import type { LiveConfig } from "../src/live-schema.ts";
import type { SimulationScenario } from "../src/schema.ts";
import { latestRun } from "../src/start.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const directories: string[] = [];
const journals = new Set<string>();
const children = new Set<ChildProcess>();
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function temporaryDirectory() {
  const path = await mkdtemp(join(tmpdir(), "rehearsal-launcher-"));
  directories.push(path);
  return path;
}

function configuration(): LiveConfig {
  const role = {
    provider: "ollama" as const,
    model: "launcher-fixture",
    baseUrl: "http://127.0.0.1:1",
    maxOutputTokens: 100,
    timeoutMs: 1000,
  };
  return {
    schemaVersion: 2,
    composer: role,
    instructions: "Write together.",
    history: { maxPassages: 2, maxCharacters: 1000 },
    live: {
      participants: role,
      instructions: "Continue your thought.",
      maxDurationMs: 1000,
      feedbackIntervalMs: 100,
      refreshIntervalMs: 100,
      maxContextCharacters: 1000,
    },
  };
}

const scenario: SimulationScenario = {
  schemaVersion: 1,
  title: "Launcher fixture",
  openingInvitation: "What could we do together?",
  voices: [
    {
      id: "alice",
      name: "Alice",
      perspective: "A perspective",
      background: "A background",
    },
  ],
};

async function journal(directory: string, name: string, modified: number) {
  const path = join(directory, `${name}.jsonl`);
  const log = await LiveLog.create(path, {
    type: "live.created",
    scenario,
    config: configuration(),
  });
  await log.close();
  await utimes(path, modified, modified);
  return path;
}

function launch(args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  for (const key of Object.keys(env))
    if (
      key === "OPENAI_API_KEY" ||
      key.startsWith("LANGCHAIN_") ||
      key.startsWith("LANGSMITH_")
    )
      delete env[key];
  const child = spawn(process.execPath, ["src/start.ts", ...args], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  let stdout = "",
    stderr = "",
    exited = false;
  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString();
    const path = stdout.match(/^Run: (.+)$/m)?.[1];
    if (path) journals.add(path);
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const done = new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      exited = true;
      children.delete(child);
      resolve({ code, stdout, stderr });
    });
  });
  return {
    child,
    done,
    async output(pattern: RegExp) {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const match = stdout.match(pattern);
        if (match) return match;
        if (exited)
          throw new Error(
            `Launcher exited before output: ${stdout}\n${stderr}`,
          );
        await pause(10);
      }
      throw new Error(`Launcher output timed out: ${stdout}\n${stderr}`);
    },
  };
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>((resolve) => child.once("close", resolve));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 12000);
  timer.unref();
  try {
    await closed;
  } finally {
    clearTimeout(timer);
  }
}

afterEach(async () => {
  await Promise.all([...children].map(stop));
  children.clear();
  await Promise.all([...journals].map((path) => rm(path, { force: true })));
  journals.clear();
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("latest rehearsal selection", () => {
  it("selects the newest live journal, ignoring historical formats", async () => {
    const directory = await temporaryDirectory();
    await journal(directory, "older", 100);
    const newest = await journal(directory, "newest", 200);
    const historical = join(directory, "historical.jsonl");
    await writeFile(historical, '{"event":{"type":"simulation.created"}}\n');
    await utimes(historical, 300, 300);
    expect(await latestRun(directory, false)).toBe(newest);
    expect(await latestRun(directory, true)).toBe(newest);
  });

  it("replays ended runs but resumes the latest unfinished run", async () => {
    const directory = await temporaryDirectory();
    const unfinished = await journal(directory, "unfinished", 100);
    const ended = await journal(directory, "ended", 200);
    const log = await LiveLog.resume(ended);
    await log.append({ type: "session.ended", elapsedMs: 10 });
    await log.close();
    await utimes(ended, 200, 200);
    expect(await latestRun(directory, false)).toBe(ended);
    expect(await latestRun(directory, true)).toBe(unfinished);
    await rm(unfinished);
    await expect(latestRun(directory, true)).rejects.toThrow(
      "No unfinished rehearsal",
    );
  });

  it("excludes paused runs whose duration budget is exhausted", async () => {
    const directory = await temporaryDirectory();
    const path = await journal(directory, "exhausted", 100);
    const log = await LiveLog.resume(path);
    await log.append({ type: "session.started" });
    await log.append({
      type: "session.paused",
      elapsedMs: log.state.config.live.maxDurationMs,
      reason: "fixture",
    });
    await log.close();
    await expect(latestRun(directory, true)).rejects.toThrow(
      "No unfinished rehearsal",
    );
    expect(await latestRun(directory, false)).toBe(path);
  });

  it("reports a damaged live journal instead of silently opening an older run", async () => {
    const directory = await temporaryDirectory();
    await journal(directory, "older", 100);
    const damaged = await journal(directory, "damaged", 200);
    await appendFile(damaged, "not valid JSON\n");
    await utimes(damaged, 200, 200);
    await expect(latestRun(directory, false)).rejects.toThrow();
    await expect(latestRun(directory, true)).rejects.toThrow();
  });

  it("gives actionable guidance when the runs directory does not exist", async () => {
    const directory = join(await temporaryDirectory(), "absent");
    await expect(latestRun(directory, false)).rejects.toThrow(
      "No saved rehearsal yet. Use pnpm start.",
    );
  });
});

describe("short rehearsal launcher", () => {
  it("prints help without requiring an Ollama executable", async () => {
    const directory = await temporaryDirectory();
    const result = await launch(["--help"], { PATH: directory }).done;
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("pnpm start");
    expect(result.stdout).toContain("pnpm resume");
    expect(result.stdout).toContain("pnpm replay");
    expect(result.stdout).not.toContain("Preparing local model");
  });

  it("replays a saved run without models and resumes its saved configuration", async () => {
    const directory = await temporaryDirectory();
    const path = await journal(directory, "saved", 100);
    const bytes = await readFile(path, "utf8");
    const replay = await launch(["replay", "--run", path], { PATH: directory })
      .done;
    expect(replay.code, replay.stderr).toBe(0);
    expect(replay.stdout).toContain(scenario.title);
    expect(replay.stdout).toContain("Alice — saved live text");
    expect(await readFile(path, "utf8")).toBe(bytes);
    const resumed = launch(
      ["resume", "--run", path, "--no-open", "--port", "0"],
      {
        PATH: directory,
      },
    );
    expect((await resumed.output(/^Run: (.+)$/m))[1]).toBe(path);
    expect((await readLiveRun(path)).state.config).toEqual(configuration());
    resumed.child.kill("SIGTERM");
    const result = await resumed.done;
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("Preparing local model");
  });

  it.each(["SIGINT", "SIGTERM"] as const)(
    "opens a custom configuration without Ollama and shuts down on %s",
    async (signal) => {
      const directory = await temporaryDirectory();
      const config = join(directory, "config.json");
      const scenarioPath = join(directory, "scenario.json");
      await writeFile(config, JSON.stringify(configuration()));
      await writeFile(scenarioPath, JSON.stringify(scenario));
      const run = launch(
        ["--config", config, "--scenario", scenarioPath, "--no-open"],
        { PATH: directory },
      );
      const url = (
        await run.output(/Rehearsal: (http:\/\/127\.0\.0\.1:\d+)/)
      )[1];
      const path = (await run.output(/^Run: (.+)$/m))[1];
      if (!url || !path) throw new Error("Missing launcher output");
      const page = await fetch(url);
      expect(page.status).toBe(200);
      expect((await readLiveRun(path)).state.status).toBe("ready");
      run.child.kill(signal);
      const result = await run.done;
      expect(result.code, result.stderr).toBe(0);
      expect(result.stdout).not.toContain("Preparing local model");
      await expect(fetch(url)).rejects.toThrow();
      const reopened = await LiveLog.resume(path);
      await reopened.close();
    },
    15000,
  );
});

describe("managed local model service", () => {
  it.each([
    { label: "pair", args: [], voices: 2, parallel: "3" },
    { label: "all participants", args: ["--all"], voices: 8, parallel: "9" },
  ])(
    "starts $label with one slot per writer and stops its own service",
    async ({ args, voices, parallel }) => {
      // Never contact or stop a service already owned by another rehearsal.
      const probe = createServer();
      try {
        await new Promise<void>((resolve, reject) => {
          probe.once("error", reject);
          probe.listen(11435, "127.0.0.1", resolve);
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
          throw new Error(
            "Port 11435 must be free to test the managed Ollama service.",
            { cause: error },
          );
        }
        throw error;
      }
      await new Promise<void>((resolve, reject) =>
        probe.close((error) => (error ? reject(error) : resolve())),
      );
      const directory = await temporaryDirectory();
      const eventsPath = join(directory, "events.jsonl");
      const executable = `#!${process.execPath}
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename } from "node:path";
const record = (event) => appendFileSync(${JSON.stringify(eventsPath)}, JSON.stringify(event) + "\\n");
if (basename(process.argv[1]) !== "ollama") {
  record({ type: "browser" });
} else if (process.argv[2] === "pull") {
  record({ type: "pull", model: process.argv[3] });
} else if (process.argv[2] === "serve") {
  record({ type: "serve", host: process.env.OLLAMA_HOST,
    parallel: process.env.OLLAMA_NUM_PARALLEL, context: process.env.OLLAMA_CONTEXT_LENGTH,
    maxLoaded: process.env.OLLAMA_MAX_LOADED_MODELS, noCloud: process.env.OLLAMA_NO_CLOUD,
    keepAlive: process.env.OLLAMA_KEEP_ALIVE });
  const server = createServer((request, response) => {
    record({ type: "request", url: request.url });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ models: [] }));
  });
  server.listen(11435, "127.0.0.1");
  process.on("SIGTERM", () => {
    record({ type: "stopped" });
    server.closeAllConnections();
    server.close();
  });
} else process.exitCode = 1;
`;
      // Package type is module so the fake executable needs no shell or real Ollama.
      await writeFile(join(directory, "package.json"), '{"type":"module"}');
      for (const name of ["ollama", "open", "xdg-open", "explorer.exe"]) {
        const path = join(directory, name);
        await writeFile(path, executable);
        await chmod(path, 0o755);
      }
      const defaultConfig = join(root, "runs/default-live-config.json");
      const previous = await readFile(defaultConfig).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined;
          throw error;
        },
      );
      try {
        const run = launch([...args, "--no-open", "--port", "0"], {
          PATH: directory,
        });
        const path = (await run.output(/^Run: (.+)$/m))[1];
        if (!path) throw new Error("Missing managed rehearsal path");
        const saved = (await readLiveRun(path)).state;
        expect(saved.status).toBe("ready");
        expect(saved.scenario.voices).toHaveLength(voices);
        expect(saved.config.composer).toMatchObject({
          model: "qwen2.5:3b-instruct-q4_K_M",
          baseUrl: "http://127.0.0.1:11435",
          numCtx: 8192,
        });
        expect(saved.config.live.participants).toEqual(saved.config.composer);
        run.child.kill("SIGTERM");
        const result = await run.done;
        expect(result.code, result.stderr).toBe(0);
        const events = (await readFile(eventsPath, "utf8"))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        expect(events.filter((event) => event.type === "serve")).toEqual([
          {
            type: "serve",
            host: "127.0.0.1:11435",
            parallel,
            context: "8192",
            maxLoaded: "1",
            noCloud: "1",
            keepAlive: "60s",
          },
        ]);
        expect(events.filter((event) => event.type === "pull")).toEqual([
          { type: "pull", model: "qwen2.5:3b-instruct-q4_K_M" },
        ]);
        expect(events.filter((event) => event.type === "stopped")).toHaveLength(
          1,
        );
        expect(events.some((event) => event.type === "browser")).toBe(false);
        expect(
          events
            .filter((event) => event.type === "request")
            .map((event) => event.url),
        ).toEqual(["/api/tags"]);
        await expect(
          fetch("http://127.0.0.1:11435/api/tags"),
        ).rejects.toThrow();
      } finally {
        // Preserve a user's previous default configuration exactly.
        if (previous) await writeFile(defaultConfig, previous);
        else await rm(defaultConfig, { force: true });
      }
    },
    20000,
  );
});
