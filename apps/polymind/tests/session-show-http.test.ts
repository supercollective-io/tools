import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type {
  AnalysisV2,
  OperationConfig,
  Snapshot,
} from "../src/session/contracts.ts";
import type { Executor } from "../src/session/jobs.ts";
import { startSessionServer } from "../src/session/server.ts";

const token = "synthetic-show-operator-token-32-characters";
const config: OperationConfig = {
  model: {
    provider: "ollama",
    model: "synthetic-analysis",
    maxOutputTokens: 1000,
    timeoutMs: 10000,
  },
  promptVersion: "analysis-v2",
  maxInputCharacters: 100000,
};
const apps = new Set<Awaited<ReturnType<typeof startSessionServer>>>();
const directories: string[] = [];

function result(snapshot: Snapshot): AnalysisV2 {
  return {
    version: "analysis-v2",
    commonGround: [
      {
        id: "access",
        title: "Local access",
        text: "Make local facilities easier to reach.",
        sourceRefs: snapshot.contributions.map((c) => c.id),
        evidence: snapshot.contributions.slice(0, 2).map((c) => ({
          sourceRef: c.id,
          text: c.text,
        })),
      },
    ],
    differences: [],
    questions: [],
    otherConcerns: snapshot.contributions.slice(0, 2).map((c, i) => ({
      id: `concern-${i}`,
      title: `Concern ${i + 1}`,
      text: `Consider access priority ${i + 1}.`,
      sourceRefs: [c.id],
      evidence: [{ sourceRef: c.id, text: c.text }],
    })),
  };
}

