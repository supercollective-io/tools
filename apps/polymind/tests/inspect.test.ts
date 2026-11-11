import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFile,
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContinuousLog } from "../src/continuous-runs.ts";
import { Controller } from "../src/controller.ts";
import { formatRunSummary, inspectRun, latestJournal } from "../src/inspect.ts";
import { LiveLog } from "../src/live-runs.ts";
import type { LiveConfig } from "../src/live-schema.ts";
import { RunLog } from "../src/runs.ts";
import type {
  Config,
  ContinuousScore,
  SimulationConfig,
  SimulationScenario,
} from "../src/schema.ts";
import { SimulationController } from "../src/simulation.ts";
import { SimulationLog } from "../src/simulation-runs.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const model = {
  provider: "openai" as const,
  model: "fixture",
  maxOutputTokens: 100,
  timeoutMs: 1000,
  baseUrl: "https://PRIVATE.invalid",
};
const config: Config = {
  schemaVersion: 1,
  composer: model,
  instructions: "PRIVATE_INSTRUCTIONS",
  history: { maxPassages: 2, maxCharacters: 1000 },
};
const scenario: SimulationScenario = {
  schemaVersion: 1,
  title: "A fictional rehearsal",
  openingInvitation: "What can we change?",
  voices: [
    {
      id: "a",
      name: "Alice",
      perspective: "PRIVATE_PERSPECTIVE",
      background: "PRIVATE_BACKGROUND",
    },
  ],
};
const score: ContinuousScore = {
  schemaVersion: 2,
  title: scenario.title,
  chunkPercent: 50,
  voices: [{ id: "a", name: "Alice", text: "firstUNSEEN" }],
};
const liveConfig: LiveConfig = {
  ...config,
  schemaVersion: 2,
  live: {
    participants: model,
    instructions: "PRIVATE_PARTICIPANT_INSTRUCTIONS",
    maxDurationMs: 10000,
    feedbackIntervalMs: 100,
    refreshIntervalMs: 100,
    maxContextCharacters: 1000,
  },
};
const messages = [{ role: "user" as const, content: "PRIVATE_PROMPT" }];
let directory: string;
const logs: { close(): Promise<void> }[] = [];
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "inspect-"));
});
afterEach(async () => {
  await Promise.all(logs.splice(0).map((log) => log.close()));
  await rm(directory, { recursive: true, force: true });
});
async function live(settings = liveConfig) {
  const log = await LiveLog.create(join(directory, "live.jsonl"), {
    type: "live.created",
    scenario,
    config: settings,
  });
  logs.push(log);
  return log;
}
async function appendLive(
  log: LiveLog,
  actorId: string,
  text: string,
  finish = true,
) {
  const attemptId = randomUUID();
  await log.append({
    type: "generation.started",
    actorId,
    attemptId,
    contextVersion: log.state.collectiveVersion,
    sourceOffsets:
      actorId === "collective"
        ? { a: log.state.participants[0]?.text.length ?? 0 }
        : {},
    messages,
  });
  await log.append({
    type: "text.appended",
    actorId,
    attemptId,
    offset: 0,
    text,
  });
  if (finish)
    await log.append({
      type: "generation.finished",
      actorId,
      attemptId,
      reason: "eos",
    });
  return attemptId;
}

