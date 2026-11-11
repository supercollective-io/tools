import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  OperationConfig,
  RevisionInput,
} from "../src/session/contracts.ts";
import { JobRunner, validateResult } from "../src/session/jobs.ts";
import { SessionStore } from "../src/session/store.ts";

const config: OperationConfig = {
  model: {
    provider: "ollama",
    model: "test-double",
    maxOutputTokens: 1000,
    timeoutMs: 1000,
  },
  promptVersion: "bounded-v1",
  maxInputCharacters: 100000,
};
const directories: string[] = [],
  stores: SessionStore[] = [];
async function setup(capacity = 140) {
  const dir = await mkdtemp(join(tmpdir(), "polymind-"));
  directories.push(dir);
  const store = new SessionStore(join(dir, "session.sqlite"));
  stores.push(store);
  const session = store.createSession("Synthetic gathering", capacity);
  const round = store.createRound(session.id, "What can we change?", "bounded");
  return { dir, store, session, round };
}
function input(
  roundId: string,
  patch: Partial<RevisionInput> = {},
): RevisionInput {
  return {
    roundId,
    requestId: randomUUID(),
    expectedRevision: 0,
    text: "Rutas accesibles 🪴",
    confirmed: true,
    matching: true,
    source: "typed",
    ...patch,
  };
}
afterEach(async () => {
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {}
  }
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("event identity and snapshots", () => {
  it("joins without a composer, uses unique badges and rotates recovery credentials", async () => {
    const { store, session } = await setup(2);
    const first = store.join(session.id, "Sam"),
      second = store.join(session.id, "Sam", true);
    expect(first.participant.id).not.toBe(second.participant.id);
    expect(first.participant.badge).not.toBe(second.participant.badge);
    expect(() => store.join(session.id, "Third")).toThrow("full");
    expect(store.identify(session.id, first.credential)?.id).toBe(
      first.participant.id,
    );
    expect(() => store.recover(session.id, first.participant.badge)).toThrow();
    const recovered = store.recover(session.id, first.recovery);
    expect(store.identify(session.id, first.credential)).toBeUndefined();
    expect(store.identify(session.id, recovered.credential)?.id).toBe(
      first.participant.id,
    );
    store.closeSession(session.id);
    expect(store.recover(session.id, first.recovery).participant.id).toBe(
      first.participant.id,
    );
  });
  it("freezes confirmed exact revisions, retries safely and detects competing edits", async () => {
    const { store, session, round } = await setup();
    const p = store.join(session.id, "Ada").participant;
    const request = input(round.id);
    const saved = store.revise(session.id, p.id, request);
    expect(store.revise(session.id, p.id, request)).toEqual(saved);
    expect(() =>
      store.revise(session.id, p.id, { ...request, text: "changed" }),
    ).toThrow("reused");
    expect(() => store.revise(session.id, p.id, input(round.id))).toThrow(
      "another window",
    );
    const draft = store.join(session.id, "Draft").participant;
    store.revise(
      session.id,
      draft.id,
      input(round.id, { confirmed: false, matching: false }),
    );
    const snapshot = store.freeze(round.id);
    expect(store.freeze(round.id)).toEqual(snapshot);
    expect(snapshot.eligible).toEqual([p.id]);
    expect(snapshot.contributions).toEqual([saved]);
    expect(store.revise(session.id, p.id, request)).toEqual(saved);
    expect(() =>
      store.revise(session.id, p.id, input(round.id, { expectedRevision: 1 })),
    ).toThrow("closed");
    const next = store.createRound(session.id, "Next question", "continuous");
    store.revise(
      session.id,
      p.id,
      input(next.id, { text: "New round", confirmed: false, matching: false }),
    );
    expect(store.snapshot(snapshot.id).snapshot.contributions[0]?.text).toBe(
      "Rutas accesibles 🪴",
    );
    expect(store.participant(p.id).badge).toBe("001");
  });
  it("does not admit a participant from another session or confirm blank text", async () => {
    const { store, session, round } = await setup();
    const other = store.createSession("Other", 10);
    const p = store.join(other.id, "Other").participant;
    expect(() => store.revise(session.id, p.id, input(round.id))).toThrow(
      "Wrong session",
    );
    const own = store.join(session.id, "Own").participant;
    expect(() =>
      store.revise(session.id, own.id, input(round.id, { text: " " })),
    ).toThrow("before confirming");
  });
});

describe("durable bounded operations and private encounters", () => {
  it("deduplicates jobs, rejects invented source IDs and keeps publication explicit", async () => {
    const { store, session, round } = await setup();
    const p = store.join(session.id, "A").participant;
    store.revise(session.id, p.id, input(round.id));
    const snapshot = store.freeze(round.id);
    const op = store.enqueue(snapshot.id, "analysis", config);
    expect(store.enqueue(snapshot.id, "analysis", config).id).toBe(op.id);
    const result = {
      themes: [{ text: "Access", sourceRefs: [snapshot.contributions[0]?.id] }],
      similarities: [],
      tensions: [],
      conflicts: [],
      outlyingConcerns: [],
      questions: [],
    };
    const runner = new JobRunner(store, async () => result);
    runner.start(op.id);
    await runner.idle();
    expect(store.operation(op.id)).toMatchObject({
      state: "succeeded",
      published: false,
    });
    store.publish(op.id);
    expect(store.operation(op.id).published).toBe(true);
    const invalid = store.enqueue(snapshot.id, "voice", config);
    const badRunner = new JobRunner(store, async () => ({
      text: "Made up",
      sourceRefs: ["unknown"],
    }));
    badRunner.start(invalid.id);
    await badRunner.idle();
    expect(store.operation(invalid.id).state).toBe("failed");
    expect(() => store.publish(invalid.id)).toThrow("successful");
    expect(store.snapshot(snapshot.id).snapshot).toEqual(snapshot);
  });
  it("marks in-flight work interrupted on restart without rerunning providers", async () => {
    const { store, dir, session, round } = await setup();
    const p = store.join(session.id, "A").participant;
    store.revise(session.id, p.id, input(round.id));
    const snapshot = store.freeze(round.id);
    const op = store.enqueue(snapshot.id, "voice", config);
    store.saveOperation({ ...op, state: "running" });
    store.close();
    stores.splice(stores.indexOf(store), 1);
    const reopened = new SessionStore(join(dir, "session.sqlite"));
    stores.push(reopened);
    expect(reopened.operation(op.id).state).toBe("interrupted");
    expect(reopened.snapshot(snapshot.id).snapshot).toEqual(snapshot);
    expect(reopened.retry(op.id).state).toBe("queued");
  });
  it("releases a complete trio only after review and returns only one's own partners", async () => {
    const { store, session, round } = await setup();
    const people = Array.from(
      { length: 5 },
      (_, i) => store.join(session.id, `Person ${i}`).participant,
    );
    for (const p of people) store.revise(session.id, p.id, input(round.id));
    const snapshot = store.freeze(round.id);
    const op = store.enqueue(snapshot.id, "matching", {
      ...config,
      mode: "similarity",
      oddPolicy: "trio",
      maxCalls: 1,
    });
    const result = {
      schemaVersion: 1,
      jobId: op.id,
      snapshot: { id: snapshot.id, hash: op.snapshotHash },
      mode: "similarity",
      groups: [people.slice(0, 3), people.slice(3)].map((group, i) => ({
        id: String(i),
        participantIds: group.map((p) => p.id),
        reviewRequired: group.length === 3,
        sourceRefs: Object.fromEntries(
          snapshot.contributions
            .filter((c) => group.some((p) => p.id === c.participantId))
            .map((c) => [c.participantId, [c.id]]),
        ),
      })),
    };
    validateResult(op, snapshot, result);
    store.saveOperation({ ...op, state: "succeeded", result });
    const first = people[0];
    if (!first) throw new Error("fixture");
    expect(store.encounters(session.id, first.id)).toEqual([]);
    expect(() =>
      store.release(op.id, ["Zone A · 1", "Seated meeting B"], false),
    ).toThrow("Review");
    const release = store.release(
      op.id,
      ["Zone A · 1", "Seated meeting B"],
      true,
    );
    expect(store.release(op.id, ["changed", "changed"], true)).toEqual(release);
    expect(
      store.encounters(session.id, first.id)[0]?.partners.map((p) => p.name),
    ).toEqual(["Person 1", "Person 2"]);
    expect(
      JSON.stringify(store.encounters(session.id, first.id)),
    ).not.toContain("Person 4");
    expect(() =>
      validateResult(op, snapshot, { ...result, groups: [result.groups[0]] }),
    ).toThrow("allocation");
  });
});
