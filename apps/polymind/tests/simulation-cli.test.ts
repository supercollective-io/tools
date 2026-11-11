import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readSimulationRun, SimulationLog } from "../src/simulation-runs.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const children = new Set<ChildProcess>();
const servers = new Set<Server>();
const directories = new Set<string>();
type Request = { model: string; messages: { role: string; content: string }[] };

async function closeServer(server: Server) {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  servers.delete(server);
}
afterEach(async () => {
  await Promise.all(
    [...children].map(
      (child) =>
        new Promise<void>((resolve) => {
          child.once("close", () => resolve());
          child.kill("SIGKILL");
        }),
    ),
  );
  children.clear();
  await Promise.all([...servers].map(closeServer));
  await Promise.all(
    [...directories].map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  directories.clear();
});

async function provider(
  options: {
    failBob?: boolean;
    failComposer?: boolean;
    emptyBob?: boolean;
    slowBob?: boolean;
  } = {},
) {
  const requests: Request[] = [];
  const calls = { alice: 0, bob: 0, composer: 0 };
  const server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw) as Request;
    requests.push(body);
    const composer = body.model === "composer-fixture";
    const alice =
      !composer &&
      body.messages.some((message) => message.content.includes("ALICE_MARKER"));
    const id = composer ? "composer" : alice ? "alice" : "bob";
    const attempt = ++calls[id];
    if (options.slowBob && id === "bob" && attempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (
      (options.failBob && id === "bob" && attempt === 1) ||
      (options.failComposer && composer && attempt === 1)
    ) {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Fixture failure" }));
      return;
    }
    const text = composer
      ? `We reconsider together ${attempt}.`
      : options.emptyBob && id === "bob" && attempt === 1
        ? ""
        : `${id} response ${attempt}.`;
    const base = { model: body.model, created_at: "2026-11-03T12:00:00Z" };
    response.writeHead(200, { "Content-Type": "application/x-ndjson" });
    response.write(
      `${JSON.stringify({ ...base, message: { role: "assistant", content: text }, done: false })}\n`,
    );
    response.end(
      `${JSON.stringify({ ...base, message: { role: "assistant", content: "" }, done: true, done_reason: "stop", prompt_eval_count: 20, eval_count: 10 })}\n`,
    );
  });
  servers.add(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture address");
  return {
    server,
    requests,
    calls,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function fixtures(baseUrl: string, maxRounds = 2, intervalMs = 0) {
  const directory = await mkdtemp(join(tmpdir(), "simulation-cli-"));
  directories.add(directory);
  const scenario = join(directory, "scenario.json");
  const config = join(directory, "config.json");
  const out = join(directory, "simulation.jsonl");
  const model = {
    provider: "ollama",
    model: "composer-fixture",
    baseUrl,
    maxOutputTokens: 256,
    timeoutMs: 2000,
  };
  const configuration = {
    schemaVersion: 1,
    composer: model,
    instructions: "Speak collectively.",
    history: { maxPassages: 4, maxCharacters: 10000 },
    simulation: {
      maxRounds,
      concurrency: 1,
      intervalMs,
      participants: { ...model, model: "participant-fixture" },
      instructions: "Respond as yourself.",
      history: { maxTurns: 4, maxCharacters: 10000 },
    },
  };
  await writeFile(
    scenario,
    JSON.stringify({
      schemaVersion: 1,
      title: "Simulation fixture",
      openingInvitation: "What should we do with the hall?",
      voices: [
        {
          id: "alice",
          name: "Alice",
          perspective: "ALICE_MARKER",
          background: "Works in the hall.",
        },
        {
          id: "bob",
          name: "Bob",
          perspective: "BOB_MARKER",
          background: "Lives near the hall.",
        },
      ],
    }),
  );
  await writeFile(config, JSON.stringify(configuration));
  return { directory, scenario, config, out, configuration };
}

function cli(
  args: string[],
  commands: string[] = [],
  onOutput?: (child: ChildProcess, output: string) => void,
) {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (
      key === "OPENAI_API_KEY" ||
      key.startsWith("LANGCHAIN_") ||
      key.startsWith("LANGSMITH_")
    )
      delete env[key];
  const child = spawn(process.execPath, ["src/cli.ts", ...args], {
    cwd: root,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  children.add(child);
  let stdout = "",
    stderr = "",
    consumed = 0,
    sent = 0;
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
    let prompt = stdout.indexOf("> ", consumed);
    while (prompt !== -1) {
      consumed = prompt + 2;
      if (sent < commands.length) child.stdin.write(`${commands[sent++]}\n`);
      prompt = stdout.indexOf("> ", consumed);
    }
    onOutput?.(child, stdout);
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`CLI timed out\n${stdout}\n${stderr}`));
      }, 10000);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        children.delete(child);
        resolve({ code, stdout, stderr });
      });
    },
  );
}
function simulate(f: Awaited<ReturnType<typeof fixtures>>) {
  return [
    "simulate",
    "--scenario",
    f.scenario,
    "--config",
    f.config,
    "--out",
    f.out,
  ];
}

