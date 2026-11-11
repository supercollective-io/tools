import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { LiveController } from "./live.ts";
import { LiveLog, readLiveRun } from "./live-runs.ts";
import { liveConfigSchema } from "./live-schema.ts";
import { type Generate, generate } from "./models.ts";
import { admitPending } from "./participation-admission.ts";
import { ParticipationStore } from "./participation-store.ts";

const cueSchema = z.strictObject({
  endMs: z.number().int().nonnegative(),
  text: z.string(),
  replace: z.boolean().optional(),
});
const trackSchema = z
  .strictObject({
    id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
    startMs: z.number().int().nonnegative().default(0),
    srt: z.string().min(1).optional(),
    cues: z.array(cueSchema).min(1).optional(),
    timingNote: z.string().min(1),
  })
  .refine(
    (v) => Boolean(v.srt) !== Boolean(v.cues),
    "Supply either srt or cues",
  );
export const rehearsalPlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  title: z.string().min(1),
  invitation: z.string().min(1),
  hypothesis: z.string(),
  config: z.string().min(1),
  prompt: z.string().min(1).optional(),
  tailMs: z.number().int().min(1000).max(180000).default(10000),
  tracks: z.array(trackSchema).min(1).max(100),
});
export const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const json = async (path: string, value: unknown) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });

/** Cue ends are availability times, never inferred word timings. */
export function parseSrt(text: string) {
  return text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((block) => {
      const match = block.match(
        /^\d+\r?\n(\d{2}):([0-5]\d):([0-5]\d)[,.](\d{3}) --> (\d{2}):([0-5]\d):([0-5]\d)[,.](\d{3})\r?\n([\s\S]+)$/,
      );
      if (!match)
        throw new Error(
          "Invalid SRT cue; expected numbered cues with millisecond timestamps.",
        );
      const time = (offset: number) =>
        Number(match[offset]) * 3600000 +
        Number(match[offset + 1]) * 60000 +
        Number(match[offset + 2]) * 1000 +
        Number(match[offset + 3]);
      if (time(5) < time(1)) throw new Error("SRT cue ends before it starts.");
      return {
        endMs: time(5),
        text: match[9]?.replace(/\s+/g, " ").trim() ?? "",
      };
    });
}

export async function prepareRehearsal(path: string) {
  const plan = rehearsalPlanSchema.parse(
    JSON.parse(await readFile(path, "utf8")),
  );
  if (new Set(plan.tracks.map((t) => t.id)).size !== plan.tracks.length)
    throw new Error("Duplicate track IDs.");
  const base = dirname(resolve(path));
  const config = liveConfigSchema.parse(
    JSON.parse(await readFile(resolve(base, plan.config), "utf8")),
  );
  if (plan.prompt)
    config.instructions = (
      await readFile(resolve(base, plan.prompt), "utf8")
    ).trim();
  config.live.mode = "typed";
  config.live.composerStyle = "configured";
  delete config.live.score;
  const tracks = await Promise.all(
    plan.tracks.map(async (track) => {
      const raw = track.srt
        ? await readFile(resolve(base, track.srt), "utf8")
        : null;
      const cues = z
        .array(cueSchema)
        .min(1)
        .parse(raw === null ? track.cues : parseSrt(raw));
      if (cues.some((c, i) => i > 0 && c.endMs <= (cues[i - 1]?.endMs ?? 0)))
        throw new Error(
          "Cue endpoints must increase strictly within each track.",
        );
      return {
        id: track.id,
        startMs: track.startMs,
        timingNote: track.timingNote,
        sourceFingerprint: fingerprint(raw ?? cues),
        cues,
      };
    }),
  );
  const timeline = tracks
    .flatMap((track) => {
      let text = "";
      return track.cues.map((cue, index) => {
        text = cue.replace ? cue.text : `${text}${text ? " " : ""}${cue.text}`;
        if (text.length > 4000)
          throw new Error("Track exceeds the phone contribution limit.");
        return {
          track: track.id,
          cue: index + 1,
          atMs: track.startMs + cue.endMs,
          text,
        };
      });
    })
    .sort((a, b) => a.atMs - b.atMs);
  const endMs = (timeline.at(-1)?.atMs ?? 0) + plan.tailMs;
  // The replay owns its explicit deadline, with a small guard margin.
  config.live.maxDurationMs = endMs + 1000;
  const validatedConfig = liveConfigSchema.parse(config);
  return {
    schemaVersion: 1 as const,
    title: plan.title,
    invitation: plan.invitation,
    hypothesis: plan.hypothesis,
    arrangement: tracks.every((t) => t.startMs === 0)
      ? "simultaneous"
      : "staggered",
    tracks,
    timeline,
    endMs,
    tailMs: plan.tailMs,
    admissionIntervalMs: 2000,
    config: validatedConfig,
    inputFingerprint: fingerprint({ tracks, timeline }),
    configFingerprint: fingerprint(validatedConfig),
  };
}
export type FrozenRehearsal = Awaited<ReturnType<typeof prepareRehearsal>>;

