import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveLog, readLiveRun } from "../src/live-runs.ts";
import type { LiveConfig } from "../src/live-schema.ts";
import type { Generate } from "../src/models.ts";
import type { ContinuousScore, SimulationScenario } from "../src/schema.ts";
import {
  startWorkspace,
  type WorkspaceOptions,
  WorkspacePreparationError,
} from "../src/workspace.ts";

const model = {
  provider: "ollama" as const,
  model: "fixture-model",
  baseUrl: "http://PRIVATE.invalid:11435",
  maxOutputTokens: 50,
  timeoutMs: 1000,
};
const config: LiveConfig = {
  schemaVersion: 2,
  composer: model,
  instructions: "PRIVATE_COMPOSER",
  history: { maxPassages: 1, maxCharacters: 1000 },
  live: {
    participants: model,
    instructions: "PRIVATE_PARTICIPANTS",
    maxDurationMs: 1000,
    feedbackIntervalMs: 100,
    refreshIntervalMs: 100,
    maxContextCharacters: 1000,
  },
};
const scenario: SimulationScenario = {
  schemaVersion: 1,
  title: "A workspace fixture",
  openingInvitation: "What happens next?",
  voices: ["other", "rosa", "chris"].map((id) => ({
    id,
    name: id,
    perspective: "PRIVATE_PERSPECTIVE",
    background: "PRIVATE_BACKGROUND",
  })),
};
const score: ContinuousScore = {
  schemaVersion: 2,
  title: "Frozen fixture",
  chunkPercent: 10,
  voices: scenario.voices.map(({ id, name }) => ({
    id,
    name,
    text: `Frozen source ${id}`,
  })),
};
const servers: Awaited<ReturnType<typeof startWorkspace>>[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
const waitingGenerate: Generate = async ({ signal }) => {
  await new Promise<void>((resolve) => {
    if (signal?.aborted) resolve();
    else signal?.addEventListener("abort", () => resolve(), { once: true });
  });
  return { text: "", finishReason: "aborted" };
};
async function fixture(overrides: Partial<WorkspaceOptions> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "workspace-"));
  directories.push(directory);
  const prepare = vi.fn(async () => {});
  const generate = vi.fn(waitingGenerate);
  const server = await startWorkspace({
    runsDirectory: directory,
    scenario,
    score,
    config,
    port: 0,
    prepare,
    generate,
    models: [
      {
        id: "qwen3b",
        label: "Fast local model",
        modes: ["continuous", "chunked", "fixed"],
        composer: model,
        participants: model,
      },
      {
        id: "gemma12b",
        label: "Larger local model",
        modes: ["chunked", "fixed"],
        composer: { ...model, model: "gemma-fixture" },
        participants: { ...model, model: "gemma-fixture" },
      },
    ],
    ...overrides,
  });
  servers.push(server);
  return { ...server, directory, prepare, generate };
}
const post = (url: string, action: string, body = {}) =>
  fetch(`${url}/api/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const selected = { mode: "continuous", model: "qwen3b", participants: 2 };

describe("browser workspace", () => {
  it("opens an idle, private setup without journals, preparation or model calls", async () => {
    const f = await fixture();
    expect(f.snapshot().state).toBeNull();
    expect(f.snapshot().workspace.settings).toEqual(selected);
    expect(f.snapshot().workspace.participantCounts).toEqual([2, 3]);
    const text = await (await fetch(`${f.url}/api/state`)).text();
    expect(text).toContain("Larger local model");
    expect(text).not.toMatch(
      /PRIVATE|baseUrl|instructions|perspective|background/,
    );
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
    expect(await readdir(f.directory)).toEqual([]);
  });

  it("validates catalogue choices and saves frozen pair settings only on Start", async () => {
    const f = await fixture();
    for (const body of [
      { ...selected, model: "unknown" },
      { ...selected, model: "gemma12b" },
      { ...selected, participants: 1 },
      { ...selected, extra: true },
    ])
      expect((await post(f.url, "start", body)).status).toBe(400);
    expect(f.prepare).not.toHaveBeenCalled();
    expect(
      (
        await post(f.url, "start", {
          ...selected,
          mode: "fixed",
          model: "gemma12b",
        })
      ).status,
    ).toBe(200);
    const path = f.snapshot().path;
    if (!path) throw new Error("Missing journal");
    const state = (await readLiveRun(path)).state;
    expect(state.config.live.mode).toBe("fixed");
    expect(state.config.live.score?.voices.map((voice) => voice.id)).toEqual([
      "chris",
      "rosa",
    ]);
    expect(state.scenario.voices.map((voice) => voice.id)).toEqual([
      "chris",
      "rosa",
    ]);
    expect(state.config.live.maxDurationMs).toBe(300000);
    expect(state.config.live.maxContextCharacters).toBe(24000);
    expect(state.config.composer.maxOutputTokens).toBe(96);
    expect(state.config.live.participants.maxOutputTokens).toBe(96);
    const publicText = JSON.stringify(f.snapshot());
    expect(publicText).not.toMatch(
      /PRIVATE|baseUrl|instructions|perspective|background/,
    );
    await vi.waitFor(() => expect(f.generate).toHaveBeenCalledOnce());
    const visible = f.snapshot().state;
    expect(visible?.participants.map((writer) => writer.sourceText)).toEqual([
      "Frozen source chris",
      "Frozen source rosa",
    ]);
    expect(visible?.participants.map((writer) => writer.text)).toEqual([
      "F",
      "F",
    ]);
    expect(visible?.composer.seenOffsets).toEqual({ chris: 1, rosa: 1 });
    const prompt = JSON.stringify(f.generate.mock.calls[0]?.[0].messages);
    expect(prompt).not.toContain("Frozen source");
    expect((await post(f.url, "start", selected)).status).toBe(409);
  });

  it("serialises controls around preparation and publishes busy setup", async () => {
    let release: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const preparing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const prepare = vi.fn(async () => {
      entered?.();
      await gate;
    });
    const f = await fixture({ prepare });
    const start = post(f.url, "start", selected);
    await preparing;
    expect(f.snapshot().workspace.busy).toContain("Preparing");
    expect(f.snapshot().state).toBeNull();
    expect(await readdir(f.directory)).toEqual([]);
    const pause = post(f.url, "pause");
    release?.();
    expect((await start).status).toBe(200);
    expect((await pause).status).toBe(200);
    expect(f.snapshot().state?.status).toBe("paused");
    expect(f.snapshot().workspace.busy).toBeUndefined();
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("returns safe preparation errors and permits retry without an empty journal", async () => {
    const prepare = vi
      .fn()
      .mockRejectedValueOnce(new Error("PRIVATE backend credentials"))
      .mockRejectedValueOnce(
        new WorkspacePreparationError(
          "Install the selected local model first.",
        ),
      );
    const f = await fixture({ prepare });
    const failure = await post(f.url, "start", selected);
    expect(failure.status).toBe(409);
    expect(await failure.text()).not.toContain("PRIVATE");
    expect(await (await post(f.url, "start", selected)).text()).toContain(
      "Install the selected local model first.",
    );
    expect(await readdir(f.directory)).toEqual([]);
    expect(f.snapshot().state).toBeNull();
  });

  it("lists and reopens saved sessions, recovers interrupted logs and rejects unsafe paths", async () => {
    const f = await fixture();
    const interrupted = await LiveLog.create(
      join(f.directory, "interrupted.jsonl"),
      { type: "live.created", scenario, config },
    );
    await interrupted.append({ type: "session.started" });
    await interrupted.close();
    const ended = await LiveLog.create(join(f.directory, "ended.jsonl"), {
      type: "live.created",
      scenario,
      config,
    });
    await ended.append({ type: "session.ended", elapsedMs: 0 });
    await ended.close();
    const empty = await LiveLog.create(join(f.directory, "unused.jsonl"), {
      type: "live.created",
      scenario,
      config,
    });
    await empty.close();
    await writeFile(join(f.directory, "other.jsonl"), "{}");
    await symlink(
      join(f.directory, "ended.jsonl"),
      join(f.directory, "link.jsonl"),
    );
    await post(f.url, "new");
    expect(
      f
        .snapshot()
        .workspace.sessions.map((session) => session.id)
        .sort(),
    ).toEqual(["ended.jsonl", "interrupted.jsonl"]);
    for (const id of [
      "../ended.jsonl",
      "/tmp/ended.jsonl",
      "link.jsonl",
      "unused.jsonl",
      "other.jsonl",
    ])
      expect((await post(f.url, "open", { id })).status).toBe(400);
    expect(
      (await post(f.url, "open", { id: "interrupted.jsonl" })).status,
    ).toBe(200);
    expect(f.snapshot().state?.status).toBe("paused");
    expect(
      (await readLiveRun(join(f.directory, "interrupted.jsonl"))).events.at(-1)
        ?.event.type,
    ).toBe("session.recovered");
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
    expect((await post(f.url, "open", { id: "ended.jsonl" })).status).toBe(200);
    expect(f.snapshot().state?.status).toBe("ended");
    expect((await post(f.url, "start")).status).toBe(409);
    await post(f.url, "new");
    expect(f.snapshot().state).toBeNull();
  });

  it("preserves explicit configuration and does not prepare an already running session", async () => {
    // Keep the session alive while CI performs journal and HTTP round trips.
    const explicitConfig = {
      ...config,
      composer: { ...model, timeoutMs: 60_000 },
      live: {
        ...config.live,
        participants: { ...model, timeoutMs: 60_000 },
        maxDurationMs: 60_000,
      },
    };
    const f = await fixture({
      useDefaults: false,
      config: explicitConfig,
      models: [
        {
          id: "qwen3b",
          label: "Fixture model",
          modes: ["continuous"],
          composer: explicitConfig.composer,
          participants: explicitConfig.live.participants,
        },
      ],
    });
    expect((await post(f.url, "start", selected)).status).toBe(200);
    const path = f.snapshot().path;
    if (!path) throw new Error("Missing journal");
    const state = (await readLiveRun(path)).state;
    expect(state.config.live.maxDurationMs).toBe(
      explicitConfig.live.maxDurationMs,
    );
    expect(state.config.live.refreshIntervalMs).toBe(
      config.live.refreshIntervalMs,
    );
    expect(state.config.live.maxContextCharacters).toBe(
      config.live.maxContextCharacters,
    );
    expect(state.config.composer).toEqual(explicitConfig.composer);
    expect(state.config.live.participants).toEqual(
      explicitConfig.live.participants,
    );
    expect((await post(f.url, "start")).status).toBe(200);
    expect(f.prepare).toHaveBeenCalledTimes(1);
    expect((await post(f.url, "new")).status).toBe(200);
    expect((await readLiveRun(path)).state.status).toBe("paused");
  });

  it("allows an explicit initial ready journal while keeping unused journals out of the browser list", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workspace-initial-"));
    directories.push(directory);
    const path = join(directory, "ready.jsonl");
    const log = await LiveLog.create(path, {
      type: "live.created",
      scenario,
      config,
    });
    await log.close();
    const f = await fixture({ runsDirectory: directory, initialRun: path });
    expect(f.snapshot().state?.status).toBe("ready");
    expect(f.snapshot().workspace.settings.mode).toBe("continuous");
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
  });

  it("finishes a recovered fixed session offline after its final saved generation", async () => {
    const prepare = vi.fn(async () => {
      throw new Error("Unavailable model credentials");
    });
    const f = await fixture({ prepare });
    const frozen = { ...score, chunkPercent: 100 };
    const savedConfig: LiveConfig = {
      ...config,
      composer: { ...model, provider: "openai" },
      live: { ...config.live, mode: "fixed", score: frozen },
    };
    const path = join(f.directory, "complete.jsonl");
    const saved = await LiveLog.create(path, {
      type: "live.created",
      scenario,
      config: savedConfig,
    });
    await saved.append({ type: "session.started" });
    await saved.append({ type: "source.revealed", step: 0 });
    const attemptId = randomUUID();
    await saved.append({
      type: "generation.started",
      actorId: "collective",
      attemptId,
      contextVersion: 0,
      sourceOffsets: Object.fromEntries(
        frozen.voices.map((voice) => [voice.id, voice.text.length]),
      ),
      messages: [{ role: "user", content: "Private prompt" }],
    });
    await saved.append({
      type: "text.appended",
      actorId: "collective",
      attemptId,
      offset: 0,
      text: "We have a final saved thought.",
    });
    await saved.append({
      type: "generation.finished",
      actorId: "collective",
      attemptId,
      reason: "eos",
    });
    await saved.close();
    await post(f.url, "new");
    expect((await post(f.url, "open", { id: "complete.jsonl" })).status).toBe(
      200,
    );
    expect(f.snapshot().state?.status).toBe("paused");
    expect(f.snapshot().state?.scheduler.phase).toBe("complete");
    vi.stubEnv("OPENAI_API_KEY", "");
    try {
      expect((await post(f.url, "start")).status).toBe(200);
      await vi.waitFor(() => expect(f.snapshot().state?.status).toBe("ended"));
    } finally {
      vi.unstubAllEnvs();
    }
    expect(f.snapshot().state?.publishedOffset).toBe(
      "We have a final saved thought.".length,
    );
    expect(f.generate).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    const savedEvents = (await readLiveRun(path)).events;
    expect(savedEvents.at(-1)?.event.type).toBe("session.ended");
    expect(
      savedEvents.filter(
        (record) => record.event.type === "collective.published",
      ),
    ).toHaveLength(1);
  });

  it("ends an exhausted non-fixed session without preparing a model", async () => {
    const prepare = vi.fn(async () => {
      throw new Error("Unavailable model credentials");
    });
    const f = await fixture({ prepare });
    const path = join(f.directory, "exhausted.jsonl");
    const saved = await LiveLog.create(path, {
      type: "live.created",
      scenario,
      config: { ...config, composer: { ...model, provider: "openai" } },
    });
    await saved.append({ type: "session.started" });
    await saved.append({
      type: "session.paused",
      elapsedMs: config.live.maxDurationMs,
      reason: "Duration reached",
    });
    await saved.close();
    await post(f.url, "new");
    expect((await post(f.url, "open", { id: "exhausted.jsonl" })).status).toBe(
      200,
    );
    expect((await post(f.url, "start")).status).toBe(200);
    expect(f.snapshot().state?.status).toBe("ended");
    expect(prepare).not.toHaveBeenCalled();
    expect(f.generate).not.toHaveBeenCalled();
  });
  it("drains a pending preparation before closing", async () => {
    let release: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const preparing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const f = await fixture({
      prepare: async () => {
        entered?.();
        await gate;
      },
    });
    const starting = post(f.url, "start", selected);
    await preparing;
    let closed = false;
    const closing = f.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    release?.();
    await starting;
    await closing;
    const path = f.snapshot().path;
    expect(path).toBeUndefined();
    const journals = (await readdir(f.directory)).filter((name) =>
      name.endsWith(".jsonl"),
    );
    expect(journals).toHaveLength(1);
    expect(
      (await readLiveRun(join(f.directory, journals[0] ?? ""))).state.status,
    ).toBe("paused");
  });
});
