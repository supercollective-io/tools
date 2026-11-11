import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { digest } from "../src/session/contracts.ts";
import { RecordingQueue, type Transcribe } from "../src/session/recordings.ts";
import { startSessionServer } from "../src/session/server.ts";
import { SessionStore } from "../src/session/store.ts";

const failedAudioRemovals = vi.hoisted(() => new Set<string>());
const delayedAudioRemovals = vi.hoisted(() => new Set<string>());
const releaseAudioRemovals = vi.hoisted(
  () => new Map<string, (() => void)[]>(),
);
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  const remove: typeof actual.rm = async (path, options) => {
    if (delayedAudioRemovals.has(String(path))) {
      await new Promise<void>((resolve) => {
        const releases = releaseAudioRemovals.get(String(path)) ?? [];
        releases.push(resolve);
        releaseAudioRemovals.set(String(path), releases);
      });
    }
    if (failedAudioRemovals.has(String(path)))
      throw Object.assign(new Error("Synthetic audio cleanup unavailable"), {
        code: "EACCES",
      });
    return actual.rm(path, options);
  };
  return { ...actual, rm: remove };
});

const directories: string[] = [];
const stores = new Set<SessionStore>();
const queues = new Set<RecordingQueue>();
const servers = new Set<Awaited<ReturnType<typeof startSessionServer>>>();

async function directory() {
  const path = await mkdtemp(join(tmpdir(), "polymind-recordings-"));
  directories.push(path);
  return path;
}
async function setup(transcribe?: Transcribe) {
  const dir = await directory();
  const store = new SessionStore(join(dir, "recordings.sqlite"));
  stores.add(store);
  const session = store.createSession("Synthetic recording rehearsal", 140);
  const round = store.createRound(
    session.id,
    "What could we change?",
    "bounded",
  );
  const participant = store.join(
    session.id,
    "Synthetic participant",
  ).participant;
  const queue = new RecordingQueue(store, dir, transcribe);
  queues.add(queue);
  return { dir, store, session, round, participant, queue };
}
async function until(check: () => boolean | Promise<boolean>, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > deadline)
      throw new Error("Synthetic recording condition did not settle");
    await pause(5);
  }
}
function recordingStates(store: SessionStore) {
  return store.db
    .prepare("SELECT body FROM recordings")
    .all()
    .map(
      (row) =>
        JSON.parse(row.body as string) as {
          state: string;
          participant: string;
        },
    );
}
function webm() {
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    Buffer.alloc(200, 17),
  ]);
}
function oneMinuteSyntheticWav() {
  // PCM-shaped synthetic bytes: 60 s, 16 kHz, mono, 16 bits. The fake provider
  // does not decode this media; this does not establish device/audio validity.
  const bytes = Buffer.alloc(44 + 60 * 16000 * 2, 17);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24);
  bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
function pendingTranscription() {
  const releases: (() => void)[] = [];
  const transcribe = vi.fn<Transcribe>(
    (_bytes, _mime, signal) =>
      new Promise((resolve, reject) => {
        const aborted = () =>
          reject(new Error("Synthetic cancelled provider detail"));
        signal.addEventListener("abort", aborted, { once: true });
        if (signal.aborted) aborted();
        releases.push(() => {
          signal.removeEventListener("abort", aborted);
          resolve("Synthetic transcript to review.");
        });
      }),
  );
  return { transcribe, releases };
}
function saveSeed(
  store: SessionStore,
  participant: string,
  round: string,
  id: string,
  state: string,
  createdAt = new Date().toISOString(),
) {
  store.saveRecording(id, participant, round, {
    id,
    participant,
    round,
    state,
    createdAt,
    mime: "audio/webm",
    hash: digest(webm().toString("base64")),
  });
}