export async function runRehearsal(
  plan: FrozenRehearsal,
  directory: string,
  model: Generate = generate,
  signal?: AbortSignal,
) {
  await mkdir(directory, { mode: 0o700 });
  await json(join(directory, "plan.json"), plan);
  await json(join(directory, "review.json"), {
    schemaVersion: 1,
    hypothesis: plan.hypothesis,
    moments: [],
    decision: null,
    nextChange: null,
  });
  const log = await LiveLog.create(join(directory, "live.jsonl"), {
    type: "live.created",
    config: plan.config,
    scenario: {
      schemaVersion: 1,
      title: plan.title,
      openingInvitation: plan.invitation,
      voices: [],
    },
  });
  const controller = new LiveController(log, model);
  let store: ParticipationStore | undefined;
  let reason = "failed";
  const arrivals: {
    track: string;
    cue: number;
    scheduledMs: number;
    savedMs: number;
    savedAt: string;
    participant: string;
  }[] = [];
  try {
    store = new ParticipationStore(
      join(directory, "participation.sqlite"),
      log.state.runId,
    );
    const people = new Map<string, string>();
    for (const track of plan.tracks) {
      const person = store.join();
      people.set(track.id, person.id);
      await controller.joinParticipant(person.id);
    }
    await json(
      join(directory, "participants.json"),
      Object.fromEntries(people),
    );
    await controller.start();
    const started = performance.now();
    let cursor = 0;
    let tick = plan.admissionIntervalMs;
    while (true) {
      const now = performance.now() - started;
      if (signal?.aborted) {
        reason = "interrupted";
        break;
      }
      if (controller.snapshot().error || log.state.status !== "running") break;
      while (
        cursor < plan.timeline.length &&
        (plan.timeline[cursor]?.atMs ?? Infinity) <= now
      ) {
        const event = plan.timeline[cursor];
        if (!event) break;
        const participant = people.get(event.track);
        if (!participant) throw new Error("Missing track participant.");
        store.revise(participant, event.cue, event.text);
        arrivals.push({
          track: event.track,
          cue: event.cue,
          scheduledMs: event.atMs,
          savedMs: performance.now() - started,
          savedAt: new Date().toISOString(),
          participant,
        });
        cursor++;
      }
      if (now >= tick) {
        await admitPending(store, controller);
        tick += plan.admissionIntervalMs;
      }
      if (now >= plan.endMs) {
        reason = "deadline";
        break;
      }
      await delay(Math.min(25, Math.max(1, plan.endMs - now)));
    }
    if (reason === "deadline") await controller.end();
    else await controller.pause();
  } finally {
    try {
      await controller.close();
    } finally {
      store?.close();
      await log.close();
      await json(join(directory, "outcome.json"), { reason, arrivals });
    }
  }
  const report = await inspectRehearsal(directory);
  await json(join(directory, "inspection.json"), report);
  return report;
}

