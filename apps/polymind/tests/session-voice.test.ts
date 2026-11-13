import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { readLiveRun } from "../src/live-runs.ts";
import { liveConfigSchema } from "../src/live-schema.ts";
import type { Generate } from "../src/models.ts";
import { SessionStore } from "../src/session/store.ts";
import { SessionVoice } from "../src/session/voice.ts";

it("keeps 140 identities and long revisions independent of explicit voice lifecycle and recovery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "polymind-voice-"));
  const store = new SessionStore(join(dir, "session.sqlite"));
  const generated = vi.fn<Generate>(async (_request, token) => {
    await token("We can change this together. ");
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { text: "We can change this together. " };
  });
  let voice = new SessionVoice(store, dir, generated);
  try {
    const session = store.createSession("Synthetic crowd", 140),
      round = store.createRound(session.id, "What can change?", "continuous");
    const people = Array.from({ length: 140 }, (_, i) =>
      store.join(session.id, `Participant ${i}`),
    );
    for (const p of people)
      store.revise(session.id, p.participant.id, {
        roundId: round.id,
        requestId: randomUUID(),
        expectedRevision: 0,
        text: "A long contribution. ".repeat(250),
        confirmed: false,
        matching: false,
        source: "typed",
      });
    expect(generated).not.toHaveBeenCalled();
    expect(voice.state(session.id)).toBeUndefined();
    const raw = JSON.parse(
      await readFile("examples/live-projection.json", "utf8"),
    );
    delete raw.live.score;
    const config = liveConfigSchema.parse({
      ...raw,
      composer: {
        ...raw.composer,
        provider: "ollama",
        reasoningEffort: undefined,
        model: "fake",
        timeoutMs: 1000,
      },
      live: {
        ...raw.live,
        mode: "typed",
        maxDurationMs: 60000,
        maxContextCharacters: 1000000,
      },
    });
    await voice.control("start", session.id, round.id, config);
    await vi.waitFor(() => expect(generated).toHaveBeenCalled(), {
      timeout: 10000,
    });
    store.freeze(round.id);
    store.createRound(session.id, "Bounded next", "bounded");
    expect(voice.state(session.id)?.roundId).toBe(round.id);
    await voice.control(
      "pause",
      session.id,
      voice.state(session.id)?.roundId ?? "missing-voice-round",
    );
    const state = voice.state(session.id);
    expect(state?.status).toBe("paused");
    const run = await readLiveRun(join(dir, `voice-${state?.id}.jsonl`));
    expect(run.state.scenario.voices).toHaveLength(140);
    expect(run.state.participants.every((p) => p.text.length === 5250)).toBe(
      true,
    );
    expect(run.state.config.live.maxParticipants).toBe(140);
    expect(store.identify(session.id, people[0]?.credential ?? "")?.id).toBe(
      people[0]?.participant.id,
    );
    await voice.close();
    const calls = generated.mock.calls.length;
    voice = new SessionVoice(store, dir, generated);
    await voice.load();
    expect(voice.state(session.id)?.status).toBe("ended");
    expect(generated).toHaveBeenCalledTimes(calls);
    expect(voice.state(session.id)?.roundId).toBe(round.id);
    await voice.control(
      "end",
      session.id,
      voice.state(session.id)?.roundId ?? "missing-voice-round",
    );
    expect(store.session(session.id).open).toBe(true);
    const bounded = store.rounds(session.id).at(-1);
    expect(bounded?.mode).toBe("bounded");
    store.freeze(bounded?.id ?? "missing-bounded-round");
    const next = store.createRound(session.id, "Continuous next", "continuous");
    await voice.control("start", session.id, next.id, config);
    expect(voice.state(session.id)?.roundId).toBe(next.id);
    await voice.control("end", session.id, next.id);
  } finally {
    await voice.close();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 20000);

it("closes a never-started round and deduplicates new rounds durably", async () => {
  const dir = await mkdtemp(join(tmpdir(), "polymind-round-"));
  let store = new SessionStore(join(dir, "session.sqlite"));
  let voice = new SessionVoice(store, dir, vi.fn<Generate>());
  try {
    const session = store.createSession("Synthetic lifecycle", 4);
    const person = store.join(session.id, "A");
    const round = store.createRound(session.id, "Same question?", "continuous");
    const input = {
      roundId: round.id,
      requestId: randomUUID(),
      expectedRevision: 0,
      text: "Saved before speaking",
      confirmed: false,
      matching: false,
      source: "typed" as const,
    };
    store.revise(session.id, person.participant.id, input);
    await voice.control("end", session.id, round.id);
    await voice.control("end", session.id, round.id);
    expect(store.round(round.id).open).toBe(false);
    expect(store.current(person.participant.id, round.id)?.text).toBe(
      input.text,
    );
    expect(store.db.prepare("SELECT * FROM voice_runs").all()).toHaveLength(0);
    expect(() =>
      store.revise(session.id, person.participant.id, {
        ...input,
        requestId: randomUUID(),
        expectedRevision: 1,
        text: "Too late",
      }),
    ).toThrow("Collection has closed");
    const request = { requestId: randomUUID(), previousRoundId: round.id };
    const next = store.createRound(
      session.id,
      round.prompt,
      "continuous",
      request,
    );
    expect(
      store.createRound(session.id, round.prompt, "continuous", request).id,
    ).toBe(next.id);
    expect(store.current(person.participant.id, next.id)).toBeUndefined();
    expect(store.identify(session.id, person.credential)?.id).toBe(
      person.participant.id,
    );
    await voice.control("end", session.id, next.id);
    expect(() =>
      store.createRound(session.id, round.prompt, "continuous", {
        requestId: randomUUID(),
        previousRoundId: round.id,
      }),
    ).toThrow("current round changed");
    await voice.close();
    store.close();
    store = new SessionStore(join(dir, "session.sqlite"));
    voice = new SessionVoice(store, dir, vi.fn<Generate>());
    await voice.load();
    expect(
      store.createRound(session.id, round.prompt, "continuous", request).id,
    ).toBe(next.id);
    expect(store.rounds(session.id)).toHaveLength(2);
    expect(
      store.earlierContributions(session.id, person.participant.id),
    ).toEqual([
      {
        roundId: round.id,
        prompt: round.prompt,
        text: input.text,
        createdAt: store.current(person.participant.id, round.id)?.savedAt,
      },
    ]);
  } finally {
    await voice.close();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

it("resumes the same journal and starts a clean voice after ending the round", async () => {
  const dir = await mkdtemp(join(tmpdir(), "polymind-clean-voice-"));
  const store = new SessionStore(join(dir, "session.sqlite"));
  const generated = vi.fn<Generate>(async (_request, token) => {
    await token("A collective prefix. ");
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { text: "A collective prefix. " };
  });
  const voice = new SessionVoice(store, dir, generated);
  try {
    const session = store.createSession("Synthetic clean round", 4);
    const person = store.join(session.id, "A");
    const round = store.createRound(session.id, "Same question?", "continuous");
    store.revise(session.id, person.participant.id, {
      roundId: round.id,
      requestId: randomUUID(),
      expectedRevision: 0,
      text: "A private previous-round thought about our room",
      confirmed: false,
      matching: false,
      source: "typed",
    });
    const raw = JSON.parse(
      await readFile("examples/live-projection.json", "utf8"),
    );
    delete raw.live.score;
    const config = liveConfigSchema.parse({
      ...raw,
      composer: {
        ...raw.composer,
        provider: "ollama",
        reasoningEffort: undefined,
        model: "fake",
        timeoutMs: 1000,
      },
      live: { ...raw.live, mode: "typed", maxDurationMs: 60000 },
    });
    await voice.control("start", session.id, round.id, config);
    await vi.waitFor(() => expect(generated).toHaveBeenCalled(), {
      timeout: 10000,
    });
    await voice.control("pause", session.id, round.id);
    const first = voice.state(session.id);
    const prefix = first?.text;
    await voice.control("start", session.id, round.id);
    expect(voice.state(session.id)?.id).toBe(first?.id);
    expect(voice.state(session.id)?.text.startsWith(prefix ?? "")).toBe(true);
    await voice.control("end", session.id, round.id);
    const frozen = store.freeze(round.id);
    const firstJournal = await readFile(
      join(dir, `voice-${first?.id}.jsonl`),
      "utf8",
    );
    const next = store.createRound(session.id, round.prompt, "continuous");
    const priorCalls = generated.mock.calls.length;
    await voice.control("start", session.id, next.id, config);
    await voice.control("end", session.id, round.id);
    expect(voice.state(session.id)?.roundId).toBe(next.id);
    expect(voice.state(session.id)?.status).toBe("running");
    await voice.control("pause", session.id, next.id);
    const second = voice.state(session.id);
    expect(second?.id).not.toBe(first?.id);
    const run = await readLiveRun(join(dir, `voice-${second?.id}.jsonl`));
    expect(run.state.participants).toHaveLength(1);
    expect(run.state.participants[0]?.text).toBe("");
    expect(
      JSON.stringify(generated.mock.calls.slice(priorCalls)),
    ).not.toContain("A private previous-round thought about our room");
    expect(await readFile(join(dir, `voice-${first?.id}.jsonl`), "utf8")).toBe(
      firstJournal,
    );
    expect(store.freeze(round.id)).toEqual(frozen);
    await voice.control("start", session.id, next.id);
    await voice.endSession(session.id);
    expect(store.session(session.id).open).toBe(false);
    expect(store.round(next.id).open).toBe(false);
    expect(voice.state(session.id)?.status).toBe("ended");
    const endedCalls = generated.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(generated).toHaveBeenCalledTimes(endedCalls);
  } finally {
    await voice.close();
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
