import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  inspectRehearsal,
  parseSrt,
  prepareRehearsal,
  runRehearsal,
} from "../src/prompt-rehearsal.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "prompt-rehearsal-"));
  directories.push(dir);
  const config = JSON.parse(
    await readFile("examples/live-projection.json", "utf8"),
  );
  config.composer = {
    provider: "ollama",
    model: "fixture",
    maxOutputTokens: 100,
    timeoutMs: 1000,
  };
  config.live.refreshIntervalMs = 100;
  config.live.feedbackIntervalMs = 100;
  await writeFile(join(dir, "config.json"), JSON.stringify(config));
  const source = {
    schemaVersion: 1,
    title: "Fixture",
    invitation: "What could change?",
    hypothesis: "Later input develops the thought",
    config: "config.json",
    tailMs: 2500,
    tracks: [
      {
        id: "a",
        timingNote: "Fictional timing",
        cues: [
          { endMs: 0, text: "First" },
          { endMs: 50, text: "we need room to think" },
        ],
      },
      {
        id: "b",
        timingNote: "Fictional timing",
        cues: [{ endMs: 0, text: "Other" }],
      },
    ],
  };
  const path = join(dir, "plan.json");
  await writeFile(path, JSON.stringify(source));
  return { dir, path, source };
}
it("parses cue endpoints and rejects malformed or reversed timestamps", () => {
  expect(
    parseSrt("1\r\n00:00:00,000 --> 00:00:01,250\r\nSome\r\nwords"),
  ).toEqual([{ endMs: 1250, text: "Some words" }]);
  expect(() => parseSrt("1\n00:00:02,000 --> 00:00:01,000\nWords")).toThrow();
  expect(() => parseSrt("garbage")).toThrow();
});
it("freezes simultaneous defaults, source text and explicit staggered offsets", async () => {
  const { path, source } = await fixture();
  const plan = await prepareRehearsal(path);
  expect(plan.arrangement).toBe("simultaneous");
  expect(plan.timeline.map((e) => e.atMs)).toEqual([0, 0, 50]);
  expect(plan.timeline.at(-1)?.text).toBe("First we need room to think");
  await writeFile(
    path,
    JSON.stringify({
      ...source,
      tracks: source.tracks.map((t, i) => ({ ...t, startMs: i * 100 })),
    }),
  );
  const staggered = await prepareRehearsal(path);
  expect(staggered.arrangement).toBe("staggered");
  expect(staggered.inputFingerprint).not.toBe(plan.inputFingerprint);
  await writeFile(
    path,
    JSON.stringify({ ...source, tracks: [source.tracks[0], source.tracks[0]] }),
  );
  await expect(prepareRehearsal(path)).rejects.toThrow("Duplicate");
});
it("uses coalesced phone revisions and records exact requests and saved output", async () => {
  const { dir, path } = await fixture();
  const plan = await prepareRehearsal(path);
  const out = join(dir, "run");
  const report = await runRehearsal(plan, out, async (_, token) => {
    await token("We can develop this. ");
    return { text: "We can develop this. ", finishReason: "stop" };
  });
  expect(report.status).toBe("ended");
  expect(report.completion.allInputsAdmitted).toBe(true);
  expect(report.admissions.map((a) => a.text)).toEqual([
    "First we need room to think",
    "Other",
  ]);
  expect(report.steps.length).toBeGreaterThan(0);
  expect(report.steps[0]?.collectiveBefore).toBe("");
  expect(JSON.stringify(report.steps[0]?.messages)).toContain(
    "First we need room to think",
  );
  expect(report.finalText).toContain("We can develop this.");
  expect(await inspectRehearsal(out)).toEqual(report);
  await expect(runRehearsal(plan, out)).rejects.toThrow();
});
it("interrupts safely, preserving pending input rather than reporting completion", async () => {
  const { dir, path } = await fixture();
  const abort = new AbortController();
  abort.abort();
  const report = await runRehearsal(
    await prepareRehearsal(path),
    join(dir, "stopped"),
    async () => {
      throw new Error("Must not call a model");
    },
    abort.signal,
  );
  expect(report.status).toBe("paused");
  expect(report.completion.allInputsAdmitted).toBe(false);
  expect(report.steps).toEqual([]);
});
it("retains failed provider attempts without saving raw errors", async () => {
  const { dir, path } = await fixture();
  const out = join(dir, "failed");
  const report = await runRehearsal(
    await prepareRehearsal(path),
    out,
    async () => {
      throw new Error("secret-provider-error");
    },
  );
  expect(report.status).toBe("paused");
  expect(report.completion.failedAttempts).toHaveLength(1);
  expect(await readFile(join(out, "live.jsonl"), "utf8")).not.toContain(
    "secret-provider-error",
  );
});
