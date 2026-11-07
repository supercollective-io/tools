import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { readLiveRun } from "../src/live-runs.ts";
import { liveConfigSchema } from "../src/live-schema.ts";
import type { Generate } from "../src/models.ts";
import { startParticipation } from "../src/participation.ts";
import { ParticipationStore } from "../src/participation-store.ts";

const directories: string[] = [];
const apps: Awaited<ReturnType<typeof startParticipation>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "typed-test-"));
  directories.push(path);
  return path;
}
async function port() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}
async function fixture(path?: string, generated?: Generate) {
  const config = liveConfigSchema.parse(
    JSON.parse(await readFile("examples/live-projection.json", "utf8")),
  );
  config.composer = {
    provider: "ollama",
    model: "fixture",
    maxOutputTokens: 128,
    timeoutMs: 2000,
  };
  config.live.participants = config.composer;
  config.live.refreshIntervalMs = 100;
  config.live.feedbackIntervalMs = 100;
  const calls: string[] = [];
  const generate: Generate =
    generated ??
    (async ({ messages }, onToken) => {
      calls.push(JSON.stringify(messages));
      const text = "We can make room for another thought. ";
      await onToken(text);
      return { text, finishReason: "stop" };
    });
  const origin = `http://127.0.0.1:${await port()}`;
  const dir = path ?? (await directory());
  const app = await startParticipation({
    directory: dir,
    invitation: "What could we change?",
    config,
    origin,
    operatorPort: 0,
    generate,
    intervalMs: 20,
  });
  apps.push(app);
  const post = (
    route: string,
    data: unknown,
    cookie = "",
    customOrigin = origin,
  ) =>
    fetch(origin + route, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: customOrigin,
        Cookie: cookie,
      },
      body: JSON.stringify(data),
    });
  const joinPerson = async () => {
    const response = await post("/api/join", {
      token: new URL(app.joinUrl).hash.slice(1),
    });
    expect(response.status).toBe(200);
    return response.headers.get("set-cookie")?.split(";")[0] ?? "";
  };
  return { app, dir, origin, post, joinPerson, calls };
}
async function until(check: () => boolean) {
  await vi.waitFor(() => expect(check()).toBe(true), {
    timeout: 3000,
    interval: 20,
  });
}

it("saves participant-scoped submissions durably, slices Unicode and admits fairly", async () => {
  const path = join(await directory(), "inputs.sqlite");
  const run = randomUUID();
  let store = new ParticipationStore(path, run);
  const people = Array.from({ length: 6 }, () => store.join());
  const first = people[0];
  if (!first) throw new Error("Missing fixture participant");
  const id = randomUUID();
  for (const p of people) store.submit(p.id, id, "😀".repeat(900), 0);
  expect(store.submit(first.id, id, "😀".repeat(900), 0).duplicate).toBe(true);
  expect(() => store.submit(first.id, id, "changed", 0)).toThrow(
    "different content",
  );
  const batch = store.batch();
  expect(batch).toHaveLength(4);
  expect(new Set(batch.map((c) => c.participant)).size).toBe(4);
  expect(Array.from(batch[0]?.text ?? "").length).toBe(501);
  for (const c of batch) store.admitted(c.id, c.position);
  expect(
    store
      .batch()
      .slice(0, 2)
      .map((c) => c.participant),
  ).toEqual(people.slice(4).map((p) => p.id));
  store.close();
  store = new ParticipationStore(path, run);
  expect(store.identify(first.credential)).toBe(first.id);
  expect(store.submit(first.id, id, "😀".repeat(900), 0).duplicate).toBe(true);
  store.close();
});

it("joins eight clients, composes only after Start, accepts replies, and isolates operator controls", async () => {
  const f = await fixture();
  expect((await fetch(`${f.origin}/api/state`)).status).toBe(401);
  expect((await f.post("/api/join", { token: "wrong" })).status).toBe(403);
  const cookies = await Promise.all(
    Array.from({ length: 8 }, () => f.joinPerson()),
  );
  expect(f.app.log.state.participants).toHaveLength(8);
  expect(f.calls).toHaveLength(0);
  const id = randomUUID();
  const payload = {
    id,
    text: "Keep this particular local place open. 😀",
    contextOffset: 0,
  };
  const [one, two] = await Promise.all([
    f.post("/api/submit", payload, cookies[0]),
    f.post("/api/submit", payload, cookies[0]),
  ]);
  expect(one.status).toBe(200);
  expect(two.status).toBe(200);
  expect((await two.json()).duplicate).toBe(true);
  expect(
    (
      await f.post(
        "/api/submit",
        payload,
        cookies[0],
        "http://attacker.invalid",
      )
    ).status,
  ).toBe(403);
  for (const cookie of cookies.slice(1))
    expect(
      (
        await f.post(
          "/api/submit",
          {
            id: randomUUID(),
            text: "Another specific concern.",
            contextOffset: 0,
          },
          cookie,
        )
      ).status,
    ).toBe(200);
  expect(f.calls).toHaveLength(0);
  expect((await f.post("/api/end", {}, cookies[0])).status).toBe(404);
  const state = await (
    await fetch(`${f.origin}/api/state`, {
      headers: { Cookie: cookies[0] ?? "" },
    })
  ).json();
  expect(Object.keys(state).sort()).toEqual([
    "contribution",
    "invitation",
    "runId",
    "status",
  ]);
  const qr = await fetch(`${f.app.operatorUrl}/join.svg`);
  expect(qr.status).toBe(200);
  expect(await qr.text()).toContain("<svg");
  await f.app.controller.start();
  await until(
    () =>
      f.app.log.state.participants.every((p) => p.text.length > 0) &&
      f.app.log.state.publishedOffset > 0,
  );
  expect(
    f.calls.every((call) => !call.includes("Private starting context")),
  ).toBe(true);
  const offset = f.app.log.state.publishedOffset;
  await f.app.controller.pause();
  const saved = await f.post(
    "/api/submit",
    {
      id: randomUUID(),
      text: "That is not quite what I meant.",
      contextOffset: offset,
    },
    cookies[0],
  );
  expect(saved.status).toBe(200);
  await f.app.controller.start();
  await until(
    () => f.app.log.state.participants[0]?.text.includes("not quite") ?? false,
  );
  await f.app.controller.end();
  expect((await f.post("/api/submit", payload, cookies[0])).status).toBe(200);
  expect(
    (
      await f.post(
        "/api/submit",
        { id: randomUUID(), text: "Too late", contextOffset: offset },
        cookies[0],
      )
    ).status,
  ).toBe(410);
  const history = await readLiveRun(f.app.runPath);
  expect(
    history.events.filter(
      (e) => e.event.type === "input.admitted" && e.event.id.includes(id),
    ),
  ).toHaveLength(1);
});

