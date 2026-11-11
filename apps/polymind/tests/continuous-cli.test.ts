import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ContinuousLog, readContinuousRun } from "../src/continuous-runs.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const children = new Set<ChildProcess>();
const servers = new Set<Server>();
const directories = new Set<string>();
type Request = { model: string; messages: { role: string; content: string }[] };
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
          child.once("close", resolve);
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

async function provider(options: { failComposer?: boolean } = {}) {
  const requests: Request[] = [];
  const calls = { alice: 0, bob: 0, composer: 0 };
  let activeParticipants = 0,
    active = 0,
    maxActive = 0,
    composedWhileStreaming = false;
  const server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw) as Request;
    requests.push(body);
    const composer = body.model === "composer-fixture";
    const id = composer
      ? "composer"
      : body.messages.some((message) =>
            message.content.includes("ALICE_MARKER"),
          )
        ? "alice"
        : "bob";
    const attempt = ++calls[id];
    active += 1;
    maxActive = Math.max(maxActive, active);
    if (composer) composedWhileStreaming ||= activeParticipants > 0;
    else activeParticipants += 1;
    try {
      if (composer && options.failComposer && attempt === 1) {
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Fixture composer unavailable" }));
        return;
      }
      const base = { model: body.model, created_at: "2026-11-03T12:00:00Z" };
      response.writeHead(200, { "Content-Type": "application/x-ndjson" });
      const chunks = composer
        ? ["We carry ", `the thought ${attempt}.`]
        : [`${id} begins 🙂 `, "and continues ", "with another thought."];
      for (const content of chunks) {
        if (response.destroyed) return;
        response.write(
          `${JSON.stringify({ ...base, message: { role: "assistant", content }, done: false })}\n`,
        );
        await pause(composer ? 10 : 200);
      }
      if (!response.destroyed)
        response.end(
          `${JSON.stringify({ ...base, message: { role: "assistant", content: "" }, done: true, done_reason: "stop", prompt_eval_count: 20, eval_count: 10 })}\n`,
        );
    } finally {
      active -= 1;
      if (!composer) activeParticipants -= 1;
    }
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
    overlap: () => composedWhileStreaming,
    maxActive: () => maxActive,
  };
}

async function fixtures(baseUrl: string) {
  const directory = await mkdtemp(join(tmpdir(), "continuous-cli-"));
  directories.add(directory);
  const scenario = join(directory, "scenario.json"),
    config = join(directory, "config.json"),
    out = join(directory, "continuous.jsonl");
  const model = {
    provider: "ollama",
    model: "composer-fixture",
    baseUrl,
    maxOutputTokens: 256,
    timeoutMs: 3000,
  };
  const configuration = {
    schemaVersion: 1,
    composer: model,
    instructions: "Speak collectively.",
    history: { maxPassages: 4, maxCharacters: 10000 },
    continuous: {
      maxTurnsPerParticipant: 1,
      concurrency: 2,
      composerIntervalMs: 100,
      maxCharactersPerParticipant: 10,
      maxPendingCharactersPerParticipant: 100,
      participants: { ...model, model: "participant-fixture" },
      instructions: "Continue your own thought.",
      history: { maxTurns: 4, maxCharacters: 10000 },
    },
  };
  await writeFile(
    scenario,
    JSON.stringify({
      schemaVersion: 1,
      title: "Continuous fixture",
      openingInvitation: "What should happen to the hall?",
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
          background: "Lives near it.",
        },
      ],
    }),
  );
  await writeFile(config, JSON.stringify(configuration));
  return { directory, scenario, config, out, configuration };
}

