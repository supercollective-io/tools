import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { modelExecutor, validateResult } from "../src/session/jobs.ts";
import { startSessionServer } from "../src/session/server.ts";

const apps: Awaited<ReturnType<typeof startSessionServer>>[] = [],
  dirs: string[] = [];
const token = "synthetic-operator-token-with-32-characters";
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "polymind-http-"));
  dirs.push(directory);
  const app = await startSessionServer({
    directory,
    port: 0,
    origin: "http://127.0.0.1:0",
    operatorToken: token,
    executor: async (_op, snap) => ({
      text: "A bounded collective thought.",
      sourceRefs: snap.contributions.map((c) => c.id),
    }),
    transcribe: async () => "A transcript to correct.",
  });
  apps.push(app);
  const { origin } = app;
  const session = app.store.createSession("Synthetic room", 180);
  const round = app.store.createRound(session.id, "What matters?", "bounded");
  async function request(
    path: string,
    data?: unknown,
    cookie = "",
    operator = false,
  ) {
    const response = await fetch(
      `${origin}${path}${path.includes("?") ? "&" : "?"}session=${session.id}`,
      {
        method: data === undefined ? "GET" : "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: cookie,
          ...(operator ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
      },
    );
    return {
      response,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    };
  }
  return { app, directory, origin, request, session, round };
}
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(apps.splice(0).map((a) => a.close()));
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

