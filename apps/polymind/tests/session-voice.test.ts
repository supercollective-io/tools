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
    expect(voice.state(session.id)?.status).toBe("paused");
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