afterEach(async () => {
  failedAudioRemovals.clear();
  delayedAudioRemovals.clear();
  for (const releases of releaseAudioRemovals.values())
    for (const release of releases) release();
  releaseAudioRemovals.clear();
  for (const app of servers) await app.close();
  servers.clear();
  for (const queue of queues) await queue.close();
  queues.clear();
  for (const store of stores) store.close();
  stores.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("bounded recording queue", () => {
  it("drains a 140-person synthetic one-minute upload burst with at most four provider calls active", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let active = 0,
      highWater = 0;
    let releaseFirst: (() => void) | undefined;
    const firstBatch = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const transcribe = vi.fn<Transcribe>(async (bytes, mime, signal) => {
      active += 1;
      highWater = Math.max(highWater, active);
      try {
        expect(mime).toBe("audio/wav");
        expect(bytes.length).toBe(1920044);
        await Promise.race([
          firstBatch,
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new Error("Synthetic cancelled")),
              { once: true },
            );
          }),
        ]);
        await pause(2);
        return "Synthetic full authorised transcript, awaiting participant review.";
      } finally {
        active -= 1;
      }
    });
    const { queue, store, session, round, participant, dir } =
      await setup(transcribe);
    const people = [
      participant,
      ...Array.from(
        { length: 139 },
        (_, i) =>
          store.join(session.id, `Synthetic person ${i + 1}`).participant,
      ),
    ];
    const bytes = oneMinuteSyntheticWav();
    const uploads = people.map((person) => ({ person, id: randomUUID() }));
    await Promise.all(
      uploads.map(({ person, id }) =>
        queue.upload(session.id, person.id, round.id, id, "audio/wav", bytes),
      ),
    );
    await until(() => transcribe.mock.calls.length === 4);
    expect(active).toBe(4);
    expect(recordingStates(store)).toHaveLength(140);
    releaseFirst?.();
    await until(
      () =>
        recordingStates(store).filter((r) => r.state === "succeeded").length ===
        4,
    );
    while (recordingStates(store).some((r) => r.state !== "succeeded")) {
      await vi.advanceTimersByTimeAsync(1000);
      // Give real filesystem completions a turn: saving a success precedes
      // removing its audio file and releasing that queue slot.
      await pause(5);
    }
    expect(highWater).toBe(4);
    expect(transcribe).toHaveBeenCalledTimes(140);
    await until(
      async () => !(await readdir(dir)).some((name) => name.endsWith(".audio")),
    );
    for (const { person, id } of uploads) {
      expect(store.recording(person.id, id)).toMatchObject({
        participant: person.id,
        round: round.id,
        state: "succeeded",
      });
      expect(store.current(person.id, round.id)).toBeUndefined();
    }
    expect(store.freeze(round.id).contributions).toEqual([]);
  }, 30000);

  it("keeps upload IDs immutable and transcripts scoped to the owner and original round", async () => {
    const { transcribe, releases } = pendingTranscription();
    const { queue, store, session, round, participant } =
      await setup(transcribe);
    const other = store.join(session.id, "Other synthetic person").participant;
    const id = randomUUID(),
      bytes = webm();
    const original = await queue.upload(
      session.id,
      participant.id,
      round.id,
      id,
      "audio/webm",
      bytes,
    );
    expect(
      await queue.upload(
        session.id,
        participant.id,
        round.id,
        id,
        "audio/webm",
        bytes,
      ),
    ).toMatchObject({ hash: original.hash });
    await expect(
      queue.upload(
        session.id,
        participant.id,
        round.id,
        id,
        "audio/webm",
        Buffer.concat([bytes, Buffer.from([1])]),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      queue.upload(
        session.id,
        participant.id,
        round.id,
        id,
        "audio/wav",
        bytes,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      queue.upload(session.id, other.id, round.id, id, "audio/webm", bytes),
    ).rejects.toMatchObject({ status: 409 });
    expect(store.recording(other.id, id)).toBeUndefined();
    expect(() => queue.retry(other.id, id)).toThrow("cannot be retried");
    await until(() => releases.length === 1);
    releases[0]?.();
    await until(
      () => store.recording(participant.id, id)?.state === "succeeded",
    );
    const reviewed = {
      roundId: round.id,
      requestId: randomUUID(),
      expectedRevision: 0,
      text: "Corrected synthetic transcript",
      source: "transcript" as const,
      recordingId: id,
      confirmed: true,
      matching: true,
    };
    expect(() => store.revise(session.id, other.id, reviewed)).toThrow(
      "Recording not found",
    );
    expect(store.revise(session.id, participant.id, reviewed)).toMatchObject({
      confirmed: true,
      recordingId: id,
    });
    store.freeze(round.id);
    const next = store.createRound(session.id, "A later question", "bounded");
    const confirmation = {
      roundId: next.id,
      requestId: randomUUID(),
      expectedRevision: 0,
      text: "Corrected synthetic transcript",
      source: "transcript" as const,
      recordingId: id,
      confirmed: true,
      matching: true,
    };
    expect(() =>
      store.revise(session.id, participant.id, confirmation),
    ).toThrow("Recording not found");
    expect(() =>
      store.revise(session.id, other.id, {
        ...confirmation,
      }),
    ).toThrow("Recording not found");
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it("does not transfer an upload ID between concurrent owners with identical bytes", async () => {
    const { transcribe } = pendingTranscription();
    const { queue, store, session, round, participant } =
      await setup(transcribe);
    const other = store.join(
      session.id,
      "Another synthetic person",
    ).participant;
    const id = randomUUID(),
      bytes = webm();
    const outcomes = await Promise.allSettled(
      [participant, other].map((person) =>
        queue.upload(session.id, person.id, round.id, id, "audio/webm", bytes),
      ),
    );
    const successes = outcomes.filter(
      (outcome) => outcome.status === "fulfilled",
    );
    expect(successes).toHaveLength(1);
    const denied = outcomes.find((outcome) => outcome.status === "rejected");
    expect(denied?.status === "rejected" && denied.reason.status).toBe(409);
    expect(recordingStates(store)).toHaveLength(1);
    const winner =
      successes[0]?.status === "fulfilled"
        ? successes[0].value.participant
        : "";
    expect(store.recording(winner, id)?.participant).toBe(winner);
  });

  it("enforces the five-recording round quota across simultaneous distinct upload IDs without orphaning rejected audio", async () => {
    const { transcribe } = pendingTranscription();
    const { queue, store, session, round, participant, dir } =
      await setup(transcribe);
    const ids = Array.from({ length: 6 }, () => randomUUID());
    const outcomes = await Promise.allSettled(
      ids.map((id) =>
        queue.upload(
          session.id,
          participant.id,
          round.id,
          id,
          "audio/webm",
          webm(),
        ),
      ),
    );
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(5);
    const denied = outcomes.find((outcome) => outcome.status === "rejected");
    expect(denied?.status === "rejected" && denied.reason.status).toBe(429);
    expect(recordingStates(store)).toHaveLength(5);
    expect(
      (await readdir(dir)).filter((name) => name.endsWith(".audio")),
    ).toHaveLength(5);
    expect(transcribe.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("deduplicates concurrent identical uploads and recovers matching orphan files without overwriting changed bytes", async () => {
    const { transcribe, releases } = pendingTranscription();
    const { queue, store, session, round, participant, dir } =
      await setup(transcribe);
    const id = randomUUID(),
      bytes = webm();
    await writeFile(join(dir, `${id}.audio`), bytes, {
      flag: "wx",
      mode: 0o600,
    });
    const upload = () =>
      queue.upload(
        session.id,
        participant.id,
        round.id,
        id,
        "audio/webm",
        bytes,
      );
    const results = await Promise.all([upload(), upload()]);
    expect(results.map((r) => r.hash)).toEqual([
      results[0]?.hash,
      results[0]?.hash,
    ]);
    await until(() => releases.length === 1);
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(recordingStates(store)).toHaveLength(1);
    const orphan = randomUUID();
    await writeFile(join(dir, `${orphan}.audio`), bytes, { flag: "wx" });
    await expect(
      queue.upload(
        session.id,
        participant.id,
        round.id,
        orphan,
        "audio/webm",
        Buffer.concat([bytes, Buffer.from([2])]),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(store.recording(participant.id, orphan)).toBeUndefined();
    expect(await readFile(join(dir, `${orphan}.audio`))).toEqual(bytes);
  });

  it("marks a restarted queue interrupted and only retries on an explicit owner action", async () => {
    const initial = await setup(async () => "Unused synthetic transcript");
    await initial.queue.close();
    queues.delete(initial.queue);
    const ids = [randomUUID(), randomUUID()];
    for (const [index, id] of ids.entries()) {
      saveSeed(
        initial.store,
        initial.participant.id,
        initial.round.id,
        id,
        index ? "transcribing" : "uploaded",
      );
      await writeFile(join(initial.dir, `${id}.audio`), webm());
    }
    initial.store.close();
    stores.delete(initial.store);
    const store = new SessionStore(join(initial.dir, "recordings.sqlite"));
    stores.add(store);
    const transcribe = vi.fn<Transcribe>(
      async () => "Recovered synthetic transcript",
    );
    const queue = new RecordingQueue(store, initial.dir, transcribe);
    queues.add(queue);
    expect(
      ids.map((id) => store.recording(initial.participant.id, id)?.state),
    ).toEqual(["interrupted", "interrupted"]);
    await pause(20);
    expect(transcribe).not.toHaveBeenCalled();
    queue.retry(initial.participant.id, ids[0] as string);
    await until(
      () =>
        store.recording(initial.participant.id, ids[0] as string)?.state ===
        "succeeded",
    );
    expect(
      store.recording(initial.participant.id, ids[1] as string)?.state,
    ).toBe("interrupted");
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(() => queue.retry(initial.participant.id, ids[0] as string)).toThrow(
      "cannot be retried",
    );
  });

  it("refuses changed retained audio before invoking a provider on retry", async () => {
    const transcribe = vi.fn<Transcribe>(
      async () => "Must not transcribe changed bytes",
    );
    const { queue, store, round, participant, dir } = await setup(transcribe);
    const id = randomUUID();
    saveSeed(store, participant.id, round.id, id, "interrupted");
    await writeFile(
      join(dir, `${id}.audio`),
      Buffer.concat([webm(), Buffer.from([2])]),
    );
    queue.retry(participant.id, id);
    await until(() => store.recording(participant.id, id)?.state === "failed");
    expect(transcribe).not.toHaveBeenCalled();
    expect(store.recording(participant.id, id)).not.toHaveProperty(
      "transcript",
    );
  });

  it.each([
    "",
    "  \n ",
    "x".repeat(12001),
    undefined,
    { text: "Unexpected structured result" },
  ])(
    "retains failed audio and leaves typed input available for an invalid provider result %#",
    async (value) => {
      const transcribe = vi.fn<Transcribe>().mockResolvedValue(value as string);
      const { queue, store, session, round, participant, dir } =
        await setup(transcribe);
      const id = randomUUID();
      await queue.upload(
        session.id,
        participant.id,
        round.id,
        id,
        "audio/webm",
        webm(),
      );
      await until(
        () => store.recording(participant.id, id)?.state === "failed",
      );
      expect(await readFile(join(dir, `${id}.audio`))).toEqual(webm());
      expect(store.recording(participant.id, id)).not.toHaveProperty(
        "transcript",
      );
      expect(store.current(participant.id, round.id)).toBeUndefined();
      expect(
        store.revise(session.id, participant.id, {
          roundId: round.id,
          requestId: randomUUID(),
          expectedRevision: 0,
          text: "Typed synthetic fallback",
          source: "typed",
          confirmed: true,
          matching: true,
        }),
      ).toMatchObject({ source: "typed", confirmed: true });
    },
  );

  it("expires stale pending audio without retrying a provider or deleting successful transcripts", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const transcribe = vi.fn<Transcribe>(async () => "Should not be called");
    const { queue, store, round, participant, dir } = await setup(transcribe);
    const old = new Date(Date.now() - 86400001).toISOString();
    const expired = ["uploaded", "failed", "interrupted"].map((state) => ({
      id: randomUUID(),
      state,
    }));
    for (const { id, state } of expired) {
      saveSeed(store, participant.id, round.id, id, state, old);
      await writeFile(join(dir, `${id}.audio`), webm());
    }
    const successful = randomUUID();
    store.saveRecording(successful, participant.id, round.id, {
      id: successful,
      participant: participant.id,
      round: round.id,
      state: "succeeded",
      createdAt: old,
      transcript: "Retained synthetic transcript",
    });
    await vi.advanceTimersByTimeAsync(1000);
    await until(() =>
      expired.every(
        ({ id }) => store.recording(participant.id, id)?.state === "expired",
      ),
    );
    await until(
      async () => !(await readdir(dir)).some((name) => name.endsWith(".audio")),
    );
    expect(transcribe).not.toHaveBeenCalled();
    expect(() => queue.retry(participant.id, expired[0]?.id as string)).toThrow(
      "cannot be retried",
    );
    expect(store.recording(participant.id, successful)?.transcript).toBe(
      "Retained synthetic transcript",
    );
  });

  it("retries transient audio cleanup for terminal records without paying to transcribe again", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const transcribe = vi.fn<Transcribe>(
      async () => "A completed synthetic transcript",
    );
    const { queue, store, session, round, participant, dir } =
      await setup(transcribe);
    const id = randomUUID(),
      expired = randomUUID();
    failedAudioRemovals.add(join(dir, `${id}.audio`));
    failedAudioRemovals.add(join(dir, `${expired}.audio`));
    await queue.upload(
      session.id,
      participant.id,
      round.id,
      id,
      "audio/webm",
      webm(),
    );
    await until(
      () => store.recording(participant.id, id)?.state === "succeeded",
    );
    saveSeed(
      store,
      participant.id,
      round.id,
      expired,
      "expired",
      new Date(Date.now() - 86400001).toISOString(),
    );
    await writeFile(join(dir, `${expired}.audio`), webm());
    await vi.advanceTimersByTimeAsync(1000);
    expect(await readFile(join(dir, `${id}.audio`))).toEqual(webm());
    expect(store.recording(participant.id, id)).toMatchObject({
      state: "succeeded",
      transcript: "A completed synthetic transcript",
    });
    expect(store.recording(participant.id, expired)?.state).toBe("expired");
    failedAudioRemovals.clear();
    await vi.advanceTimersByTimeAsync(1000);
    await until(
      async () => !(await readdir(dir)).some((name) => name.endsWith(".audio")),
      1000,
    );
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it("aborts a timed-out provider and requires an explicit retry without losing the recording", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { transcribe } = pendingTranscription();
    const { queue, store, session, round, participant, dir } =
      await setup(transcribe);
    const id = randomUUID();
    await queue.upload(
      session.id,
      participant.id,
      round.id,
      id,
      "audio/webm",
      webm(),
    );
    await until(() => transcribe.mock.calls.length === 1);
    await vi.advanceTimersByTimeAsync(120000);
    await until(() => store.recording(participant.id, id)?.state === "failed");
    expect(transcribe.mock.calls[0]?.[2].aborted).toBe(true);
    expect(await readFile(join(dir, `${id}.audio`))).toEqual(webm());
    expect(store.current(participant.id, round.id)).toBeUndefined();
    transcribe.mockResolvedValueOnce(
      "Synthetic transcript after explicit retry",
    );
    queue.retry(participant.id, id);
    await until(
      () => store.recording(participant.id, id)?.state === "succeeded",
    );
    expect(transcribe).toHaveBeenCalledTimes(2);
  });

  it("serialises cleanup scans so an older scan cannot replace a completed transcript", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const transcribe = vi.fn<Transcribe>(
      async () => "A stable completed transcript",
    );
    const { queue, store, session, round, participant, dir } =
      await setup(transcribe);
    const terminal = randomUUID(),
      pending = randomUUID(),
      newUpload = randomUUID();
    const terminalPath = join(dir, `${terminal}.audio`);
    delayedAudioRemovals.add(terminalPath);
    saveSeed(store, participant.id, round.id, terminal, "expired");
    saveSeed(store, participant.id, round.id, pending, "uploaded");
    await Promise.all(
      [terminal, pending].map((id) =>
        writeFile(join(dir, `${id}.audio`), webm()),
      ),
    );
    await vi.advanceTimersByTimeAsync(1000);
    await until(() => releaseAudioRemovals.get(terminalPath)?.length === 1);
    await queue.upload(
      session.id,
      participant.id,
      round.id,
      newUpload,
      "audio/webm",
      webm(),
    );
    releaseAudioRemovals.get(terminalPath)?.[0]?.();
    await until(
      () => store.recording(participant.id, pending)?.state === "succeeded",
    );
    await until(async () => !(await readdir(dir)).includes(`${pending}.audio`));
    for (const release of releaseAudioRemovals.get(terminalPath)?.slice(1) ??
      [])
      release();
    delayedAudioRemovals.delete(terminalPath);
    await pause(10);
    await vi.advanceTimersByTimeAsync(1000);
    await until(
      () => store.recording(participant.id, newUpload)?.state === "succeeded",
    );
    expect(store.recording(participant.id, pending)).toMatchObject({
      state: "succeeded",
      transcript: "A stable completed transcript",
    });
    expect(releaseAudioRemovals.get(terminalPath)).toHaveLength(1);
    expect(transcribe).toHaveBeenCalledTimes(2);
  });

  it("expires and cleans retained audio even after transcription has been disabled", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { store, round, participant, dir } = await setup();
    const old = new Date(Date.now() - 86400001).toISOString();
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    for (const [index, id] of ids.entries()) {
      saveSeed(
        store,
        participant.id,
        round.id,
        id,
        ["failed", "expired", "succeeded"][index] as string,
        old,
      );
      await writeFile(join(dir, `${id}.audio`), webm());
    }
    await vi.advanceTimersByTimeAsync(1000);
    await until(
      async () => !(await readdir(dir)).some((name) => name.endsWith(".audio")),
    );
    expect(ids.map((id) => store.recording(participant.id, id)?.state)).toEqual(
      ["expired", "expired", "succeeded"],
    );
    expect(
      ids.every(
        (id) => store.recording(participant.id, id)?.audioDeleted === true,
      ),
    ).toBe(true);
  });

  it("waits for an in-flight cleanup scan before closing the recording queue", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { queue, store, round, participant, dir } = await setup();
    const id = randomUUID(),
      path = join(dir, `${id}.audio`);
    saveSeed(store, participant.id, round.id, id, "expired");
    await writeFile(path, webm());
    delayedAudioRemovals.add(path);
    await vi.advanceTimersByTimeAsync(1000);
    await until(() => releaseAudioRemovals.get(path)?.length === 1);
    let closed = false;
    const closing = queue.close().then(() => {
      closed = true;
    });
    await pause(10);
    expect(closed).toBe(false);
    releaseAudioRemovals.get(path)?.[0]?.();
    await closing;
    expect(store.recording(participant.id, id)?.audioDeleted).toBe(true);
    expect((await readdir(dir)).includes(`${id}.audio`)).toBe(false);
  });

  it("contains a scan failure, logs no stored private detail and resumes valid work", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const transcribe = vi.fn<Transcribe>(
      async () => "A valid synthetic transcript",
    );
    const { queue, store, session, round, participant } =
      await setup(transcribe);
    const invalid = randomUUID(),
      id = randomUUID();
    store.db
      .prepare("INSERT INTO recordings VALUES (?,?,?,?)")
      .run(
        invalid,
        participant.id,
        round.id,
        "synthetic-private-provider-detail",
      );
    await vi.advanceTimersByTimeAsync(1000);
    expect(errors).toHaveBeenCalledWith(
      "Recording queue scan failed; pending recordings remain private.",
    );
    expect(JSON.stringify(errors.mock.calls)).not.toContain(
      "synthetic-private-provider-detail",
    );
    store.db.prepare("DELETE FROM recordings WHERE id=?").run(invalid);
    await queue.upload(
      session.id,
      participant.id,
      round.id,
      id,
      "audio/webm",
      webm(),
    );
    await until(
      () => store.recording(participant.id, id)?.state === "succeeded",
    );
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it("closes the server by aborting transcription, retaining audio and marking interruption for explicit restart", async () => {
    const dir = await directory();
    const { transcribe } = pendingTranscription();
    const app = await startSessionServer({
      directory: dir,
      port: 0,
      origin: "http://127.0.0.1",
      operatorToken: "synthetic-operator-token-with-32-characters",
      transcribe,
      executor: async () => {
        throw new Error("Unused fake executor");
      },
    });
    servers.add(app);
    const session = app.store.createSession("Synthetic shutdown", 2);
    const round = app.store.createRound(
      session.id,
      "Synthetic question",
      "bounded",
    );
    const participant = app.store.join(
      session.id,
      "Synthetic participant",
    ).participant;
    const id = randomUUID();
    await writeFile(join(dir, `${id}.audio`), webm());
    saveSeed(app.store, participant.id, round.id, id, "uploaded");
    await until(() => transcribe.mock.calls.length === 1);
    const signal = transcribe.mock.calls[0]?.[2];
    await app.close();
    servers.delete(app);
    expect(signal?.aborted).toBe(true);
    const reopened = new SessionStore(join(dir, "sessions.sqlite"));
    stores.add(reopened);
    const saved = reopened.recording(participant.id, id);
    expect(saved?.state).toBe("interrupted");
    expect(JSON.stringify(saved)).not.toContain(
      "Synthetic cancelled provider detail",
    );
    expect(await readFile(join(dir, `${id}.audio`))).toEqual(webm());
    expect(reopened.current(participant.id, round.id)).toBeUndefined();
  });

  it("rejects invalid payloads and unconfigured recording while preserving typed participation", async () => {
    const { queue, store, session, round, participant } = await setup();
    await expect(
      queue.upload(
        session.id,
        participant.id,
        round.id,
        randomUUID(),
        "audio/webm",
        webm(),
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(
      store.revise(session.id, participant.id, {
        roundId: round.id,
        requestId: randomUUID(),
        expectedRevision: 0,
        text: "Typed input remains available",
        confirmed: true,
        matching: false,
        source: "typed",
      }),
    ).toMatchObject({ confirmed: true });
    const enabled = await setup(async () => "Synthetic transcript");
    for (const bytes of [Buffer.alloc(99), Buffer.alloc(8 * 1024 * 1024 + 1)]) {
      await expect(
        enabled.queue.upload(
          enabled.session.id,
          enabled.participant.id,
          enabled.round.id,
          randomUUID(),
          "audio/webm",
          bytes,
        ),
      ).rejects.toMatchObject({ status: 413 });
    }
    await expect(
      enabled.queue.upload(
        enabled.session.id,
        enabled.participant.id,
        enabled.round.id,
        randomUUID(),
        "audio/webm",
        Buffer.alloc(200),
      ),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      enabled.queue.upload(
        enabled.session.id,
        enabled.participant.id,
        enabled.round.id,
        randomUUID(),
        "text/plain",
        webm(),
      ),
    ).rejects.toMatchObject({ status: 415 });
  });
});
