import { readFile } from "node:fs/promises";
import { z } from "zod";
import { percentageRanges } from "./composition.ts";
import { type JournalEvent, journalFor } from "./journal.ts";
import { type LiveConfig, liveConfigSchema } from "./live-schema.ts";
import { type SimulationScenario, scenarioSchema } from "./schema.ts";

const offset = z.number().int().nonnegative();
// z.record omits '__proto__'; it is also a valid scenario ID. Validate the map
// without dropping own keys, then copy it into a map without a prototype.
const sourceOffsets = z
  .custom<Record<string, number>>((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return false;
    const prototype = Object.getPrototypeOf(value);
    return (
      (prototype === Object.prototype || prototype === null) &&
      Object.values(value).every(
        (offset) =>
          typeof offset === "number" &&
          Number.isSafeInteger(offset) &&
          offset >= 0,
      )
    );
  })
  .transform(
    (value): Record<string, number> =>
      Object.assign(Object.create(null), value),
  );
const messages = z
  .array(
    z.strictObject({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    }),
  )
  .min(1);
const bodySchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("live.created"),
    scenario: scenarioSchema,
    config: liveConfigSchema,
  }),
  z.strictObject({ type: z.literal("session.started") }),
  z.strictObject({ type: z.literal("source.revealed"), step: offset }),
  z.strictObject({
    type: z.literal("session.paused"),
    elapsedMs: z.number().nonnegative(),
    reason: z.string().max(500),
  }),
  z.strictObject({
    type: z.literal("session.recovered"),
    elapsedMs: z.number().nonnegative(),
  }),
  z.strictObject({
    type: z.literal("session.ended"),
    elapsedMs: z.number().nonnegative(),
  }),
  z.strictObject({
    type: z.literal("generation.started"),
    actorId: z.string(),
    attemptId: z.uuid(),
    contextVersion: offset,
    sourceOffsets,
    messages,
  }),
  z.strictObject({
    type: z.literal("text.appended"),
    actorId: z.string(),
    attemptId: z.uuid(),
    offset,
    text: z
      .string()
      .min(1)
      .refine(
        (text) => !/[\uD800-\uDFFF]/u.test(text),
        "Text must contain complete Unicode characters.",
      ),
  }),
  z.strictObject({
    type: z.literal("generation.finished"),
    actorId: z.string(),
    attemptId: z.uuid(),
    reason: z.enum([
      "refresh",
      "eos",
      "budget",
      "paused",
      "ended",
      "failed",
      "interrupted",
    ]),
    code: z
      .enum(["timeout", "aborted", "empty", "truncated", "provider"])
      .optional(),
    durationMs: z.number().nonnegative().optional(),
  }),
  z.strictObject({
    type: z.literal("collective.published"),
    version: z.number().int().positive(),
    offset,
  }),
]);

export type LiveEvent = z.infer<typeof bodySchema>;
export type LiveAttempt = {
  id: string;
  contextVersion: number;
  sourceOffsets: Record<string, number>;
  startedAt: string;
  firstTokenAt: string | null;
};
export type LiveWriter = {
  id: string;
  text: string;
  active: LiveAttempt | null;
  lastContextVersion: number;
  seenOffsets: Record<string, number>;
  lastFinishReason:
    | Extract<LiveEvent, { type: "generation.finished" }>["reason"]
    | null;
};
export type LiveState = {
  runId: string;
  scenario: SimulationScenario;
  config: LiveConfig;
  status: "ready" | "running" | "paused" | "ended";
  elapsedMs: number;
  sessionStartedAt: string | null;
  updatedAt: string;
  participants: LiveWriter[];
  composer: LiveWriter;
  collectiveVersion: number;
  publishedOffset: number;
  publishedAt: string | null;
  pauseReason: string | null;
  // Serial modes advance this cursor in the same durable event that finishes
  // an inference. Interrupted requests retain their cursor and saved prefix.
  scheduler: {
    cycle: number;
    participantIndex: number;
    phase: "participants" | "collective" | "complete";
  };
};

function writer(id: string): LiveWriter {
  return {
    id,
    text: "",
    active: null,
    lastContextVersion: 0,
    seenOffsets: Object.create(null),
    lastFinishReason: null,
  };
}

