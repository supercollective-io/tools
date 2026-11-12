import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  buildAtlas,
  publicAtlas,
  validateAtlas,
} from "../src/session/atlas.ts";
import type { AnalysisV2, OperationConfig } from "../src/session/contracts.ts";
import { embedTexts } from "../src/session/embeddings.ts";
import { JobRunner, modelExecutor } from "../src/session/jobs.ts";
import { startSessionServer } from "../src/session/server.ts";
import { SessionStore } from "../src/session/store.ts";

const dirs: string[] = [];
const stores: SessionStore[] = [];
const apps: Awaited<ReturnType<typeof startSessionServer>>[] = [];
const config: OperationConfig = {
  model: {
    provider: "openai",
    model: "synthetic",
    maxOutputTokens: 1000,
    timeoutMs: 10000,
  },
  promptVersion: "analysis-v2",
  maxInputCharacters: 100000,
};
const atlasConfig: OperationConfig = {
  ...config,
  promptVersion: "bounded-v1",
  embeddingModel: "synthetic-embedding",
  maxCalls: 1,
};
const vectors = [
  [1, 0, 0],
  [0.9, 0.1, 0],
  [0, 0, 1],
];
async function folder() {
  const path = await mkdtemp(join(tmpdir(), "atlas-test-"));
  dirs.push(path);
  return path;
}
function fixture(store: SessionStore) {
  const session = store.createSession("Synthetic atlas", 10),
    round = store.createRound(session.id, "What could we change?", "bounded");
  for (const text of [
    "A shared repair workshop.",
    "Tools that we can borrow together.",
    "I need some quiet.",
  ]) {
    const person = store.join(session.id, "Synthetic participant").participant;
    store.revise(session.id, person.id, {
      roundId: round.id,
      requestId: randomUUID(),
      expectedRevision: 0,
      text,
      confirmed: true,
      matching: true,
      source: "typed",
    });
  }
  const frozen = store.freeze(round.id),
    { snapshot, hash } = store.snapshot(frozen.id);
  const refs = snapshot.contributions.slice(0, 2).map((c) => c.id);
  const analysis: AnalysisV2 = {
    version: "analysis-v2",
    commonGround: [
      {
        id: "shared-tools",
        title: "Shared tools",
        text: "A place to share repair tools.",
        sourceRefs: refs,
      },
    ],
    differences: [],
    questions: [],
    otherConcerns: [],
  };
  const op = store.enqueue(snapshot.id, "analysis", config);
  store.completeOperation(op.id, analysis);
  return { session, snapshot, hash, analysis, op };
}
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(apps.splice(0).map((a) => a.close()));
  for (const s of stores.splice(0)) s.close();
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

it("keeps isolated contributions, builds only evidenced similarities and rejects wrong provenance", async () => {
  const store = new SessionStore(join(await folder(), "state.sqlite"));
  stores.push(store);
  const { snapshot, hash, analysis } = fixture(store);
  const atlas = buildAtlas(snapshot, hash, "synthetic-embedding", vectors);
  expect(atlas.nodes).toHaveLength(3);
  expect(atlas.links).toHaveLength(1);
  expect(buildAtlas(snapshot, hash, "synthetic-embedding", vectors)).toEqual(
    atlas,
  );
  expect(() =>
    validateAtlas(
      { ...atlas, snapshotHash: "wrong" },
      snapshot,
      hash,
      "synthetic-embedding",
    ),
  ).toThrow();
  expect(() =>
    validateAtlas(
      { ...atlas, links: [...atlas.links, ...atlas.links] },
      snapshot,
      hash,
      "synthetic-embedding",
    ),
  ).toThrow();
  expect(() =>
    buildAtlas(snapshot, hash, "synthetic", [[0], [1], [1]]),
  ).toThrow();
  const projected = publicAtlas(atlas, snapshot, analysis);
  expect(projected.findings[0]?.sourceRefs).toEqual(["c1", "c2"]);
  expect(projected.nodes.map((n) => n.id)).toEqual(["c1", "c2", "c3"]);
  for (const c of snapshot.contributions) {
    expect(JSON.stringify(projected)).not.toContain(c.id);
    expect(JSON.stringify(projected)).not.toContain(c.participantId);
  }
});