async function setup(
  executor: Executor = async (_op, snapshot) => result(snapshot),
) {
  const directory = await mkdtemp(join(tmpdir(), "polymind-show-http-"));
  directories.push(directory);
  const app = await startSessionServer({
    directory,
    port: 0,
    origin: "http://127.0.0.1:0",
    operatorToken: token,
    executor,
  });
  apps.add(app);
  const { origin } = app;
  const session = app.store.createSession("Synthetic show", 10);
  const round = app.store.createRound(
    session.id,
    "What should we change?",
    "bounded",
  );
  async function request(
    path: string,
    data?: unknown,
    cookie = "",
    operator = false,
    sessionId = session.id,
  ) {
    const response = await fetch(`${origin}${path}?session=${sessionId}`, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: cookie,
        ...(operator ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return {
      response,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    };
  }
  async function joinAndSave(name: string, text?: string) {
    const person = await request("/api/join", { name });
    if (text !== undefined) {
      const saved = await request(
        "/api/contribution",
        {
          roundId: round.id,
          requestId: randomUUID(),
          expectedRevision: 0,
          text,
          confirmed: true,
          matching: true,
          source: "typed",
        },
        person.cookie,
      );
      expect(saved.response.status).toBe(200);
      return { ...person, contribution: saved.body };
    }
    return { ...person, contribution: undefined };
  }
  return { app, directory, origin, request, joinAndSave, session, round };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([...apps].map((app) => app.close()));
  apps.clear();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

it("closes once, shows the validated collective analysis automatically and releases only each participant's frozen perspective", async () => {
  let finish: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const executor = vi.fn<Executor>(async (_op, snapshot) => {
    await gate;
    return result(snapshot);
  });
  const { app, request, joinAndSave, session, round } = await setup(executor);
  const a = await joinAndSave("A", "Synthetic private wording from A.");
  const b = await joinAndSave("B", "Synthetic private wording from B.");
  const observer = await joinAndSave("Observer");
  expect(
    (await request("/api/state", undefined, a.cookie)).body,
  ).not.toHaveProperty("personalAnalysis");
  expect(
    (
      await request(
        "/api/operator/analyse",
        { roundId: round.id, config },
        a.cookie,
      )
    ).response.status,
  ).toBe(401);
  const analysis = await request(
    "/api/operator/analyse",
    { roundId: round.id, config },
    "",
    true,
  );
  expect(analysis.response.status).toBe(202);
  const repeat = await request(
    "/api/operator/analyse",
    { roundId: round.id, config },
    "",
    true,
  );
  expect(repeat.body.id).toBe(analysis.body.id);
  const pending = await request("/api/projection");
  expect(pending.body.presentation).toMatchObject({
    kind: "analysis",
    state: "running",
    count: 2,
  });
  expect(pending.body.presentation).not.toHaveProperty("result");
  expect(pending.body.results).toEqual([]);
  expect(
    (
      await request(
        "/api/operator/personal-release",
        { id: analysis.body.id },
        "",
        true,
      )
    ).response.status,
  ).toBe(409);
  expect(
    (
      await request(
        "/api/contribution",
        {
          roundId: round.id,
          requestId: randomUUID(),
          expectedRevision: 1,
          text: "Late replacement",
          confirmed: true,
          matching: true,
          source: "typed",
        },
        a.cookie,
      )
    ).response.status,
  ).toBe(409);
  finish?.();
  await app.runner.idle();
  expect(executor).toHaveBeenCalledTimes(1);
  expect(app.store.snapshots(session.id)).toHaveLength(1);
  expect(app.store.operations(session.id)).toHaveLength(1);
  const operator = await request("/api/operator/state", undefined, "", true);
  expect(operator.body.show).toMatchObject({
    analysisId: analysis.body.id,
    analysisState: "succeeded",
    personalReleased: false,
  });
  const projection = await request("/api/projection");
  expect(projection.body.presentation.result.commonGround).toEqual([
    {
      id: "access",
      title: "Local access",
      text: "Make local facilities easier to reach.",
    },
  ]);
  const publicJSON = JSON.stringify(projection.body);
  for (const hidden of [
    a.contribution.id,
    b.contribution.id,
    a.body.participant.id,
    b.body.participant.id,
    a.contribution.text,
    b.contribution.text,
    "sourceRefs",
    "evidence",
  ])
    expect(publicJSON).not.toContain(hidden);
  expect(
    (await request("/api/state", undefined, a.cookie)).body,
  ).not.toHaveProperty("personalAnalysis");
  expect(
    (
      await request(
        "/api/operator/personal-release",
        { id: analysis.body.id },
        a.cookie,
      )
    ).response.status,
  ).toBe(401);
  expect(
    (
      await request(
        "/api/operator/personal-release",
        { id: analysis.body.id },
        "",
        true,
      )
    ).response.status,
  ).toBe(200);
  const own = (await request("/api/state", undefined, a.cookie)).body
    .personalAnalysis;
  expect(own.contribution).toEqual(a.contribution);
  expect(own.analysis.commonGround[0].sourceRefs).toEqual([a.contribution.id]);
  expect(own.analysis.commonGround[0].evidence).toEqual([
    { sourceRef: a.contribution.id, text: a.contribution.text },
  ]);
  expect(
    own.analysis.otherConcerns.map((finding: { id: string }) => finding.id),
  ).toEqual(["concern-0"]);
  const ownJSON = JSON.stringify(own);
  for (const hidden of [
    b.contribution.id,
    b.body.participant.id,
    b.contribution.text,
    "concern-1",
  ])
    expect(ownJSON).not.toContain(hidden);
  const other = (await request("/api/state", undefined, b.cookie)).body
    .personalAnalysis;
  expect(other.contribution).toEqual(b.contribution);
  expect(JSON.stringify(other)).not.toContain(a.contribution.text);
  expect(
    (await request("/api/state", undefined, observer.cookie)).body
      .personalAnalysis,
  ).toEqual({ analysis: null, contribution: null });
  expect((await request("/api/state")).body).not.toHaveProperty(
    "personalAnalysis",
  );
  expect((await request("/api/projection")).body).toEqual(projection.body);
});

it("enforces operator authentication and session boundaries for analyse, personal release, skip and presentation", async () => {
  const { app, request, joinAndSave, session, round } = await setup();
  const a = await joinAndSave("A", "Synthetic private source A.");
  await joinAndSave("B", "Synthetic private source B.");
  const own = await request(
    "/api/operator/analyse",
    { roundId: round.id, config },
    "",
    true,
  );
  await app.runner.idle();
  const other = app.store.createSession("Separate synthetic show", 10);
  const otherRound = app.store.createRound(
    other.id,
    "Separate question?",
    "bounded",
  );
  const p = app.store.join(other.id, "Other participant").participant;
  app.store.revise(other.id, p.id, {
    roundId: otherRound.id,
    requestId: randomUUID(),
    expectedRevision: 0,
    text: "Separate synthetic source.",
    confirmed: true,
    matching: true,
    source: "typed",
  });
  const otherAnalysis = app.store.analyse(otherRound.id, config);
  for (const [path, data] of [
    ["/api/operator/analyse", { roundId: otherRound.id, config }],
    ["/api/operator/personal-release", { id: otherAnalysis.id }],
    ["/api/operator/skip-analysis", { roundId: otherRound.id }],
    [
      "/api/operator/presentation",
      { kind: "analysis", operationId: otherAnalysis.id },
    ],
  ] as const) {
    expect((await request(path, data, a.cookie)).response.status).toBe(401);
    const crossSession = await request(path, data, "", true);
    expect(crossSession.response.status).toBeGreaterThanOrEqual(400);
    expect(crossSession.response.status).toBeLessThan(500);
  }
  expect(app.store.show(session.id).analysisId).toBe(own.body.id);
  expect(
    app.store.operation(otherAnalysis.id).personalReleased,
  ).toBeUndefined();
  expect(app.store.round(otherRound.id).analysisSkipped).toBe(false);
  const forgedCookie = a.cookie.replace(`pm_${session.id}`, `pm_${other.id}`);
  const wrongIdentity = await request(
    "/api/state",
    undefined,
    forgedCookie,
    false,
    other.id,
  );
  expect(wrongIdentity.body).not.toHaveProperty("participant");
  expect(wrongIdentity.body).not.toHaveProperty("personalAnalysis");
  const foreignRelease = await request(
    "/api/operator/personal-release",
    { id: own.body.id },
    "",
    true,
    other.id,
  );
  expect(foreignRelease.response.status).toBe(403);
  expect(app.store.operation(own.body.id).personalReleased).toBeUndefined();
});

it("keeps failed analysis closed until explicit retry or skip and preserves the selected analysis over stale voice text", async () => {
  const execute = vi
    .fn<Executor>()
    .mockRejectedValueOnce(
      new Error("Synthetic confidential provider response"),
    )
    .mockImplementation(async (_op, snapshot) => result(snapshot));
  const { app, request, joinAndSave, session, round } = await setup(execute);
  await joinAndSave("A", "Private source A.");
  await joinAndSave("B", "Private source B.");
  vi.spyOn(app.voice, "state").mockReturnValue({
    id: randomUUID(),
    roundId: randomUUID(),
    status: "paused",
    text: "Stale voice from a previous round.",
  });
  const analysis = await request(
    "/api/operator/analyse",
    { roundId: round.id, config },
    "",
    true,
  );
  await app.runner.idle();
  const failed = await request("/api/projection");
  expect(failed.body.presentation).toMatchObject({
    kind: "analysis",
    state: "failed",
  });
  expect(failed.body.presentation).not.toHaveProperty("text");
  expect(failed.body.presentation).not.toHaveProperty("result");
  expect(JSON.stringify(failed.body)).not.toContain("confidential");
  expect(
    (
      await request(
        "/api/operator/analyse",
        { roundId: round.id, config },
        "",
        true,
      )
    ).body.id,
  ).toBe(analysis.body.id);
  await app.runner.idle();
  expect(execute).toHaveBeenCalledTimes(1);
  const matching = {
    snapshotId: analysis.body.snapshotId,
    kind: "matching",
    config: {
      ...config,
      promptVersion: "bounded-v1",
      mode: "similarity",
      oddPolicy: "reject",
      maxCalls: 1,
      embeddingModel: "synthetic-embedding",
    },
  };
  expect(
    (await request("/api/operator/jobs", matching, "", true)).response.status,
  ).toBe(409);
  const retry = await request(
    "/api/operator/job",
    { id: analysis.body.id, action: "retry" },
    "",
    true,
  );
  expect(retry.response.status).toBe(200);
  await app.runner.idle();
  expect(execute).toHaveBeenCalledTimes(2);
  const succeeded = await request("/api/projection");
  expect(succeeded.body.presentation).toMatchObject({
    kind: "analysis",
    state: "succeeded",
    result: { version: "analysis-v2" },
  });
  expect(
    (
      await request(
        "/api/operator/skip-analysis",
        { roundId: round.id },
        "",
        true,
      )
    ).response.status,
  ).toBe(409);
  expect(
    (await request("/api/operator/presentation", { kind: "voice" }, "", true))
      .response.status,
  ).toBe(200);
  expect((await request("/api/projection")).body.presentation).toEqual({
    kind: "voice",
    text: "Stale voice from a previous round.",
  });
  await request(
    "/api/operator/presentation",
    { kind: "analysis", operationId: analysis.body.id },
    "",
    true,
  );
  expect((await request("/api/projection")).body.presentation).toEqual(
    succeeded.body.presentation,
  );
  const next = await request(
    "/api/operator/rounds",
    { prompt: "Next independent question?", mode: "bounded" },
    "",
    true,
  );
  expect(next.response.status).toBe(201);
  const state = (await request("/api/operator/state", undefined, "", true))
    .body;
  expect(state.show).toMatchObject({
    roundId: next.body.id,
    personalReleased: false,
    analysisSkipped: false,
    presentation: "writing",
  });
  expect(state.show).not.toHaveProperty("analysisId");
  expect(app.store.round(round.id).sessionId).toBe(session.id);
  expect((await request("/api/projection")).body.presentation).toEqual({
    kind: "writing",
    question: next.body.prompt,
    count: 0,
  });
});