it("recovers acknowledged but queued input after restart without auto-start or double admission", async () => {
  const f = await fixture();
  const cookie = await f.joinPerson();
  const id = randomUUID();
  const payload = { id, text: "A saved contribution", contextOffset: 0 };
  expect((await f.post("/api/submit", payload, cookie)).status).toBe(200);
  await f.app.close();
  apps.splice(apps.indexOf(f.app), 1);
  const resumed = await fixture(f.dir);
  expect(resumed.app.log.state.status).not.toBe("running");
  expect(resumed.calls).toHaveLength(0);
  expect((await resumed.post("/api/submit", payload, cookie)).status).toBe(200);
  await resumed.app.controller.start();
  await until(() => resumed.app.log.state.admittedIds.length === 1);
  // Simulate a crash after journal append but before SQLite records admission.
  resumed.app.store.db.exec("UPDATE chunks SET admitted=0");
  await until(() => resumed.app.store.batch().length === 0);
  expect(resumed.app.log.state.admittedIds).toHaveLength(1);
  expect(resumed.app.log.state.participants[0]?.text).toBe(
    "\nA saved contribution",
  );
});

it("does not acknowledge failed saves or expose raw storage errors", async () => {
  const f = await fixture();
  const cookie = await f.joinPerson();
  vi.spyOn(f.app.store, "submit").mockImplementationOnce(() => {
    throw new Error("SQLITE SECRET_PRIVATE_PATH");
  });
  const result = await f.post(
    "/api/submit",
    { id: randomUUID(), text: "Save me", contextOffset: 0 },
    cookie,
  );
  expect(result.status).toBe(409);
  expect(await result.text()).not.toContain("SECRET");
  expect(f.app.store.batch()).toHaveLength(0);
});

it("continually replaces source text, coalesces queued edits, preserves retries and supports deletion", async () => {
  const f = await fixture();
  const cookie = await f.joinPerson();
  const update = (revision: number, text: string) =>
    f.post("/api/contribution", { revision, text }, cookie);
  expect((await update(1, "We need a lib")).status).toBe(200);
  expect((await update(2, "We need a library")).status).toBe(200);
  expect((await update(2, "We need a library")).status).toBe(200);
  expect((await update(2, "different")).status).toBe(409);
  expect((await update(4, "out of order")).status).toBe(409);
  expect(f.app.store.batch()).toHaveLength(1);
  await f.app.controller.start();
  await until(
    () => f.app.log.state.participants[0]?.text === "We need a library",
  );
  expect((await update(3, "We need paid library staff")).status).toBe(200);
  await until(
    () =>
      f.app.log.state.participants[0]?.text === "We need paid library staff",
  );
  await f.app.controller.pause();
  expect((await update(4, "")).status).toBe(200);
  await f.app.close();
  apps.splice(apps.indexOf(f.app), 1);
  const resumed = await fixture(f.dir);
  expect(resumed.app.store.batch()[0]?.text).toBe("");
  await resumed.app.controller.start();
  await until(() => resumed.app.log.state.participants[0]?.text === "");
  resumed.app.store.db.exec("UPDATE revision_heads SET admitted=0");
  await until(() => resumed.app.store.batch().length === 0);
  const history = await readLiveRun(resumed.app.runPath);
  expect(
    history.events.filter((e) => e.event.type === "input.revised"),
  ).toHaveLength(3);
  const response = await fetch(`${resumed.origin}/api/state`, {
    headers: { Cookie: cookie },
  });
  const state = await response.json();
  expect(state.contribution).toEqual({ revision: 4, text: "" });
  expect(state).not.toHaveProperty("text");
  await resumed.app.controller.end();
  expect(
    (await resumed.post("/api/contribution", { revision: 4, text: "" }, cookie))
      .status,
  ).toBe(200);
  expect(
    (
      await resumed.post(
        "/api/contribution",
        { revision: 5, text: "late" },
        cookie,
      )
    ).status,
  ).toBe(410);
});
