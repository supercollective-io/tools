import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runParticipationLoad } from "../src/participation-load.ts";
import { inspectLoadDurability } from "../src/participation-load-inspect.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

it("runs a short production HTTP load and saves private text-free metrics", async () => {
  const parent = await mkdtemp(join(tmpdir(), "participation-load-test-"));
  directories.push(parent);
  const out = join(parent, "runs", "smoke");
  const result = await runParticipationLoad({
    out,
    durationMs: 350,
    participants: 4,
    schedule: "burst",
  });

  expect(result.participantCount).toBe(4);
  expect(result.requests.acknowledged).toBeGreaterThanOrEqual(4);
  expect(result.state.allLatestRevisionsAdmitted).toBe(true);
  expect(result.state.acknowledgedStateLost).toBe(false);
  expect(result.state.duplicateAdmissionIds).toBe(0);
  expect(result.state.missingLatestAdmission).toBe(0);
  expect(result.generation.calls).toBeGreaterThan(0);
  expect(result.generation.streamedTokens).toBeGreaterThan(0);
  expect(result.thresholds.observedStreamingGeneration).toBe(true);
  expect(result.latency.finalDrainMs).toBeLessThanOrEqual(5_000);
  expect(result.latency.controllerPauseMs).toBeGreaterThanOrEqual(0);
  expect(result.latency.controllerEndMs).toBeGreaterThanOrEqual(0);
  expect(result.thresholds.controllerPauseAtMost5000Ms).toBe(true);
  expect(result.thresholds.controllerEndAtMost5000Ms).toBe(true);

  const durability = await inspectLoadDurability(out);
  // A tiny run can wait for first generation after its final admission. The
  // next-record upper bound includes that idle time; performance is assessed
  // by the standalone sustained trial, not a concurrent CI smoke test.
  expect(durability.thresholds.completeDurabilityBounds).toBe(true);
  expect(durability.thresholds.noLostAcknowledgedState).toBe(true);
  expect(durability.thresholds.noDuplicateAdmission).toBe(true);
  expect(durability.saveToDurableAdmissionUpperBound.count).toBe(4);
  expect(durability.participants).toHaveLength(4);
  expect(durability.participants.every((p) => p.pendingAtEnd === 0)).toBe(true);
  const metrics = await readFile(join(out, "metrics.json"), "utf8");
  expect(JSON.parse(metrics)).toEqual(result);
  expect(metrics).not.toContain("The room keeps changing.");
  expect(metrics).not.toContain("Revision 1:");
  expect(metrics).not.toContain("I think we should leave room");
  expect((await stat(out)).mode & 0o777).toBe(0o700);
  expect((await stat(join(out, "metrics.json"))).mode & 0o777).toBe(0o600);
}, 15000);
