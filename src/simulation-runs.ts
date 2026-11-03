import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Passage } from "./composition.ts";
import { type JournalEvent, journalFor } from "./journal.ts";
import {
  type Contribution,
  type SimulationConfig,
  type SimulationScenario,
  scenarioSchema,
  simulationConfigSchema,
} from "./schema.ts";

const responseText = z
  .string()
  .min(1)
  .max(500_000)
  .refine((value) => value.trim().length > 0);
const recordedResponseSchema = z.strictObject({
  participantId: z.string(),
  text: responseText,
  respondingToPassageId: z.string().nullable(),
});
export type RecordedResponse = z.infer<typeof recordedResponseSchema>;
const messages = z
  .array(
    z.strictObject({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    }),
  )
  .min(1);
const usage = z
  .strictObject({
    inputTokens: z.number().nonnegative().optional(),
    outputTokens: z.number().nonnegative().optional(),
    totalTokens: z.number().nonnegative().optional(),
  })
  .optional();
const attempt = {
  roundIndex: z.number().int().nonnegative(),
  attemptId: z.uuid(),
};
const failure = {
  reason: z.enum(["failed", "aborted", "interrupted"]),
  code: z
    .enum(["timeout", "aborted", "empty", "provider", "truncated"])
    .optional(),
  status: z.number().int().min(100).max(599).optional(),
};
const contributionSchema = z.strictObject({
  id: z.string(),
  participantId: z.string(),
  source: z.literal("simulated"),
  text: z.string(),
  respondingToPassageId: z.string().nullable(),
});
const bodySchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("simulation.created"),
    scenario: scenarioSchema,
    config: simulationConfigSchema,
    sourceRunId: z.uuid().optional(),
    recordedRounds: z
      .array(z.array(recordedResponseSchema))
      .min(1)
      .max(1000)
      .optional(),
  }),
  z.strictObject({
    type: z.literal("round.started"),
    roundIndex: attempt.roundIndex,
    respondingToPassageId: z.string().nullable(),
  }),
  z.strictObject({
    type: z.literal("participant.started"),
    ...attempt,
    participantId: z.string(),
    messages,
  }),
  z.strictObject({
    type: z.literal("participant.failed"),
    ...attempt,
    participantId: z.string(),
    ...failure,
  }),
  z.strictObject({
    type: z.literal("participant.responded"),
    ...attempt,
    participantId: z.string(),
    respondingToPassageId: z.string().nullable(),
    text: responseText,
    durationMs: z.number().nonnegative(),
    usage,
  }),
  z.strictObject({
    type: z.literal("participant.replayed"),
    roundIndex: attempt.roundIndex,
    ...recordedResponseSchema.shape,
  }),
  z.strictObject({
    type: z.literal("round.admitted"),
    roundIndex: attempt.roundIndex,
    contributions: z.array(contributionSchema).min(1),
  }),
  z.strictObject({
    type: z.literal("generation.started"),
    ...attempt,
    messages,
  }),
  z.strictObject({
    type: z.literal("generation.failed"),
    ...attempt,
    ...failure,
  }),
  z.strictObject({
    type: z.literal("passage.accepted"),
    ...attempt,
    passageId: z.uuid(),
    text: z
      .string()
      .min(1)
      .max(500_000)
      .refine((value) => value.trim().length > 0),
    durationMs: z.number().nonnegative(),
    usage,
  }),
  z.strictObject({
    type: z.literal("round.completed"),
    roundIndex: attempt.roundIndex,
  }),
  z.strictObject({ type: z.literal("run.completed") }),
]);
export type SimulationEvent = z.infer<typeof bodySchema>;
export type RoundState = {
  index: number;
  respondingToPassageId: string | null;
  responses: Record<string, RecordedResponse>;
  attempts: Record<string, string>;
  admitted: Contribution[] | null;
  composerAttemptId: string | null;
  passage: Passage | null;
  complete: boolean;
};
export type SimulationState = {
  runId: string;
  scenario: SimulationScenario;
  config: SimulationConfig;
  rounds: RoundState[];
  roundsCompleted: number;
  passages: (Passage & { roundIndex: number })[];
  complete: boolean;
  recordedRounds?: RecordedResponse[][];
};

