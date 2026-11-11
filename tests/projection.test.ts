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

it("uses the live preset without the legacy artistic wrapper and preserves continuation", async () => {
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
    expect(prompt[0]?.content).toContain(config.instructions);
    expect(prompt[0]?.content).not.toContain("Avoid repeatedly explaining");
    expect(prompt[0]?.content).not.toContain("140–160");
    expect(prompt[0]?.content).toContain("Begin your own contribution now");
    expect(JSON.stringify(prompt)).not.toContain("PRIVATE");
    const legacyState = log.state;
    legacyState.config.live.composerStyle = undefined;
    expect(buildLivePrompt(legacyState, "collective")[0]?.content).toContain(
      "Avoid repeatedly explaining",
    );
  } finally {
    await log.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it("renders every published snapshot immediately, including reconnects, pause and final partial words", async () => {
  const listeners = new Map<string, (event: { data: string }) => void>();
  const pane = { textContent: "", scrollTop: 0, scrollHeight: 100 };
  runInNewContext(await readFile("src/web/projection.js", "utf8"), {
    document: {
      getElementById: (id: string) =>
        id === "text" ? pane : { addEventListener: () => {} },
      documentElement: {},
    },
    EventSource: class {
      addEventListener(name: string, fn: (event: { data: string }) => void) {
        listeners.set(name, fn);
      }
    },
  });
  const receive = (text: string, status = "running", runId = "one") =>
    listeners.get("state")?.({ data: JSON.stringify({ runId, status, text }) });
  receive("First unfinished wor");
  expect(pane.textContent).toBe("First unfinished wor");
  receive("First unfinished word", "paused");
  expect(pane.textContent).toBe("First unfinished word");
  listeners.get("state")?.({ data: "malformed" });
  expect(pane.textContent).toBe("First unfinished word");
  receive("All current writing after reconnect");
  expect(pane.textContent).toBe("All current writing after reconnect");
  receive("Final text", "ended");
  expect(pane.textContent).toBe("Final text");
  receive("New session", "running", "two");
  expect(pane.textContent).toBe("New session");
  expect(pane.scrollTop).toBe(pane.scrollHeight);
  listeners.get("state")?.({ data: "null" });
  expect(pane.textContent).toBe("");
});