function rebuild(records: JournalEvent<LiveEvent>[]): LiveState {
  const first = records[0];
  if (first?.event.type !== "live.created")
    throw new Error("Live log has no valid opening record.");
  const mode = first.event.config.live.mode ?? "continuous";
  const score = first.event.config.live.score;
  const scenario = first.event.scenario;
  if (
    mode === "fixed" &&
    (!score ||
      score.voices.length !== scenario.voices.length ||
      score.voices.some(
        (voice, index) => voice.id !== scenario.voices[index]?.id,
      ))
  )
    throw new Error(
      "Fixed score and scenario voices must have the same IDs and order.",
    );
  const state: LiveState = {
    runId: first.runId,
    scenario: first.event.scenario,
    config: first.event.config,
    status: "ready",
    elapsedMs: 0,
    sessionStartedAt: null,
    updatedAt: first.at,
    participants: first.event.scenario.voices.map((voice) =>
      writer(`participant/${voice.id}`),
    ),
    composer: writer("collective"),
    collectiveVersion: 0,
    publishedOffset: 0,
    publishedAt: null,
    pauseReason: null,
    scheduler: { cycle: 0, participantIndex: 0, phase: "participants" },
  };
  const attempts = new Set<string>();
  const writers = [...state.participants, state.composer];
  for (const [index, record] of records.entries()) {
    if (
      record.runId !== state.runId ||
      record.sequence !== index + 1 ||
      state.status === "ended"
    )
      throw new Error("Live log has inconsistent ordering or identity.");
    const event = record.event;
    if (event.type === "live.created") {
      if (index !== 0)
        throw new Error("Live log contains multiple opening records.");
      continue;
    }
    switch (event.type) {
      case "source.revealed": {
        if (
          mode !== "fixed" ||
          !score ||
          state.status !== "running" ||
          state.scheduler.phase !== "participants" ||
          event.step !== state.scheduler.cycle ||
          writers.some((writer) => writer.active)
        )
          throw new Error(
            "Fixed sources must advance in score order between requests.",
          );
        const range = percentageRanges(score)[event.step];
        if (!range) throw new Error("Fixed source slice does not exist.");
        for (const [index, voice] of score.voices.entries()) {
          const characters = Array.from(voice.text);
          const participant = state.participants[index];
          if (!participant) throw new Error("Fixed source has no participant.");
          participant.text = characters
            .slice(0, Math.floor((characters.length * range.to) / 100))
            .join("");
        }
        state.scheduler.phase = "collective";
        break;
      }
      case "session.started":
        if (state.status !== "ready" && state.status !== "paused")
          throw new Error("Live session is already running.");
        state.status = "running";
        state.sessionStartedAt = record.at;
        state.pauseReason = null;
        break;
      case "session.paused":
        if (
          state.status !== "running" ||
          writers.some((writer) => writer.active) ||
          event.elapsedMs < state.elapsedMs
        )
          throw new Error(
            "Live session cannot pause before active requests finish or elapsed time advances.",
          );
        state.status = "paused";
        state.elapsedMs = event.elapsedMs;
        state.sessionStartedAt = null;
        state.pauseReason = event.reason;
        break;
      case "session.recovered": {
        const elapsedMs =
          state.elapsedMs +
          Math.max(
            0,
            Date.parse(state.updatedAt) -
              Date.parse(state.sessionStartedAt ?? state.updatedAt),
          );
        if (state.status !== "running" || event.elapsedMs !== elapsedMs)
          throw new Error(
            "Live recovery must preserve the last durable elapsed time.",
          );
        // One record interrupts all active requests and pauses the session. A
        // second crash cannot count downtime via separately saved finish times.
        for (const writer of writers) {
          if (writer.active) writer.lastFinishReason = "interrupted";
          writer.active = null;
        }
        state.status = "paused";
        state.elapsedMs = event.elapsedMs;
        state.sessionStartedAt = null;
        state.pauseReason = "interrupted";
        break;
      }
      case "session.ended":
        if (
          writers.some((writer) => writer.active) ||
          event.elapsedMs < state.elapsedMs
        )
          throw new Error(
            "Live session cannot end before active requests finish or elapsed time advances.",
          );
        state.status = "ended";
        state.elapsedMs = event.elapsedMs;
        state.sessionStartedAt = null;
        state.pauseReason = null;
        break;
      case "generation.started": {
        const writer = writers.find(
          (candidate) => candidate.id === event.actorId,
        );
        if (
          state.status !== "running" ||
          !writer ||
          writer.active ||
          attempts.has(event.attemptId) ||
          event.contextVersion !== state.collectiveVersion ||
          (mode !== "continuous" &&
            (writers.some((candidate) => candidate.active) ||
              (state.scheduler.phase === "participants"
                ? mode !== "chunked" ||
                  event.actorId !==
                    state.participants[state.scheduler.participantIndex]?.id
                : state.scheduler.phase !== "collective" ||
                  event.actorId !== "collective")))
        )
          throw new Error(
            "Invalid live generation attempt or collective context.",
          );
        const expected =
          event.actorId === "collective"
            ? Object.fromEntries(
                state.scenario.voices.map((voice, index) => [
                  voice.id,
                  state.participants[index]?.text.length ?? 0,
                ]),
              )
            : {};
        const keys = Object.keys(expected);
        if (
          Object.keys(event.sourceOffsets).length !== keys.length ||
          keys.some((id) => event.sourceOffsets[id] !== expected[id])
        )
          throw new Error(
            "Live generation source offsets do not match available participant text.",
          );
        attempts.add(event.attemptId);
        writer.active = {
          id: event.attemptId,
          contextVersion: event.contextVersion,
          sourceOffsets: event.sourceOffsets,
          startedAt: record.at,
          firstTokenAt: null,
        };
        writer.lastContextVersion = event.contextVersion;
        writer.seenOffsets = Object.assign(
          Object.create(null),
          event.sourceOffsets,
        );
        break;
      }
      case "text.appended": {
        const writer = writers.find(
          (candidate) => candidate.id === event.actorId,
        );
        if (
          state.status !== "running" ||
          !writer?.active ||
          writer.active.id !== event.attemptId ||
          event.offset !== writer.text.length
        )
          throw new Error(
            "Live text does not continue the active writer at its exact saved offset.",
          );
        writer.text += event.text;
        writer.active.firstTokenAt ??= record.at;
        break;
      }
      case "generation.finished": {
        const writer = writers.find(
          (candidate) => candidate.id === event.actorId,
        );
        if (
          state.status !== "running" ||
          !writer?.active ||
          writer.active.id !== event.attemptId
        )
          throw new Error(
            "Live generation completion refers to an inactive request.",
          );
        writer.active = null;
        writer.lastFinishReason = event.reason;
        if (
          mode !== "continuous" &&
          (event.reason === "eos" || event.reason === "budget")
        ) {
          if (event.actorId === "collective") {
            state.scheduler.cycle++;
            state.scheduler.participantIndex = 0;
            state.scheduler.phase =
              mode === "fixed" &&
              score &&
              state.scheduler.cycle >= percentageRanges(score).length
                ? "complete"
                : "participants";
          } else {
            state.scheduler.participantIndex++;
            if (state.scheduler.participantIndex === state.participants.length)
              state.scheduler.phase = "collective";
          }
        }
        break;
      }
      case "collective.published":
        if (
          state.status !== "running" ||
          event.version !== state.collectiveVersion + 1 ||
          event.offset !== state.composer.text.length ||
          event.offset <= state.publishedOffset ||
          !state.composer.text.trim()
        )
          throw new Error(
            "Live publication must advance to the complete saved collective prefix.",
          );
        state.collectiveVersion = event.version;
        state.publishedOffset = event.offset;
        state.publishedAt = record.at;
        break;
    }
    state.updatedAt = record.at;
  }
  return state;
}

export const LiveLog = journalFor(bodySchema, rebuild, (state): LiveEvent[] => {
  if (state.status !== "running") return [];
  const elapsedMs =
    state.elapsedMs +
    Math.max(
      0,
      Date.parse(state.updatedAt) -
        Date.parse(state.sessionStartedAt ?? state.updatedAt),
    );
  return [{ type: "session.recovered", elapsedMs }];
});
export type LiveLog = Awaited<ReturnType<typeof LiveLog.create>>;
export const readLiveRun = (path: string) => LiveLog.read(path);

export async function isLiveRun(path: string): Promise<boolean> {
  try {
    const first: unknown = JSON.parse(
      (await readFile(path, "utf8")).split("\n", 1)[0] ?? "",
    );
    return (
      typeof first === "object" &&
      first !== null &&
      "event" in first &&
      typeof first.event === "object" &&
      first.event !== null &&
      "type" in first.event &&
      first.event.type === "live.created"
    );
  } catch {
    return false;
  }
}
