import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { request, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LiveController } from "../src/live.ts";
import { LiveLog, readLiveRun } from "../src/live-runs.ts";
import type { LiveConfig } from "../src/live-schema.ts";
import { publicLiveState, startLiveServer } from "../src/live-server.ts";

const config: LiveConfig = {
  schemaVersion: 2,
  composer: {
    provider: "ollama",
    model: "composer-fixture",
    baseUrl: "http://private-model.invalid",
    maxOutputTokens: 100,
    timeoutMs: 3000,
  },
  instructions: "PRIVATE_COMPOSER_INSTRUCTIONS",
  history: { maxPassages: 1, maxCharacters: 1000 },
  live: {
    participants: {
      provider: "ollama",
      model: "participant-fixture",
      maxOutputTokens: 100,
      timeoutMs: 3000,
    },
    instructions: "PRIVATE_PARTICIPANT_INSTRUCTIONS",
    maxDurationMs: 1000,
    feedbackIntervalMs: 100,
    refreshIntervalMs: 100,
    maxContextCharacters: 1000,
  },
};
const directories: string[] = [];
const running: Awaited<ReturnType<typeof startLiveServer>>[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => server.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "live-server-"));
  directories.push(directory);
  const log = await LiveLog.create(join(directory, "run.jsonl"), {
    type: "live.created",
    config,
    scenario: {
      schemaVersion: 1,
      title: "Local rehearsal",
      openingInvitation: "What happens next?",
      voices: [
        {
          id: "alice",
          name: "Alice",
          perspective: "PRIVATE_PERSPECTIVE",
          background: "PRIVATE_BACKGROUND",
        },
      ],
    },
  });
  const listeners = new Set<() => void>();
  const calls: string[] = [];
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const fake = {
    snapshot: () => ({
      running: log.state.status === "running",
      now: Date.now(),
      error: null,
      actors: {},
      elapsedMs: log.state.elapsedMs,
    }),
    onChange: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: async () => {
      calls.push("start");
      if (log.state.status !== "running")
        await log.append({ type: "session.started" });
      notify();
    },
    pause: async () => {
      calls.push("pause");
      if (log.state.status === "running")
        await log.append({
          type: "session.paused",
          elapsedMs: 1,
          reason: "user",
        });
      notify();
    },
    end: async () => {
      calls.push("end");
      await log.append({ type: "session.ended", elapsedMs: 1 });
      notify();
    },
    close: async () => {
      if (log.state.status === "running") await fake.pause();
    },
  };
  const controller = fake as unknown as LiveController;
  const server = await startLiveServer({ log, controller, port: 0 });
  running.push(server);
  return { ...server, log, fake, calls, notify };
}
const post = (url: string, path: string) =>
  fetch(`${url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

function rawRequest(url: string, host: string) {
  return new Promise<number | undefined>((resolve, reject) => {
    const req = request(
      `${url}/api/state`,
      { headers: { Host: host } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("local live server", () => {
  it("serves assets and redacted snapshots without starting generation", async () => {
    const f = await fixture();
    const response = await fetch(`${f.url}/api/state`);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain("Alice");
    for (const secret of ["PRIVATE_", "private-model.invalid", "baseUrl"])
      expect(text).not.toContain(secret);
    expect(f.calls).toEqual([]);
    const index = await fetch(f.url);
    expect(index.status).toBe(200);
    expect(index.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(await index.text()).toContain("app.js");
    const script = await fetch(`${f.url}/app.js`);
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toContain("javascript");
    expect((await fetch(`${f.url}/style.css`)).status).toBe(200);
    expect((await fetch(`${f.url}/../live-runs.ts`)).status).toBe(404);
  });

  it("serialises controls, pauses, resumes and ends the same frozen run", async () => {
    const f = await fixture();
    let releaseStart: (() => void) | undefined;
    let enterStart: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      enterStart = resolve;
    });
    const originalStart = f.fake.start;
    f.fake.start = async () => {
      enterStart?.();
      await gate;
      await originalStart();
    };
    const starting = post(f.url, "/api/start");
    await entered;
    const pausing = post(f.url, "/api/pause");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const callsBeforeRelease = [...f.calls];
    releaseStart?.();
    const results = await Promise.all([starting, pausing]);
    expect(results.map((response) => response.status)).toEqual([200, 200]);
    expect(callsBeforeRelease).toEqual([]);
    expect(f.log.state.status).toBe("paused");
    expect((await post(f.url, "/api/start")).status).toBe(200);
    expect((await post(f.url, "/api/end")).status).toBe(200);
    expect(f.log.state.status).toBe("ended");
    expect(f.calls).toEqual(["start", "pause", "start", "end"]);
    const saved = await readLiveRun(f.log.path);
    expect(saved.state.status).toBe("ended");
    expect(
      saved.events.filter((record) => record.event.type === "live.created"),
    ).toHaveLength(1);
  });

  it("rejects foreign origins, forged hosts, form requests and malformed controls", async () => {
    const f = await fixture();
    expect(await rawRequest(f.url, "attacker.invalid")).toBe(403);
    for (const [headers, body, status] of [
      [
        {
          "Content-Type": "application/json",
          Origin: "https://attacker.invalid",
        },
        "{}",
        403,
      ],
      [{ "Content-Type": "text/plain" }, "{}", 415],
      [
        { "Content-Type": "application/x-www-form-urlencoded" },
        "start=true",
        415,
      ],
      [{ "Content-Type": "application/json" }, "{", 400],
      [{ "Content-Type": "application/json" }, '{"path":"elsewhere"}', 400],
      [{ "Content-Type": "application/json" }, "[]", 400],
    ] as const) {
      const response = await fetch(`${f.url}/api/start`, {
        method: "POST",
        headers,
        body,
      });
      expect(response.status).toBe(status);
    }
    expect(f.calls).toEqual([]);
    const response = await fetch(`${f.url}/api/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: f.url },
      body: "{}",
    });
    expect(response.status).toBe(200);
  });

  it("drops a slow event subscriber at the queue cap and permits a fresh snapshot", async () => {
    const f = await fixture();
    let slowResponse: ServerResponse | undefined;
    f.server.once("request", (_request, response) => {
      slowResponse = response;
    });
    const stream = await fetch(`${f.url}/api/events`);
    const reader = stream.body?.getReader();
    if (!reader) throw new Error("Missing event stream");
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      '"status":"ready"',
    );
    if (!slowResponse) throw new Error("Missing subscriber response");
    // Inject backpressure deterministically; operating-system socket buffers
    // otherwise make a slow-reader test depend on machine and network timing.
    Object.defineProperty(slowResponse, "writableLength", {
      get: () => 1024 * 1024 + 1,
    });
    const dropped = expect(reader.read()).rejects.toThrow();
    f.notify();
    await dropped;
    expect(slowResponse.destroyed).toBe(true);
    expect((await fetch(`${f.url}/api/state`)).status).toBe(200);
    const cancellation = new AbortController();
    const reconnect = await fetch(`${f.url}/api/events`, {
      signal: cancellation.signal,
    });
    const reconnectReader = reconnect.body?.getReader();
    if (!reconnectReader) throw new Error("Missing reconnected stream");
    expect(
      new TextDecoder().decode((await reconnectReader.read()).value),
    ).toContain('"status":"ready"');
    cancellation.abort();
    await reconnectReader.cancel().catch(() => {});
    expect(f.calls).toEqual([]);
  });

  it("streams saved additions and reconnects without extra model calls", async () => {
    const f = await fixture();
    const cancellation = new AbortController();
    const response = await fetch(`${f.url}/api/events`, {
      signal: cancellation.signal,
    });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing event stream");
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain("event: state");
    expect(first).toContain('"status":"ready"');
    await post(f.url, "/api/start");
    const attemptId = randomUUID();
    await f.log.append({
      type: "generation.started",
      actorId: "participant/alice",
      attemptId,
      contextVersion: 0,
      sourceOffsets: {},
      messages: [{ role: "user", content: "Private prompt" }],
    });
    await f.log.append({
      type: "text.appended",
      actorId: "participant/alice",
      attemptId,
      offset: 0,
      text: "A thought 🙂",
    });
    await f.log.append({
      type: "generation.finished",
      actorId: "participant/alice",
      attemptId,
      reason: "eos",
    });
    f.notify();
    let received = "";
    while (!received.includes("A thought 🙂"))
      received += new TextDecoder().decode((await reader.read()).value);
    expect(received).not.toContain("Private prompt");
    cancellation.abort();
    await reader.cancel().catch(() => {});
    const secondCancellation = new AbortController();
    const reconnect = await fetch(`${f.url}/api/events`, {
      signal: secondCancellation.signal,
    });
    const secondReader = reconnect.body?.getReader();
    if (!secondReader) throw new Error("Missing reconnected event stream");
    expect(
      new TextDecoder().decode((await secondReader.read()).value),
    ).toContain("A thought 🙂");
    secondCancellation.abort();
    await secondReader.cancel().catch(() => {});
    expect(f.calls).toEqual(["start"]);
    await f.close();
    expect((await readLiveRun(f.log.path)).state.status).toBe("paused");
  });
});

