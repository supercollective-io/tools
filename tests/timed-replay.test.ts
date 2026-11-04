import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLiveRun } from "../src/live-runs.ts";
import type { Generate } from "../src/models.ts";
import { runTimedReplay } from "../src/timed-replay.ts";

let directory: string | undefined;
let previousApiKey: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
  if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousApiKey;
  previousApiKey = undefined;
});

function enableMockedOpenAIEnvironment() {
  previousApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-key";
}

const config = {
  schemaVersion: 1 as const,
  composer: {
    provider: "openai" as const,
    model: "gpt-6.1-terra",
    reasoningEffort: "none" as const,
    maxOutputTokens: 4_096,
    timeoutMs: 120_000,
  },
  instructions: "Write in plain spoken English.",
  history: { maxPassages: 6, maxCharacters: 12_000 },
};

function makeFixture() {
  return {
    schemaVersion: 1 as const,
    title: "Timed test",
    invitation: "What makes a place feel welcoming?",
    durationMs: 1_600,
    voices: [
      { id: "ari", name: "Ari" },
      { id: "bea", name: "Bea" },
    ],
    events: [
      {
        id: "a1",
        atMs: 0,
        participantId: "ari",
        text: "The quiet corner feels lonely ",
      },
      {
        id: "b1",
        atMs: 0,
        participantId: "bea",
        text: "I like being unknown. ",
      },
      {
        id: "a2",
        atMs: 400,
        participantId: "ari",
        text: "until the driver waits for me.",
      },
      {
        id: "b2",
        atMs: 400,
        participantId: "bea",
        text: "LATE_PRIVATE_SOURCE_MARKER",
      },
    ],
  };
}

describe("timed composer replay", () => {
  it("keeps arrivals ordered, excludes future material, and saves exact participant prefixes", async () => {
    directory = await mkdtemp(join(tmpdir(), "timed-replay-"));
    enableMockedOpenAIEnvironment();
    const composerInputs: string[] = [];
    const composerConfigs: unknown[] = [];
    const double: Generate = async (request, onToken) => {
      composerConfigs.push(request.config);
      composerInputs.push(
        request.messages.map(({ content }) => content).join("\n"),
      );
      const text = "We can be noticed without being watched. ";
      await onToken(text);
      return {
        text,
        usage: { inputTokens: 80, outputTokens: 9, totalTokens: 89 },
      };
    };
    const result = await runTimedReplay({
      outputDir: join(directory, "run"),
      fixture: makeFixture(),
      config,
      generate: double,
      durationMs: 1_600,
      refreshIntervalMs: 100,
      feedbackIntervalMs: 100,
      ledgerPath: join(directory, "usage.jsonl"),
    });
    const saved = await readLiveRun(result.journalPath);
    expect(saved.state.status).toBe("ended");
    expect(saved.state.participants.map(({ text }) => text)).toEqual([
      "The quiet corner feels lonely until the driver waits for me.",
      "I like being unknown. LATE_PRIVATE_SOURCE_MARKER",
    ]);
    expect(
      saved.events.some(
        ({ event }) =>
          event.type === "generation.finished" &&
          event.actorId === "participant/ari" &&
          event.reason === "refresh",
      ),
    ).toBe(true);
    const ariRequests = saved.events.flatMap(({ event }) =>
      event.type === "generation.started" && event.actorId === "participant/ari"
        ? [event]
        : [],
    );
    expect(ariRequests.length).toBeGreaterThan(1);
    expect(
      ariRequests.some((request) =>
        request.messages.some(
          (message) =>
            message.role === "assistant" &&
            message.content === "The quiet corner feels lonely ",
        ),
      ),
    ).toBe(true);
    expect(composerInputs.length).toBeGreaterThan(0);
    expect(composerConfigs[0]).toMatchObject({
      model: "gpt-6.1-terra",
      reasoningEffort: "none",
      maxOutputTokens: 4_096,
      timeoutMs: 120_000,
    });
    expect(composerInputs[0]).not.toContain("until the driver waits for me.");
    expect(composerInputs[0]).not.toContain("LATE_PRIVATE_SOURCE_MARKER");
    expect(composerInputs.join("\n")).not.toContain(
      "Private starting context:",
    );
    const trace = (await readFile(result.tracePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const zeroArrivals = trace.filter(
      (item) => item.type === "source.arrived" && item.plannedAtMs === 0,
    );
    expect(zeroArrivals.map((item) => item.eventId)).toEqual(["a1", "b1"]);
    const lateArrival = trace.find(
      (item) => item.type === "source.arrived" && item.eventId === "a2",
    );
    expect(
      trace.some(
        (item) =>
          item.type === "composer.request" &&
          item.elapsedMs < lateArrival.observedAtMs &&
          JSON.stringify(item.messages).includes(
            "until the driver waits for me.",
          ),
      ),
    ).toBe(false);
    expect(result.requests).toBeLessThanOrEqual(6);
  });

  it("schedules the original score in five exact 20 per cent prefixes", async () => {
    const fixture = JSON.parse(
      await readFile("examples/composer-timed.json", "utf8"),
    ) as {
      durationMs: number;
      voices: { id: string; name: string }[];
      events: {
        atMs: number;
        participantId: string;
        text: string;
      }[];
    };
    const score = JSON.parse(await readFile("examples/score.json", "utf8")) as {
      voices: { id: string; name: string; text: string }[];
    };
    expect(fixture.durationMs).toBe(24_000);
    const selected = score.voices.filter(({ id }) =>
      ["chris", "rosa", "alex", "mo"].includes(id),
    );
    expect(fixture.voices).toEqual(
      selected.map(({ id, name }) => ({ id, name })),
    );
    expect(fixture.events).toHaveLength(20);
    for (const voice of selected) {
      const characters = Array.from(voice.text);
      for (let slice = 0; slice < 5; slice++) {
        const event = fixture.events.find(
          (item) =>
            item.participantId === voice.id && item.atMs === slice * 4_000,
        );
        expect(event?.text).toBe(
          characters
            .slice(
              Math.floor((characters.length * slice) / 5),
              Math.floor((characters.length * (slice + 1)) / 5),
            )
            .join(""),
        );
      }
    }
  });

  it("writes an inspectable audit after a composer failure without saving raw errors", async () => {
    directory = await mkdtemp(join(tmpdir(), "timed-replay-failure-"));
    enableMockedOpenAIEnvironment();
    const double: Generate = async () => {
      throw new Error("secret provider response body");
    };
    await expect(
      runTimedReplay({
        outputDir: join(directory, "run"),
        fixture: makeFixture(),
        config,
        generate: double,
        durationMs: 1_000,
        refreshIntervalMs: 100,
        feedbackIntervalMs: 100,
        ledgerPath: join(directory, "usage.jsonl"),
      }),
    ).rejects.toThrow(/generation failure|stopped after/u);
    const audit = await readFile(
      join(directory, "run", "composer-audit.json"),
      "utf8",
    );
    expect(audit).toContain('"status": "paused"');
    expect(audit).not.toContain("secret provider response body");
  });
});