describe("offline run inspection", () => {
  it("detects the format when the opening record spans multiple read buffers", async () => {
    const log = await live({
      ...liveConfig,
      live: {
        ...liveConfig.live,
        mode: "fixed",
        score: {
          ...score,
          voices: [{ id: "a", name: "Alice", text: "🙂".repeat(30000) }],
        },
      },
    });
    const summary = await inspectRun(log.path);
    expect(summary).toMatchObject({ kind: "live", recordedStatus: "ready" });
    expect(summary.participants[0]?.output.text).toBe("");
  });

  it("shows saved and published live text, failed prefixes and pause reason without private context", async () => {
    const log = await live();
    await log.append({ type: "session.started" });
    const attemptId = await appendLive(log, "participant/a", "Hello 🙂", false);
    await log.append({
      type: "generation.finished",
      actorId: "participant/a",
      attemptId,
      reason: "failed",
      code: "timeout",
    });
    await appendLive(log, "collective", "We can 🙂");
    await log.append({
      type: "session.paused",
      elapsedMs: 1500,
      reason: "timeout",
    });
    const summary = await inspectRun(log.path);
    expect(summary).toMatchObject({
      recordedStatus: "paused",
      outstandingAttempts: 0,
      timing: { recordedActiveMs: 1500, limitMs: 10000 },
      collective: { text: "We can 🙂", characters: 8, publishedCharacters: 0 },
      failures: {
        total: 1,
        recent: [{ actor: "participant/a", code: "timeout" }],
      },
    });
    expect(summary.participants[0]?.output).toEqual({
      text: "Hello 🙂",
      characters: 7,
      truncated: false,
    });
    expect(summary.pending).toContain("Pause reason: timeout");
    expect(JSON.stringify(summary)).not.toContain("PRIVATE");
    expect(formatRunSummary(summary)).toContain(
      "saved live text; 8 characters; 0 published",
    );
  });

  it("does not repair a torn tail or acquire a writer lock during an in-flight run", async () => {
    const log = await live();
    await log.append({ type: "session.started" });
    await appendLive(log, "collective", "Unfinished", false);
    await appendFile(log.path, '{"partial":');
    const before = await readFile(log.path);
    const files = await readdir(directory);
    const summary = await inspectRun(log.path);
    expect(summary.recordedStatus).toBe("running");
    expect(summary.outstandingAttempts).toBe(1);
    expect(summary.incompleteTailBytes).toBe(11);
    expect(summary.warnings.join(" ")).toContain("does not establish");
    expect(await readFile(log.path)).toEqual(before);
    expect(await readdir(directory)).toEqual(files);
  });

  it("reports completed fixed-source steps and publication independently of the duration ceiling", async () => {
    const log = await live({
      ...liveConfig,
      live: {
        ...liveConfig.live,
        mode: "fixed",
        score: { ...score, chunkPercent: 100 },
      },
    });
    await log.append({ type: "session.started" });
    await log.append({ type: "source.revealed", step: 0 });
    await appendLive(log, "collective", "Together.");
    await log.append({ type: "collective.published", version: 1, offset: 9 });
    await log.append({ type: "session.ended", elapsedMs: 500 });
    const summary = await inspectRun(log.path);
    expect(summary).toMatchObject({
      recordedStatus: "ended",
      progress: { completed: 1, total: 1, unit: "composed source steps" },
      collective: { publishedCharacters: 9 },
      pending: [],
    });
  });

  it("distinguishes ending a fixed session from composing all its source steps", async () => {
    const log = await live({
      ...liveConfig,
      live: { ...liveConfig.live, mode: "fixed", score },
    });
    await log.append({ type: "session.started" });
    await log.append({ type: "session.ended", elapsedMs: 500 });
    const summary = await inspectRun(log.path);
    expect(summary.recordedStatus).toBe("ended");
    expect(summary.progress).toMatchObject({ completed: 0, total: 2 });
    expect(summary.pending).toContain(
      "2 source steps were not composed before the session ended.",
    );
  });

  it("retains crash recovery in interruption history after a later clean end", async () => {
    const log = await live();
    await log.append({ type: "session.started" });
    await appendLive(log, "collective", "Interrupted prefix", false);
    await log.close();
    const recovered = await LiveLog.resume(log.path);
    logs.push(recovered);
    await recovered.append({ type: "session.started" });
    await recovered.append({
      type: "session.ended",
      elapsedMs: recovered.state.elapsedMs,
    });
    const summary = await inspectRun(log.path);
    expect(summary).toMatchObject({
      recordedStatus: "ended",
      outstandingAttempts: 0,
      failures: {
        total: 1,
        recent: [{ actor: "session", reason: "interrupted", code: null }],
      },
    });
    expect(summary.collective.text).toBe("Interrupted prefix");
  });

  it("bounds text by Unicode code points and exposes exact full writing on request", async () => {
    const log = await live();
    await log.append({ type: "session.started" });
    const text = `${"🙂".repeat(1400)}THE END`;
    await appendLive(log, "collective", text);
    const summary = await inspectRun(log.path);
    expect(summary.collective.characters).toBe(1407);
    expect(summary.collective.truncated).toBe(true);
    expect(summary.collective.text).toContain("[…]");
    expect(summary.collective.text).toMatch(/THE END$/);
    expect(summary.collective.text).not.toMatch(/[\uD800-\uDFFF]/u);
    expect((await inspectRun(log.path, true)).collective).toMatchObject({
      text,
      truncated: false,
    });
  });

  it("shows only admitted scripted input, retains failure history after successful retry, and distinguishes completion", async () => {
    const log = await RunLog.create(join(directory, "scripted.jsonl"), {
      type: "run.created",
      score,
      config,
    });
    logs.push(log);
    const failed = new Controller(log, async () => {
      throw Object.assign(new Error("PRIVATE_ERROR"), { status: 503 });
    });
    await expect(
      failed.advance(new AbortController().signal, () => {}),
    ).rejects.toThrow("503");
    const pending = await inspectRun(log.path);
    expect(pending.participants[0]?.output.text).toBe("first");
    expect(JSON.stringify(pending)).not.toContain("UNSEEN");
    expect(pending.failures.recent[0]?.httpStatus).toBe(503);
    expect(pending.pending).toContain(
      "Admitted input has no accepted collective passage.",
    );
    const controller = new Controller(log, async () => ({
      text: "A collective passage.",
    }));
    await controller.advance(new AbortController().signal, () => {});
    await controller.advance(new AbortController().signal, () => {});
    const completed = await inspectRun(log.path);
    expect(completed).toMatchObject({
      kind: "scripted",
      recordedStatus: "completed",
      progress: { completed: 2, total: 2 },
      failures: { total: 1 },
      pending: [],
    });
    expect(completed.collective.basis).toBe("accepted passages");
    expect(JSON.stringify(completed)).not.toContain("PRIVATE");
  });

  it("reads version-1 scripted scores without reslicing their fragments", async () => {
    const log = await RunLog.create(join(directory, "legacy.jsonl"), {
      type: "run.created",
      config,
      score: {
        schemaVersion: 1,
        title: "Legacy",
        voices: [
          {
            id: "a",
            name: "Alice",
            fragments: [{ id: "f", text: "Original fragment" }],
          },
        ],
        batches: [{ id: "b", fragments: [{ voiceId: "a", fragmentId: "f" }] }],
      },
    });
    logs.push(log);
    await new Controller(log, async () => ({ text: "Accepted" })).advance(
      new AbortController().signal,
      () => {},
    );
    expect((await inspectRun(log.path)).participants[0]?.output.text).toBe(
      "Original fragment",
    );
  });

  it("summarises generated and frozen-response simulation runs", async () => {
    const simulationConfig: SimulationConfig = {
      ...config,
      simulation: {
        participants: model,
        instructions: "PRIVATE_SIMULATION",
        maxRounds: 1,
        concurrency: 1,
        intervalMs: 0,
        history: { maxTurns: 2, maxCharacters: 1000 },
      },
    };
    for (const frozen of [false, true]) {
      const log = await SimulationLog.create(
        join(directory, `simulation-${frozen}.jsonl`),
        {
          type: "simulation.created",
          scenario,
          config: simulationConfig,
          ...(frozen
            ? {
                recordedRounds: [
                  [
                    {
                      participantId: "a",
                      text: "Recorded response",
                      respondingToPassageId: null,
                    },
                  ],
                ],
                sourceRunId: randomUUID(),
              }
            : {}),
        },
      );
      logs.push(log);
      await new SimulationController(log, async () => ({
        text: "Generated writing",
      })).advance(new AbortController().signal);
      const summary = await inspectRun(log.path);
      expect(summary).toMatchObject({
        kind: "simulation",
        recordedStatus: "completed",
        progress: { completed: 1, total: 1 },
        outstandingAttempts: 0,
        pending: [],
      });
      expect(summary.participants[0]?.output.text).toBe(
        frozen ? "Recorded response" : "Generated writing",
      );
      expect(summary.mode).toBe(
        frozen ? "frozen-response rerun" : "generated responses",
      );
    }
  });

  it("retains historical continuous partial text and interrupted work", async () => {
    const log = await ContinuousLog.create(
      join(directory, "continuous.jsonl"),
      {
        type: "continuous.created",
        scenario,
        config: {
          ...config,
          continuous: {
            participants: model,
            instructions: "PRIVATE_CONTINUOUS",
            maxTurnsPerParticipant: 1,
            concurrency: 1,
            composerIntervalMs: 100,
            maxCharactersPerParticipant: 50,
            maxPendingCharactersPerParticipant: 100,
            history: { maxTurns: 2, maxCharacters: 1000 },
          },
        },
      },
    );
    logs.push(log);
    const turnId = randomUUID();
    await log.append({
      type: "participant.started",
      participantId: "a",
      turnIndex: 0,
      turnId,
      respondingToPassageId: null,
      messages,
    });
    await log.append({
      type: "participant.delta",
      turnId,
      text: "Partial text",
    });
    await log.append({
      type: "participant.finished",
      turnId,
      outcome: "interrupted",
      code: "aborted",
    });
    const summary = await inspectRun(log.path);
    expect(summary.kind).toBe("historical-continuous");
    expect(summary.participants[0]?.output.text).toBe("Partial text");
    expect(summary.pending).toContain(
      "Saved participant text remains unconsumed.",
    );
    expect(summary.failures.total).toBe(1);
    expect(summary.failures.recent[0]?.actor).toBe("a");
  });

  it("rejects corrupt complete records and unsupported formats without rewriting", async () => {
    const log = await live();
    await appendFile(log.path, "not JSON\n");
    const before = await readFile(log.path);
    await expect(inspectRun(log.path)).rejects.toThrow("invalid JSON");
    expect(await readFile(log.path)).toEqual(before);
    const unknown = join(directory, "unknown.jsonl");
    await writeFile(unknown, '{"event":{"type":"unknown"}}\n');
    await expect(inspectRun(unknown)).rejects.toThrow("Unsupported");
  });

  it("selects newest JSONL files deterministically and explains empty directories", async () => {
    await expect(latestJournal(directory)).rejects.toThrow("No saved JSONL");
    await expect(latestJournal(join(directory, "missing"))).rejects.toThrow(
      "No saved JSONL",
    );
    const old = join(directory, "old.jsonl");
    const newest = join(directory, "new.jsonl");
    await writeFile(old, "old");
    await writeFile(newest, "new");
    await writeFile(join(directory, "probe.json"), "ignored");
    await utimes(old, 1, 1);
    await utimes(newest, 2, 2);
    expect(await latestJournal(directory)).toBe(newest);
  });

  it("prints parseable CLI JSON with no credentials even when tracing is enabled", async () => {
    const log = await live();
    const before = await readFile(log.path);
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      ["src/cli.ts", "inspect", "--run", log.path, "--json", "--full"],
      {
        cwd: root,
        env: { ...process.env, OPENAI_API_KEY: "", LANGSMITH_TRACING: "true" },
      },
    );
    expect(JSON.parse(stdout)).toMatchObject({
      schemaVersion: 1,
      path: log.path,
      recordedStatus: "ready",
    });
    expect(stderr).toBe("");
    expect(await readFile(log.path)).toEqual(before);
    const audit = await promisify(execFile)(
      process.execPath,
      ["src/cli.ts", "inspect", "--run", log.path, "--composer", "--json"],
      {
        cwd: root,
        env: { ...process.env, OPENAI_API_KEY: "", LANGSMITH_TRACING: "true" },
      },
    );
    expect(JSON.parse(audit.stdout)).toMatchObject({
      path: log.path,
      status: "ready",
      requests: [],
    });
    expect(audit.stdout).not.toContain("PRIVATE");
    expect(await readFile(log.path)).toEqual(before);
    await expect(
      promisify(execFile)(
        process.execPath,
        [
          "src/cli.ts",
          "inspect",
          "--run",
          log.path,
          "--out",
          join(directory, "forbidden.jsonl"),
        ],
        { cwd: root },
      ),
    ).rejects.toThrow("not supported");
  });
});
