import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { LiveLog, readLiveRun } from "../src/live-runs.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const children = new Set<ChildProcess>();
const servers = new Set<Server>();
const directories: string[] = [];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
afterEach(async () => {
  await Promise.all(
    [...children].map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
          }
          child.once("close", () => resolve());
          child.kill("SIGKILL");
        }),
    ),
  );
  children.clear();
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  servers.clear();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
function launch(args: string[], preload?: string) {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (
      key === "OPENAI_API_KEY" ||
      key.startsWith("LANGCHAIN_") ||
      key.startsWith("LANGSMITH_")
    )
      delete env[key];
  const child = spawn(
    process.execPath,
    [...(preload ? ["--import", preload] : []), "src/cli.ts", ...args],
    {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  children.add(child);
  let stdout = "",
    stderr = "",
    exited = false;
  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString();
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
      children.delete(child);
      exited = true;
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
          throw new Error(`CLI exited before output: ${stdout}\n${stderr}`);
        await pause(10);
      }
      throw new Error(`CLI output timed out: ${stdout}\n${stderr}`);
    },
  };
}
async function fixtures() {
  const directory = await mkdtemp(join(tmpdir(), "live-cli-"));
  directories.push(directory);
  let calls = 0;
  const server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const { model } = JSON.parse(raw) as { model: string };
    calls += 1;
    response.writeHead(200, { "Content-Type": "application/x-ndjson" });
    for (const content of ["A saved thought ", "continues 🙂 "]) {
      if (response.destroyed) return;
      response.write(
        `${JSON.stringify({ model, created_at: new Date().toISOString(), message: { role: "assistant", content }, done: false })}\n`,
      );
      await pause(40);
    }
    if (!response.destroyed)
      response.end(
        `${JSON.stringify({ model, created_at: new Date().toISOString(), message: { role: "assistant", content: "" }, done: true, done_reason: "stop" })}\n`,
      );
  });
  servers.add(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture address");
  const scenario = join(directory, "scenario.json"),
    config = join(directory, "config.json"),
    out = join(directory, "run.jsonl");
  const model = {
    provider: "ollama",
    model: "fixture",
    baseUrl: `http://127.0.0.1:${address.port}`,
    maxOutputTokens: 100,
    timeoutMs: 3000,
  };
  const configuration = {
    schemaVersion: 2,
    composer: model,
    instructions: "Write together.",
    history: { maxPassages: 2, maxCharacters: 10000 },
    live: {
      participants: model,
      instructions: "Continue your thought.",
      maxDurationMs: 1000,
      feedbackIntervalMs: 100,
      refreshIntervalMs: 100,
      maxContextCharacters: 100000,
    },
  };
  await writeFile(
    scenario,
    JSON.stringify({
      schemaVersion: 1,
      title: "CLI live fixture",
      openingInvitation: "What should we do?",
      voices: [
        {
          id: "alice",
          name: "Alice",
          perspective: "A perspective",
          background: "PRIVATE_BACKGROUND",
        },
      ],
    }),
  );
  await writeFile(config, JSON.stringify(configuration));
  return { scenario, config, out, configuration, calls: () => calls };
}
const creation = (f: Awaited<ReturnType<typeof fixtures>>) => [
  "--scenario",
  f.scenario,
  "--config",
  f.config,
  "--out",
  f.out,
];
const control = (url: string, action: string) =>
  fetch(`${url}/api/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

describe("live CLI", () => {
  it("opens Ready, starts only explicitly, retains partial text and reopens paused without model calls", async () => {
    const f = await fixtures();
    const run = launch(["rehearse", ...creation(f), "--port", "0"]);
    const url = (await run.output(/Rehearsal: (http:\/\/127\.0\.0\.1:\d+)/))[1];
    if (!url) throw new Error("Missing rehearsal URL");
    expect(f.calls()).toBe(0);
    expect((await readLiveRun(f.out)).state.status).toBe("ready");
    const secondWriter = await launch([
      "rehearse",
      "--run",
      f.out,
      "--port",
      "0",
    ]).done;
    expect(secondWriter.code).toBe(1);
    expect(secondWriter.stderr).toMatch(/locked|another|already/i);
    expect((await control(url, "start")).status).toBe(200);
    const deadline = Date.now() + 5000;
    while (
      Date.now() < deadline &&
      !(await readLiveRun(f.out)).state.participants[0]?.text
    )
      await pause(10);
    expect((await control(url, "pause")).status).toBe(200);
    const saved = await readLiveRun(f.out);
    expect(saved.state.participants[0]?.text).toContain("A saved thought");
    run.child.kill("SIGTERM");
    expect((await run.done).code).toBe(0);
    const calls = f.calls();
    const resumed = launch(["rehearse", "--run", f.out, "--port", "0"]);
    const reopened = (
      await resumed.output(/Rehearsal: (http:\/\/127\.0\.0\.1:\d+)/)
    )[1];
    if (!reopened) throw new Error("Missing reopened URL");
    await pause(50);
    expect(f.calls()).toBe(calls);
    expect((await readLiveRun(f.out)).state.status).toBe("paused");
    expect((await control(reopened, "end")).status).toBe(200);
    resumed.child.kill("SIGINT");
    expect((await resumed.done).code).toBe(0);
    const bytes = await readFile(f.out, "utf8");
    const replay = await launch(["replay", "--run", f.out]).done;
    expect(replay.code, replay.stderr).toBe(0);
    expect(replay.stdout).toContain("Alice — saved live text");
    expect(replay.stdout).toContain("A saved thought");
    expect(f.calls()).toBe(calls);
    expect(await readFile(f.out, "utf8")).toBe(bytes);
  }, 15000);

  it("streams named saved additions in the terminal and ends on its duration budget", async () => {
    const f = await fixtures();
    const result = await launch(["simulate-continuous", ...creation(f)]).done;
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("Alice — saved live text");
    expect(result.stdout).toContain("COLLECTIVE — saved live text");
    expect(result.stdout).toContain("A saved thought");
    expect(result.stdout).toContain("Live rehearsal ended.");
    expect((await readLiveRun(f.out)).state.status).toBe("ended");
  }, 15000);

  it("exits on a journal failure, reports the error and releases the recoverable run", async () => {
    const f = await fixtures();
    const hook = `${f.out}.hook.mjs`;
    const journalModule = new URL("../src/live-runs.ts", import.meta.url).href;
    await writeFile(
      hook,
      `
      import { LiveLog } from ${JSON.stringify(journalModule)};
      const append = LiveLog.prototype.append;
      let chunks = 0;
      LiveLog.prototype.append = function(event) {
        if (event.type === "text.appended" && ++chunks === 2)
          return Promise.reject(new Error("Fixture storage unavailable"));
        return append.call(this, event);
      };
    `,
    );
    const result = await launch(["simulate-continuous", ...creation(f)], hook)
      .done;
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Saving the rehearsal failed");
    expect(result.stdout).toContain("A saved thought");
    const saved = await readLiveRun(f.out);
    expect(saved.state.participants[0]?.text).toBe("A saved thought ");
    // A failure cannot append a durable pause. Reopening must still acquire the
    // released journal lock and recover the saved prefix without model calls.
    const calls = f.calls();
    const recovered = await LiveLog.resume(f.out);
    try {
      expect(recovered.state.status).toBe("paused");
      expect(recovered.state.participants[0]?.text).toBe("A saved thought ");
    } finally {
      await recovered.close();
    }
    expect(f.calls()).toBe(calls);
  });

  it("rejects obsolete turn configuration with explicit migration guidance", async () => {
    const f = await fixtures();
    await writeFile(
      f.config,
      JSON.stringify({
        ...f.configuration,
        schemaVersion: 1,
        live: undefined,
        continuous: {},
      }),
    );
    const result = await launch(["simulate-continuous", ...creation(f)]).done;
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Migrate to schemaVersion 2");
    expect(f.calls()).toBe(0);
    await expect(readFile(f.out)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