it("allocates distinct ports for concurrent servers and rejects the other server's origin", async () => {
  const [first, second] = await Promise.all([setup(), setup()]);
  expect(first.origin).not.toBe(second.origin);
  for (const { app, origin, request } of [first, second]) {
    const address = app.server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected a listening TCP server.");
    expect(address.port).toBeGreaterThan(0);
    expect(new URL(origin).port).toBe(String(address.port));
    expect(
      (await request("/api/operator/state", undefined, "", true)).response
        .status,
    ).toBe(200);
  }
  const response = await fetch(
    `${first.origin}/api/join?session=${first.session.id}`,
    {
      method: "POST",
      headers: { Origin: second.origin, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Wrong origin" }),
    },
  );
  expect(response.status).toBe(403);
});

it("enforces operator, participant, Host and Origin boundaries with same-browser recovery", async () => {
  const { request, origin, session } = await setup();
  expect((await request("/api/operator/state")).response.status).toBe(401);
  const a = await request("/api/join", { name: "A" });
  const b = await request("/api/join", { name: "B" });
  expect(a.body.recovery).toHaveLength(64);
  expect(a.cookie).toContain(`pm_${session.id}`);
  const self = await request("/api/state", undefined, a.cookie);
  expect(self.body.participant.name).toBe("A");
  expect(JSON.stringify(self.body)).not.toContain(b.body.participant.id);
  const oldCookie = a.cookie.replace(
    `pm_${session.id}`,
    `collective_${session.id.slice(0, 8)}`,
  );
  expect(
    (await request("/api/state", undefined, oldCookie)).body.participant,
  ).toBeUndefined();
  const duplicate = await request("/api/join", { name: "Duplicate" }, a.cookie);
  expect(duplicate.body.participant.id).toBe(a.body.participant.id);
  const wrong = await fetch(`${origin}/api/join?session=${session.id}`, {
    method: "POST",
    headers: {
      Origin: "https://evil.invalid",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Attack" }),
  });
  expect(wrong.status).toBe(403);
  const forged = await new Promise<number | undefined>((resolve, reject) => {
    const req = httpRequest(
      `${origin}/api/state?session=${session.id}`,
      { headers: { Host: "evil.invalid" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  expect(forged).toBe(403);
  const recovered = await request("/api/recover", {
    recovery: a.body.recovery,
  });
  expect(recovered.body.participant.id).toBe(a.body.participant.id);
  expect(
    (await request("/api/state", undefined, a.cookie)).body.participant,
  ).toBeUndefined();
  expect(
    (await request("/api/state", undefined, recovered.cookie)).body.participant
      .name,
  ).toBe("A");
});

it("runs capture to bounded voice with explicit reveal, while keeping private source text off projection", async () => {
  const { app, request, round } = await setup();
  const p = await request("/api/join", { name: "A" });
  const submission = {
    roundId: round.id,
    requestId: randomUUID(),
    expectedRevision: 0,
    text: "Private source wording",
    confirmed: true,
    matching: true,
    source: "typed",
  };
  expect((await request("/api/contribution", submission)).response.status).toBe(
    401,
  );
  expect(
    (await request("/api/contribution", submission, p.cookie)).response.status,
  ).toBe(200);
  const frozen = await request(
    "/api/operator/freeze",
    { roundId: round.id },
    "",
    true,
  );
  const job = await request(
    "/api/operator/jobs",
    {
      snapshotId: frozen.body.id,
      kind: "voice",
      config: {
        model: {
          provider: "ollama",
          model: "fake",
          maxOutputTokens: 1000,
          timeoutMs: 1000,
        },
        promptVersion: "bounded-v1",
        maxInputCharacters: 10000,
      },
    },
    "",
    true,
  );
  expect(job.response.status).toBe(202);
  await app.runner.idle();
  expect((await request("/api/projection")).body.results).toEqual([]);
  await request(
    "/api/operator/job",
    { id: job.body.id, action: "publish" },
    "",
    true,
  );
  const projection = await request("/api/projection");
  expect(projection.body.results[0].result.text).toBe(
    "A bounded collective thought.",
  );
  expect(JSON.stringify(projection.body)).not.toContain(
    "Private source wording",
  );
  expect(
    (await request("/api/operator/close", {}, "", true)).response.status,
  ).toBe(200);
  expect(
    (await request("/api/state", undefined, p.cookie)).body.participant.id,
  ).toBe(p.body.participant.id);
});

it("keeps transcripts private and unconfirmed, handles upload retries and deletes successful audio", async () => {
  const { request, origin, session, round, directory } = await setup();
  const a = await request("/api/join", { name: "A" }),
    b = await request("/api/join", { name: "B" });
  const recording = randomUUID();
  const bytes = Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    Buffer.alloc(200),
  ]);
  const upload = () =>
    fetch(
      `${origin}/api/recordings/${recording}?session=${session.id}&round=${round.id}`,
      {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: a.cookie,
          "Content-Type": "audio/webm",
        },
        body: bytes,
      },
    );
  expect((await upload()).status).toBe(202);
  expect((await upload()).status).toBe(202);
  await vi.waitFor(async () => {
    expect(
      (await request(`/api/recordings/${recording}`, undefined, a.cookie)).body
        .state,
    ).toBe("succeeded");
  });
  expect(
    (await request(`/api/recordings/${recording}`, undefined, b.cookie))
      .response.status,
  ).toBe(404);
  expect(
    (await request("/api/state", undefined, a.cookie)).body.contribution,
  ).toBeUndefined();
  await expect(
    readFile(join(directory, `${recording}.audio`)),
  ).rejects.toThrow();
});

it("hands the exact snapshot to the packaged Python worker and validates the returned allocation", async () => {
  const { app, session, round, directory } = await setup();
  for (let i = 0; i < 3; i++) {
    const p = app.store.join(session.id, `Person ${i}`).participant;
    app.store.revise(session.id, p.id, {
      roundId: round.id,
      requestId: randomUUID(),
      expectedRevision: 0,
      text: `Synthetic contribution ${i}`,
      confirmed: true,
      matching: true,
      source: "typed",
    });
  }
  const snap = app.store.freeze(round.id);
  const op = app.store.enqueue(snap.id, "matching", {
    model: {
      provider: "openai",
      model: "fake",
      maxOutputTokens: 1000,
      timeoutMs: 10000,
    },
    promptVersion: "bounded-v1",
    maxInputCharacters: 10000,
    mode: "similarity",
    embeddingModel: "synthetic-vectors",
    maxCalls: 1,
    oddPolicy: "trio",
  });
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    json: async () => ({
      data: [0, 1, 2].map((index) => ({
        index,
        embedding: [1, index / 10 + 0.1],
      })),
    }),
  }));
  const progress = vi.fn();
  const result = await modelExecutor(directory)(
    op,
    snap,
    new AbortController().signal,
    progress,
  );
  expect(validateResult(op, snap, result)).toMatchObject({
    jobId: op.id,
    groups: [{ reviewRequired: true }],
  });
  expect(progress).toHaveBeenCalledWith("3/3 assessments");
  const request = JSON.parse(
    await readFile(
      resolve(directory, "matching", op.id, "request.json"),
      "utf8",
    ),
  );
  expect(request.roster[0]).not.toHaveProperty("name");
  expect(request.roster[0]).not.toHaveProperty("credential");
}, 15000);

it("passes released encounters through to Match as forbidden pairs", async () => {
  const { app, session, round, directory } = await setup();
  const people = Array.from(
    { length: 4 },
    (_, i) => app.store.join(session.id, `Person ${i}`).participant,
  );
  for (const person of people)
    app.store.revise(session.id, person.id, {
      roundId: round.id,
      requestId: randomUUID(),
      expectedRevision: 0,
      text: "Synthetic contribution",
      confirmed: true,
      matching: true,
      source: "typed",
    });

  const config = {
    model: {
      provider: "openai" as const,
      model: "fake",
      maxOutputTokens: 1000,
      timeoutMs: 10000,
    },
    promptVersion: "bounded-v1" as const,
    maxInputCharacters: 10000,
    mode: "similarity" as const,
    embeddingModel: "synthetic-vectors",
    maxCalls: 1,
    oddPolicy: "trio" as const,
  };
  const firstSnapshot = app.store.freeze(round.id);
  const first = app.store.enqueue(firstSnapshot.id, "matching", config);
  const priorGroups = [people.slice(0, 2), people.slice(2)];
  const firstResult = {
    schemaVersion: 1,
    jobId: first.id,
    snapshot: { id: firstSnapshot.id, hash: first.snapshotHash },
    mode: "similarity",
    groups: priorGroups.map((group, i) => ({
      id: String(i),
      participantIds: group.map((person) => person.id),
      reviewRequired: false,
      sourceRefs: Object.fromEntries(
        firstSnapshot.contributions
          .filter((contribution) =>
            group.some((person) => person.id === contribution.participantId),
          )
          .map((contribution) => [
            contribution.participantId,
            [contribution.id],
          ]),
      ),
    })),
  };
  validateResult(first, firstSnapshot, firstResult);
  app.store.saveOperation({
    ...first,
    state: "succeeded",
    result: firstResult,
  });
  app.store.release(first.id, ["Table A", "Table B"], true);

  const nextRound = app.store.createRound(
    session.id,
    "Next question",
    "bounded",
  );
  for (const person of people)
    app.store.revise(session.id, person.id, {
      roundId: nextRound.id,
      requestId: randomUUID(),
      expectedRevision: 0,
      text: "Another synthetic contribution",
      confirmed: true,
      matching: true,
      source: "typed",
    });
  const nextSnapshot = app.store.freeze(nextRound.id);
  const next = app.store.enqueue(nextSnapshot.id, "matching", {
    ...config,
    avoidPrevious: true,
  });
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    json: async () => ({
      data: [0, 1, 2, 3].map((index) => ({
        index,
        embedding: [1, index + 1],
      })),
    }),
  }));
  const allocated = await modelExecutor(directory)(
    next,
    nextSnapshot,
    new AbortController().signal,
    () => {},
  );
  const request = JSON.parse(
    await readFile(
      join(directory, "matching", next.id, "request.json"),
      "utf8",
    ),
  );
  const previousPairs = priorGroups.map((group) =>
    group.map((person) => person.id).sort(),
  );
  expect(
    request.config.forbiddenPairs.map((pair: string[]) => pair.sort()),
  ).toEqual(previousPairs);
  expect(() => validateResult(next, nextSnapshot, allocated)).not.toThrow();
  expect(
    (allocated as { groups: { participantIds: string[] }[] }).groups.every(
      (group) =>
        !previousPairs.some(
          ([a, b]) =>
            a !== undefined &&
            b !== undefined &&
            group.participantIds.includes(a) &&
            group.participantIds.includes(b),
        ),
    ),
  ).toBe(true);
}, 15000);
