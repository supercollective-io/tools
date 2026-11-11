import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { Agent, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as nextTurn } from "node:timers/promises";
import { startSessionServer } from "../dist/session/server.js";

const count = Number(process.argv[2] ?? 140);
const rounds = Number(process.argv[3] ?? 20);
if (!Number.isInteger(count) || count < 2 || count > 180)
  throw new Error("Use 2–180 synthetic clients.");
if (!Number.isInteger(rounds) || rounds < 2 || rounds > 200)
  throw new Error("Use 2–200 save rounds (default 20).");
const directory = await mkdtemp(join(tmpdir(), "polymind-load-"));
const port = 35000 + Math.floor(Math.random() * 10000);
const origin = `http://127.0.0.1:${port}`;
const token = "synthetic-load-operator-token-with-32-characters";
const options = { directory, port, origin, operatorToken: token };
const started = performance.now();
const samples = Object.create(null);
const statusCounts = Object.create(null);
const errors = [];
const sockets = new Set();
const clients = [];
let app;
let requests = 0;
let reusedRequests = 0;
let inFlight = 0;
let maxInFlight = 0;
let savesInFlight = 0;
let maxConcurrentSaves = 0;
let phase = "startup";
let session;
let round;

function agent() {
  return new Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1 });
}
function client(index, operator = false) {
  const result = { index, agent: agent(), operator, cookie: "", revision: 0 };
  clients.push(result);
  return result;
}
function distribution(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const percentile = (fraction) =>
    ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)];
  const rounded = (value) => Math.round(value * 100) / 100;
  return {
    samples: ordered.length,
    p50Ms: rounded(percentile(0.5)),
    p95Ms: rounded(percentile(0.95)),
    maxMs: rounded(ordered.at(-1)),
  };
}
async function together(tasks) {
  // Drain the batch before shutdown, including when one request fails.
  const outcomes = await Promise.allSettled(tasks);
  const failures = outcomes.filter((result) => result.status === "rejected");
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      `${phase}: ${failures.length} request(s) failed; no automatic retries`,
    );
  return outcomes.map((result) => result.value);
}
function call(person, path, body, kind, accepted = [200]) {
  const time = performance.now();
  const payload = body === undefined ? undefined : JSON.stringify(body);
  requests++;
  inFlight++;
  maxInFlight = Math.max(maxInFlight, inFlight);
  if (kind === "save") {
    savesInFlight++;
    maxConcurrentSaves = Math.max(maxConcurrentSaves, savesInFlight);
  }
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      inFlight--;
      if (kind === "save") savesInFlight--;
      if (error) {
        errors.push({
          phase,
          kind,
          code: error.code ?? "protocol",
          message: error.message,
        });
        reject(error);
      } else {
        samples[kind] ??= [];
        samples[kind].push(performance.now() - time);
        resolve(value);
      }
    };
    const request = httpRequest(
      `${origin}${path}`,
      {
        method: payload === undefined ? "GET" : "POST",
        agent: person.agent,
        headers: {
          Origin: origin,
          Cookie: person.cookie,
          ...(person.operator ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("error", (error) => finish(error));
        response.on("end", () => {
          const status = response.statusCode;
          statusCounts[status] = (statusCounts[status] ?? 0) + 1;
          if (request.reusedSocket) reusedRequests++;
          try {
            const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!accepted.includes(status)) {
              const error = new Error(
                `Unexpected HTTP ${status}: ${value.error ?? "request rejected"}`,
              );
              error.code = `HTTP_${status}`;
              throw error;
            }
            finish(null, {
              status,
              value,
              cookie: response.headers["set-cookie"]?.[0]?.split(";")[0],
            });
          } catch (error) {
            finish(error);
          }
        });
      },
    );
    request.on("socket", (socket) => sockets.add(socket));
    request.on("error", (error) => finish(error));
    request.setTimeout(15000, () =>
      request.destroy(new Error("HTTP request timed out")),
    );
    request.end(payload);
  });
}
function route(path) {
  return `${path}?session=${session.id}`;
}
async function warm(people, kind = "warmup") {
  // macOS can reset a burst larger than its listen backlog. Establish persistent
  // connections separately; the measured save rounds still issue all 140 at once.
  for (let offset = 0; offset < people.length; offset += 40)
    await together(
      people
        .slice(offset, offset + 40)
        .map((person) => call(person, "/healthz", undefined, kind)),
    );
  await nextTurn();
}
async function databaseSize() {
  const names = [
    "sessions.sqlite",
    "sessions.sqlite-wal",
    "sessions.sqlite-shm",
  ];
  const sizes = await Promise.all(
    names.map(async (name) => {
      try {
        return (await stat(join(directory, name))).size;
      } catch (error) {
        if (error.code === "ENOENT") return 0;
        throw error;
      }
    }),
  );
  return {
    databaseBytes: sizes[0],
    walBytes: sizes[1],
    shmBytes: sizes[2],
    totalBytes: sizes.reduce((a, b) => a + b, 0),
  };
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function replaceConnection(person) {
  person.agent.destroy();
  person.agent = agent();
}

try {
  app = await startSessionServer(options);
  session = app.store.createSession(
    "SYNTHETIC LOAD — not audience data",
    Math.min(count, 140),
  );
  round = app.store.createRound(
    session.id,
    "Synthetic test question",
    "bounded",
  );
  const operator = client(-1, true);
  const people = Array.from({ length: count }, (_, index) => client(index));
  const initialSize = await databaseSize();
  phase = "warm persistent connections";
  console.error(`load stage: ${phase} (batches of 40)`);
  const warmStarted = performance.now();
  await warm(people);
  const warmupMs = performance.now() - warmStarted;
  phase = "join";
  console.error(
    `load stage: ${phase} (${count} simultaneous requests, no retries)`,
  );
  const joinStarted = performance.now();
  const guests = await together(
    people.map((person) =>
      call(
        person,
        route("/api/join"),
        { name: `Synthetic ${person.index}` },
        "join",
        [201, 409],
      ),
    ),
  );
  const admitted = [],
    rejected = [];
  guests.forEach((guest, index) => {
    const person = people[index];
    if (guest.status === 409) rejected.push(person);
    else {
      assert(
        guest.cookie && guest.value.participant?.id,
        "Successful join omitted its credential or participant ID.",
      );
      person.cookie = guest.cookie;
      person.id = guest.value.participant.id;
      admitted.push(person);
    }
  });
  assert(
    admitted.length === session.capacity &&
      rejected.length === count - session.capacity,
    "Unexpected capacity outcome.",
  );
  assert(
    new Set(admitted.map((person) => person.id)).size === admitted.length,
    "Duplicate participant identities.",
  );
  const joinMs = performance.now() - joinStarted;
  const setupMs = performance.now() - started;
  const acknowledgements = [];
  const disconnectCount = Math.max(1, Math.floor(admitted.length / 5));
  const reconnecting = new Set(admitted.slice(0, disconnectCount));
  const loadStarted = performance.now();

  async function save(person, iteration) {
    const body = {
      roundId: round.id,
      requestId: randomUUID(),
      expectedRevision: person.revision,
      text: `Synthetic contribution ${person.index}, revision ${iteration + 1}. ${"We are testing private storage and shared spaces. ".repeat(4)}🪴`,
      confirmed: true,
      matching: true,
      source: "typed",
    };
    const response = await call(
      person,
      route("/api/contribution"),
      body,
      "save",
    );
    assert(
      response.value.participantId === person.id &&
        response.value.revision === person.revision + 1 &&
        response.value.text === body.text &&
        response.value.source === "typed" &&
        response.value.confirmed &&
        response.value.matching,
      "Save acknowledgement differs from the submitted contribution.",
    );
    person.revision++;
    person.lastRequest = body;
    person.lastAcknowledgement = response.value;
    person.firstRequest ??= body;
    person.firstAcknowledgement ??= response.value;
    acknowledgements.push(response.value);
  }
  async function duplicate(person, first = false) {
    const body = first ? person.firstRequest : person.lastRequest;
    const expected = first
      ? person.firstAcknowledgement
      : person.lastAcknowledgement;
    const result = await call(
      person,
      route("/api/contribution"),
      body,
      "duplicate",
    );
    assert(
      JSON.stringify(result.value) === JSON.stringify(expected),
      "Duplicate request changed the saved acknowledgement.",
    );
  }

  phase = "simultaneous persistent saves";
  console.error(
    `load stage: ${phase} (${admitted.length} clients × ${rounds} rounds)`,
  );
  let reconnectMs;
  for (let iteration = 0; iteration < rounds; iteration++) {
    if (iteration === Math.floor(rounds / 2)) {
      phase = "20% connection replacement while remaining clients save";
      const reconnectStarted = performance.now();
      // Drop only known idle connections, before their next write. Initial joins
      // are never retried; no unknown mutation is reported as an acknowledged save.
      const continuing = admitted
        .filter((person) => !reconnecting.has(person))
        .map((person) => save(person, iteration));
      const returning = [...reconnecting].map(async (person) => {
        replaceConnection(person);
        await call(person, "/healthz", undefined, "activeReconnectWarmup");
        const rejoined = await call(
          person,
          route("/api/join"),
          { name: `Synthetic ${person.index}` },
          "rejoin",
        );
        assert(
          rejoined.value.participant?.id === person.id,
          "Reconnecting client lost its existing identity.",
        );
        await save(person, iteration);
      });
      await together([...continuing, ...returning]);
      reconnectMs = performance.now() - reconnectStarted;
      phase = "simultaneous persistent saves";
    } else await together(admitted.map((person) => save(person, iteration)));
    if (iteration === 0)
      await together(admitted.map((person) => duplicate(person)));
  }
  const loadMs = performance.now() - loadStarted;
  assert(
    maxConcurrentSaves === admitted.length,
    "The trial never issued one simultaneous save per admitted client.",
  );
  const loadedSize = await databaseSize();
  assert(
    app.store.participants(session.id).length === admitted.length,
    "Reconnect created an extra participant.",
  );
  assert(
    app.store.db.prepare("SELECT count(*) AS n FROM voice_runs").get().n ===
      0 && app.store.operations(session.id).length === 0,
    "The load trial unexpectedly created voice or model operations.",
  );
  phase = "freeze";
  const frozen = await call(
    operator,
    route("/api/operator/freeze"),
    { roundId: round.id },
    "freeze",
  );
  const snapshot = frozen.value;
  assert(
    snapshot.eligible.length === admitted.length &&
      snapshot.contributions.length === admitted.length &&
      snapshot.contributions.every(
        (item) => item.source === "typed" && item.revision === rounds,
      ),
    "Frozen snapshot lost eligible input or source provenance.",
  );

  phase = "restart and credential recovery";
  console.error(`load stage: ${phase}`);
  const restartStarted = performance.now();
  for (const person of clients) replaceConnection(person);
  await app.close();
  app = undefined;
  app = await startSessionServer(options);
  await warm(admitted, "restartWarmup");
  await together(
    admitted.map(async (person) => {
      const state = await call(
        person,
        route("/api/state"),
        undefined,
        "restartRead",
      );
      assert(
        state.value.participant?.id === person.id &&
          JSON.stringify(state.value.contribution) ===
            JSON.stringify(person.lastAcknowledgement),
        "HTTP identity or acknowledged contribution was lost across restart.",
      );
      const rejoined = await call(
        person,
        route("/api/join"),
        { name: `Synthetic ${person.index}` },
        "rejoin",
      );
      assert(
        rejoined.value.participant?.id === person.id,
        "Same-credential rejoin created a new identity.",
      );
      await duplicate(person);
      await duplicate(person, true);
    }),
  );
  const restartMs = performance.now() - restartStarted;
  assert(
    app.store.participants(session.id).length === admitted.length,
    "Participant count changed after restart/rejoin.",
  );
  const saved = app.store.db
    .prepare("SELECT body FROM revisions")
    .all()
    .map((row) => JSON.parse(row.body));
  const savedById = new Map(
    saved.map((value) => [value.id, JSON.stringify(value)]),
  );
  assert(
    saved.length === admitted.length * rounds &&
      acknowledgements.every(
        (value) => savedById.get(value.id) === JSON.stringify(value),
      ),
    "An acknowledged revision was lost or a duplicate created an extra revision.",
  );
  assert(
    JSON.stringify(app.store.snapshot(snapshot.id).snapshot) ===
      JSON.stringify(snapshot),
    "Frozen snapshot changed across restart.",
  );
  const afterRestartSize = await databaseSize();
  const saveStats = distribution(samples.save);
  const result = {
    synthetic: true,
    transport:
      "loopback HTTP with one persistent node:http Agent/socket per client",
    participants: count,
    capacity: session.capacity,
    admitted: admitted.length,
    overloadRejected: rejected.length,
    rounds,
    acknowledgedRevisions: acknowledgements.length,
    maxConcurrentSaves,
    maxConcurrentRequests: maxInFlight,
    setup: {
      warmupBatchSize: 40,
      warmupMs: Math.round(warmupMs),
      joinMs: Math.round(joinMs),
      totalMs: Math.round(setupMs),
      join: distribution(samples.join),
    },
    loadMs: Math.round(loadMs),
    saves: saveStats,
    p50SaveMs: saveStats.p50Ms,
    p95SaveMs: saveStats.p95Ms,
    duplicateRequests: samples.duplicate.length,
    duplicatesVerified: true,
    reconnect: {
      clients: disconnectCount,
      percentage: Math.round((disconnectCount / admitted.length) * 100),
      whileOtherClientsSave: true,
      interruptsInFlightWrites: false,
      durationMs: Math.round(reconnectMs),
      identityAndSavesVerified: true,
    },
    restart: {
      durationMs: Math.round(restartMs),
      sameCredentialsRejoined: admitted.length,
      allAcknowledgedRevisionsVerified: true,
      frozenSnapshotVerified: true,
    },
    restartVerified: true,
    requests,
    responsesByStatus: statusCounts,
    errors,
    automaticRetries: 0,
    persistentSocketReuses: reusedRequests,
    socketsOpened: sockets.size,
    database: {
      before: initialSize,
      afterLoad: loadedSize,
      afterRestart: afterRestartSize,
      growthBytes: loadedSize.totalBytes - initialSize.totalBytes,
    },
    sqliteWalBytes: loadedSize.walBytes,
    durationMs: Math.round(performance.now() - started),
    providerCalls: 0,
  };
  console.log(JSON.stringify(result, null, 2));
  if (saveStats.p95Ms > 2000)
    throw new Error("p95 save acknowledgement exceeded provisional 2 s gate.");
} catch (error) {
  console.error(
    JSON.stringify({
      synthetic: true,
      status: "failed",
      phase,
      requests,
      errors,
      responsesByStatus: statusCounts,
      automaticRetries: 0,
    }),
  );
  throw error;
} finally {
  for (const person of clients) person.agent.destroy();
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
