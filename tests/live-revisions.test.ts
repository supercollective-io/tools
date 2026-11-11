import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { buildLivePrompt, LiveController } from "../src/live.ts";
import { LiveLog, readLiveRun } from "../src/live-runs.ts";
import { type LiveConfig, liveConfigSchema } from "../src/live-schema.ts";
import type { Generate, PromptMessage } from "../src/models.ts";
import { admitPending } from "../src/participation-admission.ts";
import { ParticipationStore } from "../src/participation-store.ts";

function present<T>(value: T | undefined | null): T {
  if (value === undefined || value === null)
    throw new Error("Missing fixture value");
  return value;
}

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
const payload = (messages: PromptMessage[]) =>
  JSON.parse(messages.find((m) => m.role === "user")?.content ?? "{}");
async function fixture(
  generate?: Generate,
  settings: Partial<LiveConfig["live"]> = {},
) {
  const directory = await mkdtemp(join(tmpdir(), "live-revisions-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const config = liveConfigSchema.parse(
    JSON.parse(await readFile("examples/live-projection.json", "utf8")),
  );
  config.composer = {
    provider: "ollama",
    model: "double",
    maxOutputTokens: 256,
    timeoutMs: 2000,
  };
  config.live.participants = config.composer;
  config.live.mode = "typed";
  delete config.live.score;
  config.live.refreshIntervalMs = 100;
  config.live.maxDurationMs = 60000;
  config.live.maxContextCharacters = 1000000;
  Object.assign(config.live, settings);
  const path = join(directory, "live.jsonl");
  const log = await LiveLog.create(path, {
    type: "live.created",
    config,
    scenario: {
      schemaVersion: 1,
      title: "Revisions",
      openingInvitation: "What changes?",
      voices: [],
    },
  });
  cleanup.push(() => log.close());
  const calls: ReturnType<typeof payload>[] = [];
  const controller = new LiveController(
    log,
    generate ??
      (async ({ messages }, onToken) => {
        calls.push(payload(messages));
        await onToken("We continue with the available accounts. ");
        return {
          text: "We continue with the available accounts. ",
          finishReason: "stop",
        };
      }),
  );
  cleanup.push(() => controller.close());
  const store = new ParticipationStore(
    join(directory, "inputs.sqlite"),
    log.state.runId,
  );
  cleanup.push(async () => store.close());
  return { log, controller, calls, path, store };
}

it("supplies equal-length edits, shortening and deletion after natural completion", async () => {
  const f = await fixture();
  const a = randomUUID(),
    b = randomUUID();
  await f.controller.joinParticipant(a);
  await f.controller.joinParticipant(b);
  await f.controller.start();
  await f.controller.admitInputs([
    {
      id: "a1",
      participantId: a,
      text: "I want this local place to stay open.",
      replace: true,
    },
    {
      id: "b1",
      participantId: b,
      text: "We need time to discuss our different experiences.",
      replace: true,
    },
  ]);
  await vi.waitFor(() => expect(f.calls).toHaveLength(1));
  const changes = ["I need this local place to stay open.", "I disagree.", ""];
  for (const [index, text] of changes.entries()) {
    await f.controller.admitInput(`a${index + 2}`, a, text, true);
    await vi.waitFor(() => expect(f.calls).toHaveLength(index + 2));
    const source = f.calls
      .at(-1)
      .participants.find((p: { id: string }) => p.id === a);
    expect(source).toMatchObject({
      text,
      newFrom: 0,
      newText: text,
      sourceChange: "replacement",
    });
  }
  await f.controller.pause();
  const saved = await readLiveRun(f.path);
  const requests = saved.events.flatMap((r) =>
    r.event.type === "generation.started" ? [r.event] : [],
  );
  expect(requests.map((r) => r.sourceRevisions?.[a])).toEqual([1, 2, 3, 4]);
  expect(saved.state.composer.seenRevisions[a]).toBe(4);
  expect(saved.state.composer.seenTexts[a]).toBe("");
});

it("refreshes an active request for a replacement, without relying on increased length", async () => {
  let activeSignal: AbortSignal | undefined;
  const f = await fixture(async ({ signal }, onToken) => {
    activeSignal = signal;
    await onToken("We are developing this thought");
    await new Promise<void>((_, reject) => {
      signal.throwIfAborted();
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
    return { text: "", finishReason: "stop" };
  });
  const id = randomUUID();
  await f.controller.joinParticipant(id);
  await f.controller.start();
  await f.controller.admitInput(
    "first",
    id,
    "I want this local place to stay open.",
    true,
  );
  await vi.waitFor(() => expect(activeSignal).toBeDefined());
  const original = activeSignal;
  await f.controller.admitInput(
    "edit",
    id,
    "I need this local place to stay open.",
    true,
  );
  await vi.waitFor(() => expect(original?.aborted).toBe(true));
});

it("prepares requests only after a complete 100-person snapshot and leaves newer revisions pending", async () => {
  const f = await fixture();
  const people = Array.from({ length: 100 }, () => f.store.join());
  for (const p of people) {
    await f.controller.joinParticipant(p.id);
    f.store.revise(p.id, 1, "Our account contains enough words to begin.");
  }
  await f.controller.start();
  const original = f.log.append.bind(f.log);
  let revised = false;
  const spy = vi.spyOn(f.log, "append").mockImplementation(async (event) => {
    await original(event);
    if (event.type === "input.revised" && !revised) {
      revised = true;
      f.store.revise(
        present(people[0]).id,
        2,
        "A newer account arrives during admission.",
      );
    }
  });
  await admitPending(f.store, f.controller);
  spy.mockRestore();
  expect(f.log.state.participants.every((p) => p.sourceRevision === 1)).toBe(
    true,
  );
  expect(f.store.batch()).toMatchObject([
    { participant: present(people[0]).id, revision: 2 },
  ]);
  await vi.waitFor(() => expect(f.calls.length).toBeGreaterThan(0));
  expect(f.calls[0].participants).toHaveLength(100);
  expect(
    f.calls[0].participants.every(
      (p: { text: string }) =>
        p.text === "Our account contains enough words to begin.",
    ),
  ).toBe(true);
  await admitPending(f.store, f.controller);
  expect(f.store.batch()).toEqual([]);
}, 20000);

it("reconstructs revision tracking from older requests without revision metadata", async () => {
  const f = await fixture();
  const id = randomUUID();
  await f.controller.joinParticipant(id);
  await f.log.append({ type: "session.started" });
  await f.log.append({
    type: "input.revised",
    id: "old1",
    participantId: id,
    text: "old text",
  });
  await f.log.append({
    type: "generation.started",
    actorId: "collective",
    attemptId: randomUUID(),
    contextVersion: 0,
    sourceOffsets: { [id]: 8 },
    messages: [{ role: "user", content: "Legacy request" }],
  });
  await f.log.append({
    type: "session.recovered",
    elapsedMs:
      Date.parse(f.log.state.updatedAt) -
      Date.parse(present(f.log.state.sessionStartedAt)),
  });
  const state = (await readLiveRun(f.path)).state;
  expect(state.composer.seenRevisions[id]).toBe(1);
  expect(state.composer.seenTexts[id]).toBe("old text");
  expect(
    payload(buildLivePrompt(state, "collective")).participants[0].sourceChange,
  ).toBeUndefined();
});

it.each(["natural-ordinary", "natural-short"] as const)(
  "%s waits for a natural boundary, then supplies revisions without spinning",
  async (continuationPolicy) => {
    const requests: { signal: AbortSignal; messages: PromptMessage[] }[] = [];
    let finish!: () => void;
    const boundary = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const f = await fixture(
      async ({ signal, messages }, onToken) => {
        requests.push({ signal, messages });
        await onToken("We keep developing a shared thought. ");
        if (requests.length === 1) await boundary;
        return {
          text: "We keep developing a shared thought. ",
          finishReason: "stop",
        };
      },
      { continuationPolicy },
    );
    const id = randomUUID();
    await f.controller.joinParticipant(id);
    await f.controller.start();
    await f.controller.admitInput(
      "first",
      id,
      "I want this local place to stay open.",
      true,
    );
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    try {
      await f.controller.admitInput(
        "edit",
        id,
        "I need this local place to stay open.",
        true,
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(requests).toHaveLength(1);
      expect(requests[0]?.signal.aborted).toBe(false);
      const instruction = requests[0]?.messages[0]?.content ?? "";
      expect(instruction).toContain(
        continuationPolicy === "natural-short" ? "20–35" : "80–120",
      );
      expect(instruction).not.toContain("leaving a sentence open");
      expect(instruction).not.toContain(
        "no participant rounds or assigned short responses",
      );
    } finally {
      finish();
    }
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(payload(present(requests[1]).messages).participants[0].text).toBe(
      "I need this local place to stay open.",
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(requests).toHaveLength(2);
    await f.controller.pause();
    const reasons = (await readLiveRun(f.path)).events.flatMap((r) =>
      r.event.type === "generation.finished" ? [r.event.reason] : [],
    );
    expect(reasons).toEqual(["eos", "eos"]);
  },
);

it("replays a snapshot after acknowledgement failure without duplicating journal admissions", async () => {
  const f = await fixture();
  const people = Array.from({ length: 3 }, () => f.store.join());
  for (const p of people) {
    await f.controller.joinParticipant(p.id);
    f.store.revise(p.id, 1, "Our account contains enough words to begin.");
  }
  await f.controller.start();
  const acknowledge = f.store.admitted.bind(f.store);
  let count = 0;
  const spy = vi.spyOn(f.store, "admitted").mockImplementation((...args) => {
    if (++count === 2) throw new Error("Acknowledgement unavailable");
    acknowledge(...args);
  });
  await expect(admitPending(f.store, f.controller)).rejects.toThrow(
    "Acknowledgement unavailable",
  );
  spy.mockRestore();
  expect(f.store.batch()).toHaveLength(2);
  await admitPending(f.store, f.controller);
  expect(f.store.batch()).toHaveLength(0);
  await f.controller.pause();
  const run = await readLiveRun(f.path);
  expect(
    run.events.filter((r) => r.event.type === "input.revised"),
  ).toHaveLength(3);
  expect(f.log.state).toEqual(run.state);
});

it("finishes a captured snapshot before completing Pause", async () => {
  const f = await fixture();
  const people = Array.from({ length: 3 }, () => f.store.join());
  for (const p of people) {
    await f.controller.joinParticipant(p.id);
    f.store.revise(p.id, 1, "Our account contains enough words to begin.");
  }
  await f.controller.start();
  const append = f.log.append.bind(f.log);
  let paused: Promise<void> | undefined;
  const spy = vi.spyOn(f.log, "append").mockImplementation(async (event) => {
    await append(event);
    if (event.type === "input.revised" && !paused)
      paused = f.controller.pause();
  });
  await admitPending(f.store, f.controller);
  await paused;
  spy.mockRestore();
  expect(f.store.batch()).toEqual([]);
  expect(f.log.state.status).toBe("paused");
  expect(f.log.state.participants.every((p) => p.sourceRevision === 1)).toBe(
    true,
  );
  expect(f.calls).toEqual([]);
});