it("caches provider embeddings for retries, separates model/input and rejects malformed vectors", async () => {
  const directory = await folder(),
    signal = new AbortController().signal;
  const provider = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [0, 1] },
            { index: 0, embedding: [1, 0] },
          ],
        }),
      ),
  );
  vi.stubGlobal("fetch", provider);
  expect(
    await embedTexts(
      directory,
      ["Synthetic A", "Synthetic B"],
      "model-a",
      signal,
    ),
  ).toEqual([
    [1, 0],
    [0, 1],
  ]);
  await embedTexts(
    directory,
    ["Synthetic A", "Synthetic B"],
    "model-a",
    signal,
  );
  expect(provider).toHaveBeenCalledTimes(1);
  await embedTexts(
    directory,
    ["Synthetic A", "Synthetic B"],
    "model-b",
    signal,
  );
  expect(provider).toHaveBeenCalledTimes(2);
  provider.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          data: [
            { index: 0, embedding: [0, 0] },
            { index: 1, embedding: [1, 0] },
          ],
        }),
      ),
  );
  await expect(
    embedTexts(directory, ["Changed", "Synthetic B"], "model-b", signal),
  ).rejects.toThrow();
});

it("runs an atlas independently through the recoverable job runner without a language-model call", async () => {
  const directory = await folder(),
    store = new SessionStore(join(directory, "state.sqlite"));
  stores.push(store);
  const { snapshot } = fixture(store);
  const op = store.enqueue(snapshot.id, "atlas", atlasConfig);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: vectors.map((embedding, index) => ({ index, embedding })),
          }),
        ),
    ),
  );
  await embedTexts(
    directory,
    snapshot.contributions.map((c) => c.text),
    "synthetic-embedding",
    new AbortController().signal,
  );
  store.saveOperation({ ...op, state: "running" });
  store.close();
  stores.pop();
  const recovered = new SessionStore(join(directory, "state.sqlite"));
  stores.push(recovered);
  expect(recovered.operation(op.id).state).toBe("interrupted");
  recovered.retry(op.id);
  const model = vi.fn();
  const runner = new JobRunner(recovered, modelExecutor(directory, model));
  runner.start(op.id);
  await runner.idle();
  expect(recovered.operation(op.id).state).toBe("succeeded");
  expect(recovered.operation(op.id).published).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(model).not.toHaveBeenCalled();
});

it("requires explicit source publication, protects HTTP payloads, and validates selected snapshots", async () => {
  const token = "synthetic-atlas-operator-token-32-characters";
  const app = await startSessionServer({
    directory: await folder(),
    port: 0,
    origin: "http://127.0.0.1:0",
    operatorToken: token,
  });
  apps.push(app);
  const { store, origin } = app,
    { session, snapshot, hash, op } = fixture(store);
  const atlas = store.enqueue(snapshot.id, "atlas", atlasConfig);
  store.completeOperation(
    atlas.id,
    buildAtlas(snapshot, hash, "synthetic-embedding", vectors),
  );
  store.publish(op.id);
  const post = async (path: string, data: unknown, authorised = true) =>
    fetch(`${origin}${path}?session=${session.id}`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(authorised ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });
  const projected = async () =>
    await (
      await fetch(`${origin}/api/projection?session=${session.id}`)
    ).json();
  const selection = {
    kind: "analysis",
    operationId: op.id,
    atlasOperationId: atlas.id,
    atlasView: { mode: "atlas", findingId: "shared-tools", page: 0 },
  };
  expect((await post("/api/operator/presentation", selection)).status).toBe(
    409,
  );
  expect(
    (await post("/api/operator/job", { id: atlas.id, action: "publish" }))
      .status,
  ).toBe(400);
  expect(
    (
      await post(
        "/api/operator/atlas-publish",
        { id: atlas.id, reviewed: true },
        false,
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await post("/api/operator/atlas-publish", {
        id: atlas.id,
        reviewed: false,
      })
    ).status,
  ).toBe(409);
  expect(JSON.stringify(await projected())).not.toContain(
    snapshot.contributions[0]?.text,
  );
  expect(
    (
      await post("/api/operator/atlas-publish", {
        id: atlas.id,
        reviewed: true,
      })
    ).status,
  ).toBe(200);
  expect((await post("/api/operator/presentation", selection)).status).toBe(
    200,
  );
  const result = await projected();
  expect(result.presentation.atlas.nodes).toHaveLength(3);
  expect(result.results).toHaveLength(1);
  for (const c of snapshot.contributions)
    expect(JSON.stringify(result)).not.toContain(c.participantId);
  expect(
    (
      await post("/api/operator/presentation", {
        ...selection,
        atlasView: { mode: "atlas", findingId: "unknown" },
      })
    ).status,
  ).toBe(400);
  const other = fixture(store);
  expect(
    (
      await post("/api/operator/presentation", {
        ...selection,
        atlasOperationId: other.op.id,
      })
    ).status,
  ).toBe(409);
  await post("/api/operator/presentation", {
    kind: "analysis",
    operationId: op.id,
  });
  expect(JSON.stringify(await projected())).not.toContain(
    snapshot.contributions[0]?.text,
  );
});
