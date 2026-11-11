import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readRun } from "../src/runs.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const children = new Set<ChildProcess>();
const servers = new Set<Server>();
const directories = new Set<string>();
const writtenText = " Keep the hall open.🙂Let the neighbours sleep. ";
const characters = Array.from(writtenText);
const midpoint = Math.floor(characters.length / 2);
const firstSlice = characters.slice(0, midpoint).join("");
const secondSlice = characters.slice(midpoint).join("");

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    servers.delete(server);
    return;
  }
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
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
    [...directories].map((path) => rm(path, { recursive: true, force: true })),
  );
  directories.clear();
});

async function fakeOllama(
  options: { failFirst?: boolean; truncateFirst?: boolean } = {},
) {
  const requests: unknown[] = [];
  let successes = 0;
  const server = createServer(async (request, response) => {
    if (request.url !== "/api/chat" || request.method !== "POST") {
      response.writeHead(404).end();
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    if (options.failFirst && requests.length === 1) {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Temporary rehearsal outage" }));
      return;
    }
    successes += 1;
    const base = { model: "fixture-model", created_at: "2026-11-03T12:00:00Z" };
    response.writeHead(200, { "Content-Type": "application/x-ndjson" });
    const truncated = requests.length === 1 && options.truncateFirst;
    const chunks = ["We share the hall, ", `passage ${successes}.`];
    for (const content of chunks) {
      response.write(
        `${JSON.stringify({ ...base, message: { role: "assistant", content }, done: false })}\n`,
      );
    }
    response.end(
      `${JSON.stringify({ ...base, message: { role: "assistant", content: "" }, done: true, done_reason: truncated ? "length" : "stop", prompt_eval_count: 12, eval_count: 7 })}\n`,
    );
  });
  servers.add(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server port");
  return { server, requests, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function fixtures(baseUrl: string) {
  const directory = await mkdtemp(join(tmpdir(), "collective-cli-"));
  directories.add(directory);
  const score = join(directory, "score.json");
  const config = join(directory, "config.json");
  const out = join(directory, "run.jsonl");
  await writeFile(
    score,
    JSON.stringify({
      schemaVersion: 2,
      title: "Original integration demonstration",
      chunkPercent: 50,
      voices: [
        {
          id: "voice",
          name: "Neighbour",
          text: writtenText,
        },
        {
          id: "caretaker",
          name: "Caretaker",
          text: "A",
        },
      ],
    }),
  );
  await writeFile(
    config,
    JSON.stringify({
      schemaVersion: 1,
      composer: {
        provider: "ollama",
        model: "fixture-model",
        baseUrl,
        maxOutputTokens: 256,
        timeoutMs: 5000,
      },
      instructions: "Write one English sentence preserving disagreement.",
      history: { maxPassages: 6, maxCharacters: 12000 },
    }),
  );
  return { directory, score, config, out };
}

function cli(args: string[], commands: string[] = []) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key === "OPENAI_API_KEY" ||
      key.startsWith("LANGCHAIN_") ||
      key.startsWith("LANGSMITH_")
    )
      delete env[key];
  }
  const child = spawn(process.execPath, ["src/cli.ts", ...args], {
    cwd: root,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  children.add(child);
  let stdout = "";
  let stderr = "";
  let consumed = 0;
  let sent = 0;
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
    let prompt = stdout.indexOf("> ", consumed);
    while (prompt !== -1) {
      consumed = prompt + 2;
      // readline must have reached its prompt before stdin receives a command.
      if (sent < commands.length) child.stdin.write(`${commands[sent++]}\n`);
      prompt = stdout.indexOf("> ", consumed);
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`CLI timed out\n${stdout}\n${stderr}`));
      }, 15000);
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

function runArgs(f: Awaited<ReturnType<typeof fixtures>>) {
  return ["run", "--score", f.score, "--config", f.config, "--out", f.out];
}

function expectBatchPresentation(
  output: string,
  batch: number,
  passage: string,
  totalSteps = 2,
) {
  const position = `step ${batch}/${totalSteps} — ${batch === 1 ? "0–50%" : "50–100%"}`;
  const inputs = output.indexOf(`[INPUTS — ${position} — scripted/fixed text]`);
  const contribution = output.indexOf(
    batch === 1 ? firstSlice : secondSlice,
    inputs,
  );
  const collective = output.indexOf(`[COLLECTIVE — ${position}`, contribution);
  const text = output.indexOf(passage, collective);
  expect(inputs).toBeGreaterThanOrEqual(0);
  expect(contribution).toBeGreaterThan(inputs);
  expect(collective).toBeGreaterThan(contribution);
  expect(text).toBeGreaterThan(collective);
  expect(output).toContain("Neighbour:");
  expect(output).toContain(
    `Neighbour:\n${batch === 1 ? firstSlice : secondSlice}\n`,
  );
  expect(output).toContain(
    batch === 1
      ? "Caretaker:\n(no new characters in this interval)"
      : "Caretaker:\nA\n",
  );
}

describe("CLI subprocess integration", () => {
  it("streams and saves a complete run, then replays offline without credentials", async () => {
    const ollama = await fakeOllama();
    const f = await fixtures(ollama.baseUrl);
    const result = await cli(runArgs(f), ["next", "next"]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "[COLLECTIVE — step 1/2 — 0–50% — provisional]\nWe share the hall, passage 1.",
    );
    expect(result.stdout.match(/\[accepted and saved\]/g)).toHaveLength(2);
    expect(result.stdout).toContain("Run complete.");
    expectBatchPresentation(result.stdout, 1, "We share the hall, passage 1.");
    expectBatchPresentation(result.stdout, 2, "We share the hall, passage 2.");
    expect(ollama.requests).toHaveLength(2);
    const saved = await readRun(f.out);
    expect(saved.state.complete).toBe(true);
    expect(saved.state.passages.map((passage) => passage.text)).toEqual([
      "We share the hall, passage 1.",
      "We share the hall, passage 2.",
    ]);
    expect(
      saved.events
        .filter((record) => record.event.type === "passage.accepted")
        .map((record) => record.event),
    ).toEqual([
      expect.objectContaining({
        usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
      }),
      expect.objectContaining({
        usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
      }),
    ]);
    const original = await readFile(f.out, "utf8");
    await closeServer(ollama.server);
    const replay = await cli(["replay", "--run", f.out]);
    expect(replay.code, replay.stderr).toBe(0);
    expectBatchPresentation(replay.stdout, 1, "We share the hall, passage 1.");
    expectBatchPresentation(replay.stdout, 2, "We share the hall, passage 2.");
    expect(replay.stdout).toContain("2 accepted passages; complete.");
    expect(await readFile(f.out, "utf8")).toBe(original);
  }, 30000);

  it("pauses, resumes only the remaining batch and reruns into a separate log", async () => {
    const ollama = await fakeOllama();
    const f = await fixtures(ollama.baseUrl);
    const paused = await cli(runArgs(f), ["next", "q"]);
    expect(paused.code, paused.stderr).toBe(0);
    expect(paused.stdout).toContain("Paused. Resume with:");
    expectBatchPresentation(paused.stdout, 1, "We share the hall, passage 1.");
    expect(paused.stdout).not.toContain(secondSlice);
    expect(paused.stdout).not.toContain("[INPUTS — step 2/2");
    expect((await readRun(f.out)).state.passages).toHaveLength(1);
    const resumed = await cli(["resume", "--run", f.out], ["next"]);
    expect(resumed.code, resumed.stderr).toBe(0);
    expect(resumed.stdout).toContain(
      "Last accepted passage:\nWe share the hall, passage 1.",
    );
    expectBatchPresentation(resumed.stdout, 1, "We share the hall, passage 1.");
    expectBatchPresentation(resumed.stdout, 2, "We share the hall, passage 2.");
    expect(ollama.requests).toHaveLength(2);
    const source = await readRun(f.out);
    expect(source.state.complete).toBe(true);
    expect(source.state.admitted).toHaveLength(2);
    const original = await readFile(f.out, "utf8");
    const rerunPath = join(f.directory, "rerun.jsonl");
    const rerun = await cli(
      ["rerun", "--run", f.out, "--out", rerunPath],
      ["next", "next"],
    );
    expect(rerun.code, rerun.stderr).toBe(0);
    expectBatchPresentation(rerun.stdout, 1, "We share the hall, passage 3.");
    expectBatchPresentation(rerun.stdout, 2, "We share the hall, passage 4.");
    const fresh = await readRun(rerunPath);
    expect(fresh.state.complete).toBe(true);
    expect(fresh.state.runId).not.toBe(source.state.runId);
    expect(fresh.events[0]?.event).toMatchObject({
      sourceRunId: source.state.runId,
    });
    expect(fresh.state.passages.map((passage) => passage.text)).toEqual([
      "We share the hall, passage 3.",
      "We share the hall, passage 4.",
    ]);
    expect(ollama.requests[2]).toEqual(ollama.requests[0]);
    expect(await readFile(f.out, "utf8")).toBe(original);
  }, 30000);

  it("retries HTTP 503 without admitting the same contributions twice", async () => {
    const ollama = await fakeOllama({ failFirst: true });
    const f = await fixtures(ollama.baseUrl);
    const result = await cli(runArgs(f), ["next", "retry", "q"]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).toContain("[not accepted]");
    expect(
      result.stdout.match(
        /\[INPUTS — step 1\/2 — 0–50% — scripted\/fixed text\]/g,
      ),
    ).toHaveLength(2);
    expect(result.stdout.split(firstSlice)).toHaveLength(3);
    expect(result.stdout).not.toContain(secondSlice);
    expect(ollama.requests).toHaveLength(2);
    expect(ollama.requests[1]).toEqual(ollama.requests[0]);
    const saved = await readRun(f.out);
    expect(saved.state.passages).toHaveLength(1);
    expect(
      saved.events.filter((record) => record.event.type === "batch.admitted"),
    ).toHaveLength(1);
    expect(
      saved.events.filter(
        (record) => record.event.type === "generation.started",
      ),
    ).toHaveLength(2);
    expect(
      saved.events.filter(
        (record) => record.event.type === "generation.failed",
      ),
    ).toHaveLength(1);
  }, 30000);

  it("reruns only admitted steps without changing the original percentage boundaries", async () => {
    const ollama = await fakeOllama();
    const f = await fixtures(ollama.baseUrl);
    const paused = await cli(runArgs(f), ["next", "q"]);
    expect(paused.code, paused.stderr).toBe(0);
    const source = await readRun(f.out);
    const original = await readFile(f.out, "utf8");
    const rerunPath = join(f.directory, "partial-rerun.jsonl");
    const rerun = await cli(
      ["rerun", "--run", f.out, "--out", rerunPath],
      ["next"],
    );
    expect(rerun.code, rerun.stderr).toBe(0);
    expectBatchPresentation(
      rerun.stdout,
      1,
      "We share the hall, passage 2.",
      1,
    );
    expect(rerun.stdout).not.toContain(secondSlice);
    expect(rerun.stdout).toContain("[0/1 accepted]");
    const fresh = await readRun(rerunPath);
    expect(fresh.state.complete).toBe(true);
    expect(fresh.state.totalSteps).toBe(1);
    expect(fresh.state.score).toEqual(source.state.score);
    expect(fresh.events[0]?.event).toMatchObject({ stepLimit: 1 });
    expect(fresh.state.admitted).toEqual(source.state.admitted);
    expect(ollama.requests[1]).toEqual(ollama.requests[0]);
    expect(await readFile(f.out, "utf8")).toBe(original);
    await closeServer(ollama.server);
    const replay = await cli(["replay", "--run", rerunPath]);
    expect(replay.code, replay.stderr).toBe(0);
    expectBatchPresentation(
      replay.stdout,
      1,
      "We share the hall, passage 2.",
      1,
    );
    expect(replay.stdout).not.toContain(secondSlice);
  }, 30000);

  it("uses the actual percentage range when earlier intervals contain no characters", async () => {
    const ollama = await fakeOllama();
    const f = await fixtures(ollama.baseUrl);
    await writeFile(
      f.score,
      JSON.stringify({
        schemaVersion: 2,
        title: "One character",
        chunkPercent: 10,
        voices: [{ id: "voice", name: "Neighbour", text: "🙂" }],
      }),
    );
    const result = await cli(runArgs(f), ["next"]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "[INPUTS — step 1/1 — 90–100% — scripted/fixed text]",
    );
    expect(result.stdout).toContain("Neighbour:\n🙂\n");
    expect(result.stdout).toContain(
      "[COLLECTIVE — step 1/1 — 90–100% — provisional]",
    );
    expect(ollama.requests).toHaveLength(1);
  }, 30000);

  it("replays pending admitted inputs offline without showing future fragments", async () => {
    const ollama = await fakeOllama({ failFirst: true });
    const f = await fixtures(ollama.baseUrl);
    const failed = await cli(runArgs(f), ["next", "q"]);
    expect(failed.code).toBe(1);
    const original = await readFile(f.out, "utf8");
    // The frozen score, not a subsequently edited source file, supplies names.
    await writeFile(f.score, "{}");
    await closeServer(ollama.server);
    const replay = await cli(["replay", "--run", f.out]);
    expect(replay.code, replay.stderr).toBe(0);
    expectBatchPresentation(
      replay.stdout,
      1,
      "pending — no accepted collective passage",
    );
    expect(replay.stdout).not.toContain(secondSlice);
    expect(replay.stdout).toContain(
      "0 accepted passages; paused or interrupted.",
    );
    expect(await readFile(f.out, "utf8")).toBe(original);
  }, 30000);

  it("shows the same pending inputs when resuming a failed batch", async () => {
    const ollama = await fakeOllama({ failFirst: true });
    const f = await fixtures(ollama.baseUrl);
    const failed = await cli(runArgs(f), ["next", "q"]);
    expect(failed.code).toBe(1);
    const resumed = await cli(["resume", "--run", f.out], ["retry", "q"]);
    expect(resumed.code, resumed.stderr).toBe(0);
    expectBatchPresentation(resumed.stdout, 1, "We share the hall, passage 1.");
    expect(resumed.stdout).not.toContain(secondSlice);
    expect(ollama.requests[1]).toEqual(ollama.requests[0]);
    expect((await readRun(f.out)).state.admitted).toHaveLength(1);
  }, 30000);

  it("keeps truncated output provisional and retries the same pending inputs explicitly", async () => {
    const ollama = await fakeOllama({ truncateFirst: true });
    const f = await fixtures(ollama.baseUrl);
    const failed = await cli(runArgs(f), ["next", "q"]);
    expect(failed.code, failed.stderr).toBe(1);
    expect(failed.stderr).toContain("[not accepted]");
    expect(failed.stderr).toContain("cut off the passage at its token limit");
    expect(failed.stdout).not.toContain("[accepted and saved]");
    expect(failed.stdout).toContain("We share the hall, passage 1.");
    expect(ollama.requests).toHaveLength(1);
    const pending = await readRun(f.out);
    expect(pending.state.passages).toHaveLength(0);
    expect(pending.state.pending).toEqual(pending.state.admitted[0]);
    expect(
      pending.events
        .filter((record) => record.event.type === "generation.failed")
        .map((record) => record.event),
    ).toEqual([expect.objectContaining({ code: "truncated" })]);
    const original = await readFile(f.out, "utf8");
    const replay = await cli(["replay", "--run", f.out]);
    expect(replay.code, replay.stderr).toBe(0);
    expectBatchPresentation(
      replay.stdout,
      1,
      "pending — no accepted collective passage",
    );
    expect(replay.stdout).not.toContain("We share the hall, passage 1.");
    expect(replay.stdout).toContain(
      "0 accepted passages; paused or interrupted.",
    );
    expect(await readFile(f.out, "utf8")).toBe(original);
    expect(ollama.requests).toHaveLength(1);

    const retried = await cli(["resume", "--run", f.out], ["retry", "q"]);
    expect(retried.code, retried.stderr).toBe(0);
    expectBatchPresentation(retried.stdout, 1, "We share the hall, passage 2.");
    expect(ollama.requests).toHaveLength(2);
    expect(ollama.requests[1]).toEqual(ollama.requests[0]);
    const saved = await readRun(f.out);
    expect(saved.state.admitted).toHaveLength(1);
    expect(saved.state.passages.map((passage) => passage.text)).toEqual([
      "We share the hall, passage 2.",
    ]);
    expect(saved.state.pending).toBeNull();
  }, 30000);

  it("rejects invalid configuration before creating an output file", async () => {
    const f = await fixtures("http://127.0.0.1:1");
    await writeFile(f.config, JSON.stringify({ schemaVersion: 1 }));
    const result = await cli(runArgs(f));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Configuration:");
    await expect(readFile(f.out)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an existing output path and preserves its contents", async () => {
    const f = await fixtures("http://127.0.0.1:1");
    await writeFile(f.out, "Existing rehearsal notes\n");
    const result = await cli(runArgs(f));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Existing files are never overwritten");
    expect(await readFile(f.out, "utf8")).toBe("Existing rehearsal notes\n");
  });
});