function cli(
  args: string[],
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
  // Seed historical journals through the preserved legacy implementation. New
  // CLI creation rejects version 1; resume/replay below still use the real CLI.
  const invocation =
    args[0] === "legacy-fixture"
      ? [
          "--input-type=module",
          "-e",
          `
      import { parseArgs } from 'node:util';
      import { handleContinuousCommand } from './src/continuous-cli.ts';
      const { values } = parseArgs({ args: process.argv.slice(1), options: {
        scenario: { type: 'string' }, config: { type: 'string' }, out: { type: 'string' }
      }});
      handleContinuousCommand('simulate-continuous', values).catch(error => {
        process.stderr.write('Error: ' + error.message + '\\n');
        process.exitCode = 1;
      });
    `,
          "--",
          ...args.slice(1),
        ]
      : ["src/cli.ts", ...args];
  const child = spawn(process.execPath, invocation, {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  let stdout = "",
    stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString();
    onOutput?.(child, stdout);
  });
  child.stderr?.on("data", (chunk) => {
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
    "legacy-fixture",
    "--scenario",
    f.scenario,
    "--config",
    f.config,
    "--out",
    f.out,
  ];
}

describe("historical continuous CLI compatibility", () => {
  it("composes while participant streams are still active and replays named saved portions offline", async () => {
    const model = await provider();
    const f = await fixtures(model.baseUrl);
    const result = await cli(simulate(f));
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("Continuous simulation complete.");
    expect(result.stdout).toContain("[INPUTS — continuous batch");
    expect(result.stdout).toContain("Alice — turn");
    expect(result.stdout).toContain("Bob — turn");
    expect(result.stdout).toContain("continuation");
    expect(result.stdout.indexOf("[INPUTS — continuous batch")).toBeLessThan(
      result.stdout.indexOf("[COLLECTIVE — provisional]"),
    );
    const provisionalPassages = [
      ...result.stdout.matchAll(
        /\[COLLECTIVE — provisional\]\n([\s\S]*?)\n\[accepted and saved\]/g,
      ),
    ];
    expect(provisionalPassages.length).toBeGreaterThan(0);
    for (const passage of provisionalPassages) {
      expect(passage[1]).not.toContain("— turn");
      expect(passage[1]).toMatch(/^We carry the thought \d+\.$/);
    }
    expect(model.overlap()).toBe(true);
    expect(model.maxActive()).toBeLessThanOrEqual(3);
    const read = await readContinuousRun(f.out);
    expect(read.state.complete).toBe(true);
    expect(read.state.turns).toHaveLength(2);
    expect(
      read.events.filter((record) => record.event.type === "participant.delta")
        .length,
    ).toBeGreaterThan(2);
    expect(read.state.passages.length).toBeGreaterThan(1);
    const original = await readFile(f.out, "utf8");
    await closeServer(model.server);
    const replay = await cli(["replay", "--run", f.out]);
    expect(replay.code, replay.stderr).toBe(0);
    expect(replay.stdout).toContain(
      "saved input portions and accepted collective passages",
    );
    expect(replay.stdout).toContain("[COLLECTIVE — accepted and saved]");
    expect(replay.stdout).toContain("Alice — turn");
    expect(await readFile(f.out, "utf8")).toBe(original);
    const rerun = await cli(["rerun", "--run", f.out]);
    expect(rerun.code).toBe(1);
    expect(rerun.stderr).toContain(
      "Rerun is not supported for continuous simulations",
    );
  });

  it("keeps interrupted prefixes, displays unconsumed text, and resumes without regenerating started turns", async () => {
    const model = await provider();
    const f = await fixtures(model.baseUrl);
    let interrupted = false;
    const stopped = await cli(simulate(f), (child, output) => {
      if (!interrupted && output.includes("input arriving and saved")) {
        interrupted = true;
        child.kill("SIGINT");
      }
    });
    expect(stopped.code, stopped.stderr).toBe(130);
    const before = await readContinuousRun(f.out);
    expect(before.state.complete).toBe(false);
    const prefixes = before.state.turns.filter((turn) => turn.text.length > 0);
    expect(prefixes.length).toBeGreaterThan(0);
    expect(
      before.state.turns.some((turn) => turn.status === "interrupted"),
    ).toBe(true);
    const replay = await cli(["replay", "--run", f.out]);
    expect(replay.code, replay.stderr).toBe(0);
    expect(replay.stdout).toContain("interrupted; saved text retained");
    expect(replay.stdout).toContain("UNCONSUMED INPUT");
    const callsBefore = model.calls.alice + model.calls.bob;
    const resumed = await cli(["resume", "--run", f.out]);
    expect(resumed.code, resumed.stderr).toBe(0);
    const after = await readContinuousRun(f.out);
    expect(after.state.complete).toBe(true);
    for (const prefix of prefixes)
      expect(
        after.state.turns.find((turn) => turn.id === prefix.id)?.text,
      ).toBe(prefix.text);
    // Missing voices may start, but no existing turn is generated a second time.
    expect(model.calls.alice).toBeLessThanOrEqual(1);
    expect(model.calls.bob).toBeLessThanOrEqual(1);
    expect(model.calls.alice + model.calls.bob).toBeGreaterThanOrEqual(
      callsBefore,
    );
  });

  it("retains a failed composer batch and retries it without participant calls", async () => {
    const model = await provider({ failComposer: true });
    const f = await fixtures(model.baseUrl);
    const failed = await cli(simulate(f));
    expect(failed.code, failed.stderr).toBe(1);
    expect(failed.stderr).toContain("[not accepted]");
    const before = await readContinuousRun(f.out);
    expect(before.state.pendingBatch).not.toBeNull();
    const calls = { ...model.calls };
    const resumed = await cli(["resume", "--run", f.out]);
    expect(resumed.code, resumed.stderr).toBe(0);
    const after = await readContinuousRun(f.out);
    expect(after.state.complete).toBe(true);
    expect(after.state.batches[0]?.contributions).toEqual(
      before.state.pendingBatch?.contributions,
    );
    expect(model.calls.alice).toBe(calls.alice);
    expect(model.calls.bob).toBe(calls.bob);
  });

  it("completes an already saved journal offline without provider credentials", async () => {
    const model = await provider();
    const f = await fixtures(model.baseUrl);
    const finished = await cli(simulate(f));
    expect(finished.code, finished.stderr).toBe(0);
    const saved = await readContinuousRun(f.out);
    const config = {
      ...saved.state.config,
      composer: { ...saved.state.config.composer, provider: "openai" as const },
      continuous: {
        ...saved.state.config.continuous,
        participants: {
          ...saved.state.config.continuous.participants,
          provider: "openai" as const,
        },
      },
    };
    const path = join(f.directory, "unfinished-completion.jsonl");
    const log = await ContinuousLog.create(path, {
      type: "continuous.created",
      scenario: saved.state.scenario,
      config,
    });
    try {
      for (const record of saved.events.slice(1, -1))
        await log.append(record.event);
    } finally {
      await log.close();
    }
    await closeServer(model.server);
    const result = await cli(["resume", "--run", path]);
    expect(result.code, result.stderr).toBe(0);
    expect((await readContinuousRun(path)).state.complete).toBe(true);
  });

  it("checks participant credentials before creating a continuous log", async () => {
    const f = await fixtures("http://127.0.0.1:1");
    await writeFile(
      f.config,
      JSON.stringify({
        ...f.configuration,
        continuous: {
          ...f.configuration.continuous,
          participants: {
            ...f.configuration.continuous.participants,
            provider: "openai",
          },
        },
      }),
    );
    const result = await cli(simulate(f));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("OPENAI_API_KEY");
    await expect(readFile(f.out)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
