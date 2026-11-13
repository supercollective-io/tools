import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { startSessionServer } from "../src/session/server.ts";

const apps: Awaited<ReturnType<typeof startSessionServer>>[] = [];
const directories: string[] = [];
const token = "synthetic-operator-token-with-32-characters";
const draft = {
  mode: "bounded",
  prompt: "What should change?",
  model: {
    provider: "ollama",
    model: "synthetic-model",
    maxInputCharacters: 500_000,
    maxOutputTokens: 4096,
    timeoutMs: 360_000,
  },
};

async function start(
  directory: string,
  executor = vi.fn(async () => ({ text: "", sourceRefs: [] })),
) {
  const app = await startSessionServer({
    directory,
    port: 0,
    origin: "http://127.0.0.1:0",
    operatorToken: token,
    executor,
  });
  apps.push(app);
  return app;
}

async function request(
  app: Awaited<ReturnType<typeof startSessionServer>>,
  session: string,
  method: "GET" | "PUT",
  body?: unknown,
  operator = true,
) {
  const response = await fetch(
    `${app.origin}/api/operator/sessions/${session}/preparation`,
    {
      method,
      headers: {
        ...(method === "PUT"
          ? { Origin: app.origin, "Content-Type": "application/json" }
          : {}),
        ...(operator ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  return { response, body: await response.json() };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

it("keeps preparation private and draft-only, and recovers it after restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "polymind-preparation-"));
  directories.push(directory);
  const executor = vi.fn(async () => ({ text: "", sourceRefs: [] }));
  let app = await start(directory, executor);
  const session = app.store.createSession("Synthetic session", 20);

  expect(
    (await request(app, session.id, "GET", undefined, false)).response.status,
  ).toBe(401);
  expect((await request(app, session.id, "GET")).body).toBeNull();
  const saved = await request(app, session.id, "PUT", draft);
  expect(saved.response.status).toBe(200);
  expect(saved.body).toEqual(draft);
  expect(app.store.rounds(session.id)).toEqual([]);
  expect(app.store.show(session.id)).toMatchObject({ presentation: null });
  expect(executor).not.toHaveBeenCalled();

  await app.close();
  apps.splice(apps.indexOf(app), 1);
  app = await start(directory, executor);
  expect((await request(app, session.id, "GET")).body).toEqual(draft);
  const publicState = await fetch(
    `${app.origin}/api/projection?session=${session.id}`,
  ).then((response) => response.json());
  expect(JSON.stringify(publicState)).not.toContain("synthetic-model");
  expect(JSON.stringify(publicState)).not.toContain("What should change?");
  expect(executor).not.toHaveBeenCalled();
});

it("validates preparation and accepts only identical retries after a round exists", async () => {
  const directory = await mkdtemp(join(tmpdir(), "polymind-preparation-"));
  directories.push(directory);
  const app = await start(directory);
  const session = app.store.createSession("Synthetic session", 20);

  const invalid = await request(app, session.id, "PUT", {
    ...draft,
    model: { ...draft.model, maxOutputTokens: 99 },
  });
  expect(invalid.response.status).toBe(400);
  expect(
    await request(app, session.id, "GET").then((result) => result.body),
  ).toBeNull();

  expect((await request(app, session.id, "PUT", draft)).response.status).toBe(
    200,
  );
  app.store.createRound(session.id, draft.prompt, "bounded");
  expect((await request(app, session.id, "PUT", draft)).response.status).toBe(
    200,
  );
  const changed = {
    ...draft,
    prompt: "A different prompt",
  };
  expect((await request(app, session.id, "PUT", changed)).response.status).toBe(
    409,
  );
  expect((await request(app, session.id, "GET")).body).toEqual(draft);
});

it("requires the exact application origin for draft updates", async () => {
  const directory = await mkdtemp(join(tmpdir(), "polymind-preparation-"));
  directories.push(directory);
  const app = await start(directory);
  const session = app.store.createSession("Synthetic session", 20);
  const response = await fetch(
    `${app.origin}/api/operator/sessions/${session.id}/preparation`,
    {
      method: "PUT",
      headers: {
        Origin: "https://foreign.invalid",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(draft),
    },
  );
  expect(response.status).toBe(403);
  expect(app.store.preparation(session.id)).toBeNull();
});
