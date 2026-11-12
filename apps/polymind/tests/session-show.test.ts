import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type {
  AnalysisV2,
  OperationConfig,
  RevisionInput,
  Snapshot,
} from "../src/session/contracts.ts";
import { type Executor, JobRunner } from "../src/session/jobs.ts";
import { SessionStore } from "../src/session/store.ts";

const config: OperationConfig = {
  model: {
    provider: "ollama",
    model: "synthetic-analysis",
    maxOutputTokens: 1000,
    timeoutMs: 1000,
  },
  promptVersion: "analysis-v2",
  maxInputCharacters: 100000,
};
const matchingConfig: OperationConfig = {
  ...config,
  promptVersion: "bounded-v1",
  mode: "similarity",
  oddPolicy: "reject",
  maxCalls: 1,
  embeddingModel: "synthetic-embedding",
};
const directories: string[] = [];
const stores = new Set<SessionStore>();

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "polymind-show-"));
  directories.push(directory);
  const path = join(directory, "sessions.sqlite");
  const store = new SessionStore(path);
  stores.add(store);
  const session = store.createSession("Synthetic gathering", 10);
  const round = store.createRound(
    session.id,
    "What could make our neighbourhood easier to live in?",
    "bounded",
  );
  return { store, path, session, round };
}

function revision(roundId: string, patch: Partial<RevisionInput> = {}) {
  return {
    roundId,
    requestId: randomUUID(),
    expectedRevision: 0,
    text: "A sheltered crossing near the library.",
    confirmed: true,
    matching: true,
    source: "typed" as const,
    ...patch,
  };
}

function result(snapshot: Snapshot): AnalysisV2 {
  return {
    version: "analysis-v2",
    commonGround: [],
    differences: [],
    questions: [],
    otherConcerns: snapshot.contributions.slice(0, 2).map((c, i) => ({
      id: `concern-${i}`,
      title: `Concern ${i + 1}`,
      text: "Improve access to local facilities.",
      sourceRefs: [c.id],
      evidence: [{ sourceRef: c.id, text: c.text.slice(0, 160) }],
    })),
  };
}