describe("simulation CLI", () => {
  it("runs three automatic rounds with generated participant responses and collective feedback, then replays offline", async () => {
    const model = await provider();
    const f = await fixtures(model.baseUrl, 3);
    const result = await cli([...simulate(f), "--auto"]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "Alice — simulated participant:\nalice response 1.",
    );
    expect(result.stdout).toContain("[Alice contributing…]");
    expect(result.stdout).toContain("[Bob contributing…]");
    expect(result.stdout).toContain(
      "Bob — simulated participant:\nbob response 1.",
    );
    expect(result.stdout.indexOf("alice response 1.")).toBeLessThan(
      result.stdout.indexOf("[COLLECTIVE — provisional]"),
    );
    expect(result.stdout).toContain("Simulation complete.");
    const state = (await readSimulationRun(f.out)).state;
    expect(state.roundsCompleted).toBe(3);
    expect(state.passages).toHaveLength(3);
    expect(model.calls).toEqual({ alice: 3, bob: 3, composer: 3 });
    const aliceRequests = model.requests.filter(
      (request) =>
        request.model === "participant-fixture" &&
        request.messages.some((message) =>
          message.content.includes("ALICE_MARKER"),
        ),
    );
    expect(JSON.stringify(aliceRequests[1])).toContain(
      "We reconsider together 1.",
    );
    expect(JSON.stringify(aliceRequests[2])).toContain(
      "We reconsider together 2.",
    );
    const original = await readFile(f.out, "utf8");
    await closeServer(model.server);
    const replay = await cli(["replay", "--run", f.out]);
    expect(replay.code, replay.stderr).toBe(0);
    expect(replay.stdout).toContain("Alice — simulated participant:");
    expect(replay.stdout).toContain(
      "Bob — simulated participant:\nbob response 3.",
    );
    expect(replay.stdout).toContain("[COLLECTIVE — accepted and saved]");
    expect(await readFile(f.out, "utf8")).toBe(original);
  });

  it.each(["provider", "empty"])(
    "resumes a participant after a %s error without regenerating completed responses",
    async (failure) => {
      const model = await provider({
        failBob: failure === "provider",
        emptyBob: failure === "empty",
      });
      const f = await fixtures(model.baseUrl, 1);
      const failed = await cli(simulate(f), ["next", "q"]);
      expect(failed.code, failed.stderr).toBe(1);
      expect(failed.stdout).toContain("alice response 1.");
      expect(model.calls).toEqual({ alice: 1, bob: 1, composer: 0 });
      const pending = await cli(["replay", "--run", f.out]);
      expect(pending.stdout).toContain("Bob: (response pending)");
      expect(pending.stdout).toContain("no accepted passage");
      const resumed = await cli(["resume", "--run", f.out], ["retry"]);
      expect(resumed.code, resumed.stderr).toBe(0);
      expect(resumed.stdout).toContain("alice response 1.");
      expect(model.calls).toEqual({ alice: 1, bob: 2, composer: 1 });
    },
  );

  it("retries only the composer and reruns frozen responses with a base configuration override", async () => {
    const model = await provider({ failComposer: true });
    const f = await fixtures(model.baseUrl, 1);
    const failed = await cli(simulate(f), ["next", "q"]);
    expect(failed.code, failed.stderr).toBe(1);
    expect(model.calls).toEqual({ alice: 1, bob: 1, composer: 1 });
    const resumed = await cli(["resume", "--run", f.out], ["retry"]);
    expect(resumed.code, resumed.stderr).toBe(0);
    expect(model.calls).toEqual({ alice: 1, bob: 1, composer: 2 });
    const { simulation: _simulation, ...base } = f.configuration;
    const override = join(f.directory, "base.json");
    await writeFile(override, JSON.stringify(base));
    const out = join(f.directory, "rerun.jsonl");
    const rerun = await cli(
      ["rerun", "--run", f.out, "--config", override, "--out", out],
      ["next"],
    );
    expect(rerun.code, rerun.stderr).toBe(0);
    expect(rerun.stdout).toContain(
      "frozen participant contributions from the original run",
    );
    expect(rerun.stdout).toContain(
      "Alice — recorded participant:\nalice response 1.",
    );
    expect(model.calls).toEqual({ alice: 1, bob: 1, composer: 3 });
    expect((await readSimulationRun(out)).state.recordedRounds).toHaveLength(1);
    const cloudParticipants = join(
      f.directory,
      "unused-cloud-participants.json",
    );
    await writeFile(
      cloudParticipants,
      JSON.stringify({
        ...f.configuration,
        simulation: {
          ...f.configuration.simulation,
          participants: {
            ...f.configuration.simulation.participants,
            provider: "openai",
          },
        },
      }),
    );
    const recorded = await cli(
      [
        "rerun",
        "--run",
        f.out,
        "--config",
        cloudParticipants,
        "--out",
        join(f.directory, "cloud-rerun.jsonl"),
      ],
      ["next"],
    );
    expect(recorded.code, recorded.stderr).toBe(0);
    expect(model.calls).toEqual({ alice: 1, bob: 1, composer: 4 });
  });

  it("interrupts the automatic interval without starting another round, then resumes", async () => {
    const model = await provider();
    const f = await fixtures(model.baseUrl, 2, 1000);
    let interrupted = false;
    const result = await cli(
      [...simulate(f), "--auto"],
      [],
      (child, output) => {
        if (!interrupted && output.includes("[accepted and saved]")) {
          interrupted = true;
          child.kill("SIGINT");
        }
      },
    );
    expect(result.code, result.stderr).toBe(130);
    expect(model.calls).toEqual({ alice: 1, bob: 1, composer: 1 });
    expect((await readSimulationRun(f.out)).state.roundsCompleted).toBe(1);
    const resumed = await cli(["resume", "--run", f.out, "--auto"]);
    expect(resumed.code, resumed.stderr).toBe(0);
    expect(model.calls).toEqual({ alice: 2, bob: 2, composer: 2 });
  });

  it("validates participant credentials before creating a live log", async () => {
    const f = await fixtures("http://127.0.0.1:1");
    await writeFile(
      f.config,
      JSON.stringify({
        ...f.configuration,
        simulation: {
          ...f.configuration.simulation,
          participants: { ...f.configuration.composer, provider: "openai" },
        },
      }),
    );
    const result = await cli(simulate(f));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("OPENAI_API_KEY");
    await expect(readFile(f.out)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([1, 2])(
    "finishes a saved OpenAI final round with %i missing completion records without credentials or model calls",
    async (missingRecords) => {
      const model = await provider();
      const f = await fixtures(model.baseUrl, 1);
      const finished = await cli([...simulate(f), "--auto"]);
      expect(finished.code, finished.stderr).toBe(0);
      const saved = await readSimulationRun(f.out);
      const path = join(f.directory, `openai-recovery-${missingRecords}.jsonl`);
      // Build a journal fixture with OpenAI configuration and already saved model
      // results. Only its final completion records are absent, as after a crash.
      const config = {
        ...saved.state.config,
        composer: {
          ...saved.state.config.composer,
          provider: "openai" as const,
        },
        simulation: {
          ...saved.state.config.simulation,
          participants: {
            ...saved.state.config.simulation.participants,
            provider: "openai" as const,
          },
        },
      };
      const log = await SimulationLog.create(path, {
        type: "simulation.created",
        scenario: saved.state.scenario,
        config,
      });
      try {
        for (const record of saved.events.slice(1, -missingRecords))
          await log.append(record.event);
      } finally {
        await log.close();
      }
      const original = (await readSimulationRun(path)).state;
      expect(original.complete).toBe(false);
      await closeServer(model.server);
      const result = await cli(["resume", "--run", path]);
      expect(result.code, result.stderr).toBe(0);
      expect(result.stdout).toContain("Simulation complete.");
      expect(result.stdout).not.toContain("contributing…");
      const recovered = (await readSimulationRun(path)).state;
      expect(recovered.complete).toBe(true);
      expect(recovered.roundsCompleted).toBe(1);
      expect(recovered.passages).toEqual(original.passages);
      expect(recovered.rounds[0]?.responses).toEqual(
        original.rounds[0]?.responses,
      );
      expect(model.calls).toEqual({ alice: 1, bob: 1, composer: 1 });
    },
  );

  it("preserves a completed response when interrupted during another participant's call", async () => {
    const model = await provider({ slowBob: true });
    const f = await fixtures(model.baseUrl, 1);
    let interrupted = false;
    const result = await cli(
      [...simulate(f), "--auto"],
      [],
      (child, output) => {
        if (!interrupted && output.includes("alice response 1.")) {
          interrupted = true;
          child.kill("SIGINT");
        }
      },
    );
    expect(result.code, result.stderr).toBe(130);
    const state = (await readSimulationRun(f.out)).state;
    expect(state.rounds[0]?.responses.alice?.text).toBe("alice response 1.");
    expect(state.rounds[0]?.responses.bob).toBeUndefined();
    expect(state.passages).toHaveLength(0);
    expect(model.calls.alice).toBe(1);
    expect(model.calls.bob).toBeLessThanOrEqual(1);
    expect(model.calls.composer).toBe(0);
  });

  it.each([1, 2])(
    "requires participant credentials on composer retry only when future participant calls remain (%i rounds)",
    async (maxRounds) => {
      const model = await provider({ failComposer: true });
      const f = await fixtures(model.baseUrl, maxRounds);
      const failed = await cli(simulate(f), ["next", "q"]);
      expect(failed.code, failed.stderr).toBe(1);
      const saved = await readSimulationRun(f.out);
      const path = join(f.directory, "mixed-provider-recovery.jsonl");
      const config = {
        ...saved.state.config,
        simulation: {
          ...saved.state.config.simulation,
          participants: {
            ...saved.state.config.simulation.participants,
            provider: "openai" as const,
          },
        },
      };
      const log = await SimulationLog.create(path, {
        type: "simulation.created",
        scenario: saved.state.scenario,
        config,
      });
      try {
        for (const record of saved.events.slice(1))
          await log.append(record.event);
      } finally {
        await log.close();
      }
      const original = await readFile(path, "utf8");
      const result = await cli(
        ["resume", "--run", path],
        maxRounds === 1 ? ["retry"] : [],
      );
      if (maxRounds === 1) {
        expect(result.code, result.stderr).toBe(0);
        expect(result.stdout).toContain("Simulation complete.");
        expect(result.stdout).not.toContain("contributing…");
        const recovered = (await readSimulationRun(path)).state;
        expect(recovered.complete).toBe(true);
        expect(recovered.rounds[0]?.responses).toEqual(
          saved.state.rounds[0]?.responses,
        );
        expect(model.calls).toEqual({ alice: 1, bob: 1, composer: 2 });
      } else {
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("OPENAI_API_KEY");
        expect(await readFile(path, "utf8")).toBe(original);
        expect(model.calls).toEqual({ alice: 1, bob: 1, composer: 1 });
      }
    },
  );

  it("rejects automatic mode when resuming a scripted run", async () => {
    const f = await fixtures("http://127.0.0.1:1");
    const score = join(f.directory, "score.json");
    await writeFile(
      score,
      JSON.stringify({
        schemaVersion: 2,
        title: "Scripted",
        chunkPercent: 100,
        voices: [
          { id: "speaker", name: "Speaker", text: "A scripted contribution." },
        ],
      }),
    );
    const paused = await cli(
      ["run", "--score", score, "--config", f.config, "--out", f.out],
      ["q"],
    );
    expect(paused.code, paused.stderr).toBe(0);
    const resumed = await cli(["resume", "--run", f.out, "--auto"]);
    expect(resumed.code).toBe(1);
    expect(resumed.stderr).toContain(
      "--auto is supported only for simulation runs",
    );
  });
});