export function roundContributions(
  state: SimulationState,
  round: RoundState,
): (Contribution & { source: "simulated" })[] {
  return state.scenario.voices.flatMap((voice) => {
    const response = round.responses[voice.id];
    if (!response) return [];
    return [
      {
        id: `round_${round.index + 1}:${voice.id}`,
        participantId: voice.id,
        source: "simulated" as const,
        text: response.text,
        respondingToPassageId: response.respondingToPassageId,
      },
    ];
  });
}

function rebuild(records: JournalEvent<SimulationEvent>[]): SimulationState {
  const first = records[0];
  if (first?.event.type !== "simulation.created")
    throw new Error("Simulation log has no valid opening record.");
  const opening = first.event;
  const ids = new Set(opening.scenario.voices.map((voice) => voice.id));
  if (opening.recordedRounds) {
    if (
      !opening.sourceRunId ||
      opening.recordedRounds.length !== opening.config.simulation.maxRounds
    )
      throw new Error(
        "Recorded rounds require their source run and exact round count.",
      );
    for (const responses of opening.recordedRounds) {
      if (
        responses.length !== ids.size ||
        new Set(responses.map((response) => response.participantId)).size !==
          ids.size ||
        responses.some((response) => !ids.has(response.participantId)) ||
        new Set(responses.map((response) => response.respondingToPassageId))
          .size !== 1
      )
        throw new Error(
          "Recorded rounds must contain one response from every participant to the same collective passage.",
        );
    }
  }
  const state: SimulationState = {
    runId: first.runId,
    scenario: opening.scenario,
    config: opening.config,
    rounds: [],
    roundsCompleted: 0,
    passages: [],
    complete: false,
    ...(opening.recordedRounds
      ? { recordedRounds: opening.recordedRounds }
      : {}),
  };
  const attempts = new Set<string>();
  const passages = new Set<string>();
  for (const [index, record] of records.entries()) {
    if (
      record.runId !== state.runId ||
      record.sequence !== index + 1 ||
      state.complete
    )
      throw new Error("Simulation log has inconsistent ordering or identity.");
    const event = record.event;
    if (event.type === "simulation.created") {
      if (index !== 0)
        throw new Error("Simulation log contains multiple opening records.");
      continue;
    }
    if (event.type === "run.completed") {
      if (state.roundsCompleted !== state.config.simulation.maxRounds)
        throw new Error("Simulation completes before all rounds finish.");
      state.complete = true;
      continue;
    }
    if (event.type === "round.started") {
      const expectedAnchor = state.recordedRounds
        ? state.recordedRounds[event.roundIndex]?.[0]?.respondingToPassageId
        : (state.passages.at(-1)?.id ?? null);
      if (
        event.roundIndex !== state.roundsCompleted ||
        state.rounds.length !== state.roundsCompleted ||
        event.roundIndex >= state.config.simulation.maxRounds ||
        event.respondingToPassageId !== expectedAnchor
      )
        throw new Error(
          "Simulation round has invalid ordering or collective context.",
        );
      state.rounds.push({
        index: event.roundIndex,
        respondingToPassageId: event.respondingToPassageId,
        responses: Object.create(null),
        attempts: Object.create(null),
        admitted: null,
        composerAttemptId: null,
        passage: null,
        complete: false,
      });
      continue;
    }
    const round = state.rounds.at(-1);
    if (!round || round.complete || round.index !== event.roundIndex)
      throw new Error("Simulation event refers to an inactive round.");
    if ("participantId" in event && !ids.has(event.participantId))
      throw new Error("Simulation event refers to an unknown participant.");
    switch (event.type) {
      case "participant.started":
        if (
          state.recordedRounds ||
          round.admitted !== null ||
          round.responses[event.participantId] ||
          round.attempts[event.participantId] ||
          attempts.has(event.attemptId)
        )
          throw new Error("Invalid participant generation attempt.");
        attempts.add(event.attemptId);
        round.attempts[event.participantId] = event.attemptId;
        break;
      case "participant.failed":
        if (round.attempts[event.participantId] !== event.attemptId)
          throw new Error("Participant failure refers to an unknown attempt.");
        delete round.attempts[event.participantId];
        break;
      case "participant.responded":
        if (
          round.attempts[event.participantId] !== event.attemptId ||
          event.respondingToPassageId !== round.respondingToPassageId
        )
          throw new Error(
            "Participant response has invalid attempt or collective context.",
          );
        round.responses[event.participantId] = {
          participantId: event.participantId,
          text: event.text,
          respondingToPassageId: event.respondingToPassageId,
        };
        delete round.attempts[event.participantId];
        break;
      case "participant.replayed": {
        const expected = state.recordedRounds?.[round.index]?.find(
          (response) => response.participantId === event.participantId,
        );
        if (
          !expected ||
          round.responses[event.participantId] ||
          round.admitted !== null ||
          expected.text !== event.text ||
          expected.respondingToPassageId !== event.respondingToPassageId
        )
          throw new Error(
            "Replayed response differs from its recorded source.",
          );
        round.responses[event.participantId] = expected;
        break;
      }
      case "round.admitted":
        if (
          round.admitted !== null ||
          Object.keys(round.responses).length !== ids.size ||
          Object.keys(round.attempts).length ||
          JSON.stringify(event.contributions) !==
            JSON.stringify(roundContributions(state, round))
        )
          throw new Error(
            "Round admission must match all completed participant responses.",
          );
        round.admitted = event.contributions;
        break;
      case "generation.started":
        if (
          !round.admitted?.length ||
          round.composerAttemptId ||
          round.passage ||
          attempts.has(event.attemptId)
        )
          throw new Error("Invalid collective generation attempt.");
        attempts.add(event.attemptId);
        round.composerAttemptId = event.attemptId;
        break;
      case "generation.failed":
        if (round.composerAttemptId !== event.attemptId)
          throw new Error("Collective failure refers to an unknown attempt.");
        round.composerAttemptId = null;
        break;
      case "passage.accepted":
        if (
          round.composerAttemptId !== event.attemptId ||
          passages.has(event.passageId)
        )
          throw new Error("Collective passage refers to an invalid attempt.");
        passages.add(event.passageId);
        round.passage = { id: event.passageId, text: event.text };
        state.passages.push({ ...round.passage, roundIndex: round.index });
        round.composerAttemptId = null;
        break;
      case "round.completed":
        if (
          round.admitted === null ||
          round.composerAttemptId ||
          !round.passage
        )
          throw new Error(
            "Round completes before its responses and collective passage are saved.",
          );
        round.complete = true;
        state.roundsCompleted++;
        break;
    }
  }
  return state;
}