it("serves a separate audience page and a minimal reconnect snapshot", async () => {
  const f = await fixture();
  const page = await fetch(`${f.url}/projection`);
  expect(page.status).toBe(200);
  expect(await page.text()).toContain("/projection.js");
  const state = await (await fetch(`${f.url}/api/projection/state`)).json();
  expect(Object.keys(state).sort()).toEqual(["runId", "status", "text"]);
  expect(state.text).toBe("");
  const cancellation = new AbortController();
  const stream = await fetch(`${f.url}/api/projection/events`, {
    signal: cancellation.signal,
  });
  const reader = stream.body?.getReader();
  if (!reader) throw new Error("Missing projection stream");
  const initial = new TextDecoder().decode((await reader.read()).value);
  expect(initial).toContain(state.runId);
  expect(initial).not.toContain("PRIVATE");
  expect(initial).not.toContain("participants");
  cancellation.abort();
  await reader.cancel().catch(() => {});
  await f.close();
});

it("keeps historical tracking arrays and prior source copies out of operator snapshots", async () => {
  const f = await fixture();
  const state = f.log.state;
  state.attemptIds = [randomUUID()];
  state.admittedIds = ["historical admission"];
  state.composer.seenTexts = { alice: "Prior source copy" };
  const publicState = publicLiveState(state);
  expect(publicState).not.toHaveProperty("attemptIds");
  expect(publicState).not.toHaveProperty("admittedIds");
  expect(publicState.composer).not.toHaveProperty("seenTexts");
});
