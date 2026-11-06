import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { buildLivePrompt } from "../src/live.ts";
import { LiveLog } from "../src/live-runs.ts";
import { liveConfigSchema } from "../src/live-schema.ts";
import { projectionState } from "../src/live-server.ts";

it("projects only the published collective prefix and lifecycle", () => {
  expect(projectionState({ state: null })).toBeNull();
  expect(
    projectionState({
      path: "PRIVATE",
      state: {
        runId: "one",
        status: "paused",
        composer: { text: "Visible UNPUBLISHED" },
        publishedOffset: 7,
        participants: ["PRIVATE"],
        config: { instructions: "PRIVATE" },
      },
    }),
  ).toEqual({ runId: "one", status: "paused", text: "Visible" });
});

it("restores reveal per session and never reveals an unfinished word early", async () => {
  const source = await readFile("src/web/projection-state.js", "utf8");
  const api = runInNewContext(
    source.replaceAll("export function", "function") +
      "\n({nextWord,restoreOffset,saveOffset})",
  );
  const storage = new Map();
  const store = {
    getItem: (key: string) => storage.get(key),
    setItem: (key: string, value: string) => storage.set(key, value),
  };
  const text = "We 😀 can change";
  let offset = api.nextWord(text, 0, false);
  expect(offset).toBe(3);
  offset = api.nextWord(text, offset, false);
  expect(text.slice(0, offset)).toBe("We 😀 ");
  api.saveOffset(store, "a", text, offset);
  expect(api.restoreOffset(store, "a", `${text} together`)).toBe(offset);
  expect(api.restoreOffset(store, "b", text)).toBe(0);
  expect(api.restoreOffset(store, "a", "Changed text")).toBe(0);
  offset = api.nextWord(text, offset, false);
  expect(api.nextWord(text, offset, false)).toBe(offset);
  expect(api.nextWord(text, offset, true)).toBe(text.length);
});

it("uses the live G preset without the legacy artistic wrapper and preserves continuation", async () => {
  const config = liveConfigSchema.parse(
    JSON.parse(await readFile("examples/live-projection.json", "utf8")),
  );
  config.live.score = {
    schemaVersion: 2,
    title: "Fixture",
    chunkPercent: 20,
    voices: [{ id: "a", name: "A", text: "A source" }],
  };
  const directory = await mkdtemp(join(tmpdir(), "projection-prompt-"));
  const log = await LiveLog.create(join(directory, "run.jsonl"), {
    type: "live.created",
    config,
    scenario: {
      schemaVersion: 1,
      title: "Fixture",
      openingInvitation: "Change?",
      voices: [
        { id: "a", name: "A", perspective: "PRIVATE", background: "PRIVATE" },
      ],
    },
  });
  try {
    const prompt = buildLivePrompt(log.state, "collective");
    expect(prompt[0]?.content).toContain(
      "Let qualifications change what we say",
    );
    expect(prompt[0]?.content).not.toContain("Avoid repeatedly explaining");
    expect(prompt[0]?.content).not.toContain("140–160");
    expect(prompt[0]?.content).toContain("Begin your own contribution now");
    expect(JSON.stringify(prompt)).not.toContain("PRIVATE");
    log.state.config.live.composerStyle = undefined;
    expect(buildLivePrompt(log.state, "collective")[0]?.content).toContain(
      "Avoid repeatedly explaining",
    );
  } finally {
    await log.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it("paces published words, freezes on pause or disconnect, and resumes without a catch-up burst", async () => {
  const helper = (
    await readFile("src/web/projection-state.js", "utf8")
  ).replaceAll("export function", "function");
  const client = (await readFile("src/web/projection.js", "utf8")).replace(
    /^import[\s\S]*?from "\/projection-state.js";/u,
    "",
  );
  let tick = () => {};
  let now = 0;
  const listeners = new Map<string, (event: { data: string }) => void>();
  const pane = { textContent: "", scrollTop: 0, scrollHeight: 100 };
  const store = new Map<string, string>();
  runInNewContext(`${helper}\n${client}`, {
    document: {
      hidden: false,
      getElementById: (id: string) =>
        id === "text" ? pane : { addEventListener: () => {} },
      documentElement: {},
    },
    localStorage: {
      getItem: (key: string) => store.get(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
    window: { addEventListener: () => {} },
    performance: { now: () => now },
    setInterval: (fn: () => void) => {
      tick = fn;
    },
    EventSource: class {
      addEventListener(name: string, fn: (event: { data: string }) => void) {
        listeners.set(name, fn);
      }
    },
  });
  const receive = (status: string) =>
    listeners.get("state")?.({
      data: JSON.stringify({
        runId: "one",
        status,
        text: "First second third fourth",
      }),
    });
  const advance = (ms: number) => {
    for (let n = 0; n < ms; n += 50) {
      now += 50;
      tick();
    }
  };
  receive("running");
  advance(450);
  expect(pane.textContent).toBe("First ");
  receive("paused");
  advance(2000);
  expect(pane.textContent).toBe("First ");
  receive("running");
  advance(450);
  expect(pane.textContent).toBe("First second ");
  listeners.get("error")?.({ data: "" });
  advance(3000);
  expect(pane.textContent).toBe("First second ");
  receive("ended");
  advance(450);
  expect(pane.textContent).toBe("First second third ");
  advance(450);
  expect(pane.textContent).toBe("First second third fourth");
});