afterEach(async () => {
  for (const store of stores) store.close();
  stores.clear();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

it("rolls back closure, snapshot and job together when configuration, budget or input is invalid", async () => {
  const { store, session, round } = await setup();
  const person = store.join(session.id, "Synthetic participant").participant;
  for (const invalid of [
    { ...config, model: { ...config.model, model: "" } },
    config,
  ]) {
    expect(() => store.analyse(round.id, invalid)).toThrow();
    expect(store.round(round.id).open).toBe(true);
    expect(store.snapshots(session.id)).toEqual([]);
    expect(store.operations(session.id)).toEqual([]);
    expect(store.show(session.id).analysisId).toBeUndefined();
    expect(store.projection(session.id)).toMatchObject({
      kind: "writing",
      question: round.prompt,
      count: 0,
    });
  }
  const saved = store.revise(session.id, person.id, revision(round.id));
  expect(() =>
    store.analyse(round.id, { ...config, maxInputCharacters: 1 }),
  ).toThrow("input budget");
  expect(store.round(round.id).open).toBe(true);
  expect(store.snapshots(session.id)).toEqual([]);
  expect(store.operations(session.id)).toEqual([]);
  expect(store.current(person.id, round.id)).toEqual(saved);
  expect(store.analyse(round.id, config).state).toBe("queued");
});

it("freezes the latest exact question and complete revision once, rejects late edits and deduplicates repeated analysis", async () => {
  const { store, session, round } = await setup();
  const person = store.join(session.id, "Synthetic participant").participant;
  store.revise(session.id, person.id, revision(round.id));
  const saved = store.revise(
    session.id,
    person.id,
    revision(round.id, {
      expectedRevision: 1,
      text: "  Keep this exact line.\nAnd this complete second line. 🪴  ",
    }),
  );
  const first = store.analyse(round.id, config);
  const repeated = store.analyse(round.id, {
    ...config,
    model: { ...config.model, model: "different-synthetic-model" },
  });
  expect(repeated).toEqual(first);
  expect(store.operations(session.id)).toHaveLength(1);
  expect(store.snapshots(session.id)).toHaveLength(1);
  const frozen = store.snapshot(first.snapshotId).snapshot;
  expect(frozen.contributions).toEqual([saved]);
  expect(frozen.contributions[0]?.prompt).toBe(round.prompt);
  expect(first.config).toMatchObject({
    promptVersion: "analysis-v2",
    autoPublish: true,
  });
  expect(() =>
    store.revise(
      session.id,
      person.id,
      revision(round.id, { expectedRevision: 2, text: "A late edit" }),
    ),
  ).toThrow("closed");
  expect(store.snapshot(first.snapshotId).snapshot).toEqual(frozen);
  expect(store.show(session.id)).toMatchObject({
    roundId: round.id,
    analysisId: first.id,
    analysisState: "queued",
    personalReleased: false,
    presentation: "analysis",
  });
});

it("automatically publishes only the show analysis after validation and retains its separate personal release across restart", async () => {
  const { store, path, session, round } = await setup();
  const person = store.join(session.id, "Synthetic participant").participant;
  store.revise(session.id, person.id, revision(round.id));
  const op = store.analyse(round.id, config);
  const execute = vi
    .fn<Executor>()
    .mockImplementation(async (_op, snapshot) => result(snapshot));
  const runner = new JobRunner(store, execute);
  runner.start(op.id);
  runner.start(op.id);
  await runner.idle();
  expect(execute).toHaveBeenCalledTimes(1);
  expect(store.operation(op.id)).toMatchObject({
    state: "succeeded",
    published: true,
  });
  expect(store.projection(session.id)).toMatchObject({
    kind: "analysis",
    state: "succeeded",
    count: 1,
    result: { version: "analysis-v2" },
  });
  expect(store.perspective(session.id, person.id)).toBeUndefined();

  const legacy = store.enqueue(op.snapshotId, "analysis", {
    ...config,
    promptVersion: "bounded-v1",
  });
  const legacyRunner = new JobRunner(store, async () => ({
    themes: [],
    similarities: [],
    tensions: [],
    conflicts: [],
    outlyingConcerns: [],
    questions: [],
  }));
  legacyRunner.start(legacy.id);
  await legacyRunner.idle();
  expect(store.operation(legacy.id)).toMatchObject({
    state: "succeeded",
    published: false,
  });
  expect(() =>
    store.enqueue(op.snapshotId, "analysis", {
      ...config,
      promptVersion: "bounded-v1",
      autoPublish: true,
    }),
  ).toThrow("Automatic publication");

  store.releasePersonal(op.id);
  const personal = store.perspective(session.id, person.id);
  store.close();
  stores.delete(store);
  const reopened = new SessionStore(path);
  stores.add(reopened);
  expect(reopened.operation(op.id)).toMatchObject({
    state: "succeeded",
    published: true,
    personalReleased: true,
  });
  expect(reopened.perspective(session.id, person.id)).toEqual(personal);
  expect(reopened.operation(legacy.id).published).toBe(false);
  expect(reopened.projection(session.id)).toEqual(
    storeProjection(result(reopened.snapshot(op.snapshotId).snapshot)),
  );
});

it("keeps a relational analysis invalid and stores a safe schema diagnostic", async () => {
  const { store, session, round } = await setup();
  const person = store.join(session.id, "Synthetic participant").participant;
  store.revise(session.id, person.id, revision(round.id));
  const op = store.analyse(round.id, config);
  const execute = vi.fn<Executor>().mockResolvedValue({
    version: "analysis-v2",
    commonGround: [
      {
        id: "f1",
        title: "A shared workshop",
        text: "People want a shared workshop.",
        sourceRefs: [store.current(person.id, round.id)?.id],
        evidence: [],
      },
    ],
    differences: [],
    questions: [],
    otherConcerns: [],
  });
  const runner = new JobRunner(store, execute);
  runner.start(op.id);
  await runner.idle();

  const failed = store.operation(op.id);
  expect(failed.state).toBe("failed");
  expect(failed.published).toBe(false);
  expect(failed.error).toContain("too_small");
  expect(failed.error).toContain("commonGround[0].sourceRefs");
  expect(failed.error).toContain("min 2");
  expect(failed.error).not.toContain("Synthetic participant");
  expect(store.snapshot(op.snapshotId).snapshot.contributions).toHaveLength(1);
  expect(store.show(session.id).analysisState).toBe("failed");
});

function storeProjection(analysis: AnalysisV2) {
  return {
    kind: "analysis",
    state: "succeeded",
    count: 1,
    result: {
      ...analysis,
      otherConcerns: analysis.otherConcerns.map(({ id, title, text }) => ({
        id,
        title,
        text,
      })),
    },
  };
}

it("keeps failed analysis private and matching gated until an explicit retry succeeds", async () => {
  const { store, session, round } = await setup();
  for (const name of ["A", "B"]) {
    const person = store.join(session.id, name).participant;
    store.revise(session.id, person.id, revision(round.id));
  }
  const op = store.analyse(round.id, config);
  const execute = vi
    .fn<Executor>()
    .mockRejectedValueOnce(new Error("Synthetic private provider details"))
    .mockImplementation(async (_op, snapshot) => result(snapshot));
  const runner = new JobRunner(store, execute);
  expect(() => store.skipAnalysis(round.id)).toThrow("unsuccessful");
  expect(() => store.releasePersonal(op.id)).toThrow("Complete");
  expect(() =>
    store.enqueue(op.snapshotId, "matching", matchingConfig),
  ).toThrow("Complete analysis");
  runner.start(op.id);
  await runner.idle();
  expect(store.operation(op.id)).toMatchObject({
    state: "failed",
    published: false,
  });
  expect(store.operation(op.id).error).not.toContain("Synthetic private");
  expect(store.projection(session.id)?.kind).toBe("analysis");
  expect(store.projection(session.id)).not.toHaveProperty(
    "result",
    expect.anything(),
  );
  expect(() => store.releasePersonal(op.id)).toThrow("Complete");
  expect(() =>
    store.enqueue(op.snapshotId, "matching", matchingConfig),
  ).toThrow("Complete analysis");
  expect(store.analyse(round.id, config).state).toBe("failed");
  runner.start(op.id);
  await runner.idle();
  expect(execute).toHaveBeenCalledTimes(1);
  const retry = store.retry(op.id);
  expect(retry.id).toBe(op.id);
  expect(retry.snapshotId).toBe(op.snapshotId);
  runner.start(retry.id);
  await runner.idle();
  expect(execute).toHaveBeenCalledTimes(2);
  expect(store.operation(op.id)).toMatchObject({
    state: "succeeded",
    published: true,
  });
  expect(store.enqueue(op.snapshotId, "matching", matchingConfig).state).toBe(
    "queued",
  );
});

it("allows an explicit skip after cancellation or interrupted recovery without publishing or releasing personal details", async () => {
  const { store, path, session, round } = await setup();
  for (const name of ["A", "B"]) {
    const person = store.join(session.id, name).participant;
    store.revise(session.id, person.id, revision(round.id));
  }
  const op = store.analyse(round.id, config);
  const execute = vi.fn<Executor>();
  const runner = new JobRunner(store, execute);
  runner.cancel(op.id);
  expect(store.operation(op.id).state).toBe("cancelled");
  expect(() =>
    store.enqueue(op.snapshotId, "matching", matchingConfig),
  ).toThrow("Complete analysis");
  expect(store.skipAnalysis(round.id).analysisSkipped).toBe(true);
  expect(store.enqueue(op.snapshotId, "matching", matchingConfig).state).toBe(
    "queued",
  );
  expect(() => store.releasePersonal(op.id)).toThrow("Complete");
  expect(execute).not.toHaveBeenCalled();

  const next = store.createRound(
    session.id,
    "Another independent question?",
    "bounded",
  );
  for (const person of store.participants(session.id))
    store.revise(session.id, person.id, revision(next.id));
  const pending = store.analyse(next.id, config);
  store.close();
  stores.delete(store);
  const reopened = new SessionStore(path);
  stores.add(reopened);
  expect(reopened.operation(pending.id).state).toBe("interrupted");
  expect(reopened.show(session.id).analysisSkipped).toBe(false);
  expect(() =>
    reopened.enqueue(pending.snapshotId, "matching", matchingConfig),
  ).toThrow("Complete analysis");
  expect(reopened.skipAnalysis(next.id).analysisSkipped).toBe(true);
  expect(
    reopened.enqueue(pending.snapshotId, "matching", matchingConfig).state,
  ).toBe("queued");
  expect(reopened.operation(pending.id).published).toBe(false);
  expect(() => reopened.releasePersonal(pending.id)).toThrow("Complete");
});

it("starts each round with separate writing, analysis and personal release while retaining older analyses for explicit selection", async () => {
  const { store, session, round } = await setup();
  const person = store.join(session.id, "Synthetic participant").participant;
  store.revise(session.id, person.id, revision(round.id));
  store.selectPresentation(session.id, { kind: "voice" });
  const first = store.analyse(round.id, config);
  store.completeOperation(
    first.id,
    result(store.snapshot(first.snapshotId).snapshot),
  );
  store.releasePersonal(first.id);
  const firstProjection = store.projection(session.id);
  const next = store.createRound(session.id, "A separate question?", "bounded");
  expect(store.show(session.id)).toMatchObject({
    roundId: next.id,
    analysisSkipped: false,
    personalReleased: false,
    presentation: "writing",
  });
  expect(store.show(session.id).analysisId).toBeUndefined();
  expect(store.perspective(session.id, person.id)).toBeUndefined();
  expect(store.projection(session.id)).toEqual({
    kind: "writing",
    question: next.prompt,
    count: 0,
  });
  store.revise(
    session.id,
    person.id,
    revision(next.id, { text: "A separate contribution." }),
  );
  const second = store.analyse(next.id, config);
  expect(second.id).not.toBe(first.id);
  expect(second.snapshotId).not.toBe(first.snapshotId);
  expect(store.show(session.id).analysisId).toBe(second.id);
  expect(store.projection(session.id)).toMatchObject({
    kind: "analysis",
    state: "queued",
  });
  store.completeOperation(
    second.id,
    result(store.snapshot(second.snapshotId).snapshot),
  );
  expect(store.perspective(session.id, person.id)).toBeUndefined();
  store.selectPresentation(session.id, {
    kind: "analysis",
    operationId: first.id,
  });
  expect(store.projection(session.id)).toEqual(firstProjection);
});