/** Inspect actual request snapshots, including replacements, rather than slicing final sources. */
export async function inspectRehearsal(directory: string) {
  const plan: FrozenRehearsal = JSON.parse(
    await readFile(join(directory, "plan.json"), "utf8"),
  );
  const people: Record<string, string> = JSON.parse(
    await readFile(join(directory, "participants.json"), "utf8"),
  );
  const { state, events, tail } = await readLiveRun(
    join(directory, "live.jsonl"),
  );
  const origin = Date.parse(
    events.find((r) => r.event.type === "session.started")?.at ??
      events[0]?.at ??
      "",
  );
  const trackFor = (id: string) =>
    Object.keys(people).find((key) => people[key] === id) ?? id;
  const steps: {
    attemptId: string;
    atMs: number;
    collectiveBefore: string;
    appended: string;
    messages: unknown;
    available: unknown;
    finishReason: string | null;
    firstTextMs: number | null;
  }[] = [];
  const admissions: {
    sequence: number;
    atMs: number;
    track: string;
    revision: string;
    text: string;
  }[] = [];
  const sources = new Map<string, string>();
  const seen = new Map<string, string>();
  let collective = "";
  for (const record of events) {
    const event = record.event;
    const atMs = Date.parse(record.at) - origin;
    if (event.type === "input.revised") {
      sources.set(event.participantId, event.text);
      admissions.push({
        sequence: record.sequence,
        atMs,
        track: trackFor(event.participantId),
        revision: event.id,
        text: event.text,
      });
    }
    if (event.type === "generation.started" && event.actorId === "collective") {
      for (const [id, text] of sources) seen.set(id, text);
      steps.push({
        attemptId: event.attemptId,
        atMs,
        collectiveBefore: collective,
        appended: "",
        messages: event.messages,
        available: [...sources].map(([id, text]) => ({
          track: trackFor(id),
          text,
        })),
        finishReason: null,
        firstTextMs: null,
      });
    }
    if (event.type === "text.appended" && event.actorId === "collective") {
      const step = steps.find((s) => s.attemptId === event.attemptId);
      if (step) {
        step.appended += event.text;
        step.firstTextMs ??= atMs - step.atMs;
      }
      collective += event.text;
    }
    if (event.type === "generation.finished") {
      const step = steps.find((s) => s.attemptId === event.attemptId);
      if (step) step.finishReason = event.reason;
    }
  }
  const pending = plan.tracks
    .filter(
      (track) =>
        sources.get(people[track.id] ?? "") !==
        plan.timeline.findLast((event) => event.track === track.id)?.text,
    )
    .map((t) => t.id);
  const unseen = plan.tracks
    .filter(
      (track) =>
        seen.get(people[track.id] ?? "") !==
        plan.timeline.findLast((event) => event.track === track.id)?.text,
    )
    .map((track) => track.id);
  let outcome: unknown = null;
  try {
    outcome = JSON.parse(
      await readFile(join(directory, "outcome.json"), "utf8"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    schemaVersion: 1,
    runId: state.runId,
    outcome,
    timeline: plan.timeline,
    tracks: plan.tracks,
    inputFingerprint: plan.inputFingerprint,
    configFingerprint: plan.configFingerprint,
    arrangement: plan.arrangement,
    hypothesis: plan.hypothesis,
    config: state.config,
    status: state.status,
    finalText: state.composer.text,
    publishedText: state.composer.text.slice(0, state.publishedOffset),
    completion: {
      allInputsAdmitted: pending.length === 0,
      allInputsSeen: unseen.length === 0,
      unseenTracks: unseen,
      pendingTracks: pending,
      failedAttempts: steps
        .filter((s) => s.finishReason === "failed")
        .map((s) => s.attemptId),
      unfinishedAttempts: steps
        .filter((s) => s.finishReason === null)
        .map((s) => s.attemptId),
      pauseReason: state.pauseReason,
      incompleteTailBytes: tail.length,
    },
    admissions,
    steps,
    publications: events.flatMap((r) =>
      r.event.type === "collective.published"
        ? [{ atMs: Date.parse(r.at) - origin, offset: r.event.offset }]
        : [],
    ),
    notes: [
      "Cue endpoints approximate availability, not live dictation latency or word timing.",
      "Identical schedules can produce different request boundaries. Inspect the exact messages.",
      "This is recorded evidence, not an assessment of representation or artistic quality.",
    ],
  };
}