export const SimulationLog = journalFor(bodySchema, rebuild, (state) => {
  const round = state.rounds.at(-1);
  if (!round || round.complete) return [];
  const events: SimulationEvent[] = Object.entries(round.attempts).map(
    ([participantId, attemptId]) => ({
      type: "participant.failed",
      roundIndex: round.index,
      participantId,
      attemptId,
      reason: "interrupted",
    }),
  );
  if (round.composerAttemptId)
    events.push({
      type: "generation.failed",
      roundIndex: round.index,
      attemptId: round.composerAttemptId,
      reason: "interrupted",
    });
  return events;
});
export type SimulationLog = Awaited<ReturnType<typeof SimulationLog.create>>;
export const readSimulationRun = (path: string) => SimulationLog.read(path);

export function recordedRoundsFor(
  state: SimulationState,
): RecordedResponse[][] {
  return state.rounds
    .filter(
      (round) =>
        Object.keys(round.responses).length === state.scenario.voices.length,
    )
    .map((round) =>
      state.scenario.voices.map((voice) => {
        const response = round.responses[voice.id];
        if (!response) throw new Error("Round is missing a recorded response.");
        return { ...response };
      }),
    );
}

export async function isSimulationRun(path: string): Promise<boolean> {
  try {
    const contents = await readFile(path, "utf8");
    const first: unknown = JSON.parse(contents.split("\n", 1)[0] ?? "");
    return (
      typeof first === "object" &&
      first !== null &&
      "event" in first &&
      typeof first.event === "object" &&
      first.event !== null &&
      "type" in first.event &&
      first.event.type === "simulation.created"
    );
  } catch {
    // The original reader supplies its existing sanitised error for other logs.
    return false;
  }
}
