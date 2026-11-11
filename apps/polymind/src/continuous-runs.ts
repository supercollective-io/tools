import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Passage } from "./composition.ts";
import {
  type ContinuousConfig,
  continuousConfigSchema,
} from "./continuous-schema.ts";
import { type JournalEvent, journalFor } from "./journal.ts";
import {
  type Contribution,
  type SimulationScenario,
  scenarioSchema,
} from "./schema.ts";

const messages = z
  .array(
    z.strictObject({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    }),
  )
  .min(1);
const code = z.enum(["timeout", "aborted", "empty", "truncated", "provider"]);
const durationMs = z.number().nonnegative();
const usage = z
  .strictObject({
    inputTokens: z.number().nonnegative().optional(),
    outputTokens: z.number().nonnegative().optional(),
    totalTokens: z.number().nonnegative().optional(),
  })
  .optional();
const contributionSchema = z.strictObject({
  id: z.string(),
  participantId: z.string(),
  source: z.literal("simulated"),
  text: z.string().min(1),
  respondingToPassageId: z.uuid().nullable(),
  turnId: z.uuid(),
  from: z.number().int().nonnegative(),
  to: z.number().int().positive(),
});

const bodySchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("continuous.created"),
    scenario: scenarioSchema,
    config: continuousConfigSchema,
  }),
  z.strictObject({
    type: z.literal("participant.started"),
    participantId: z.string(),
    turnIndex: z.number().int().nonnegative(),
    turnId: z.uuid(),
    respondingToPassageId: z.uuid().nullable(),
    messages,
  }),
  z.strictObject({
    type: z.literal("participant.delta"),
    turnId: z.uuid(),
    text: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("participant.finished"),
    turnId: z.uuid(),
    outcome: z.enum(["completed", "failed", "interrupted"]),
    code: code.optional(),
    durationMs: durationMs.optional(),
    usage,
  }),
  z.strictObject({
    type: z.literal("batch.admitted"),
    batchId: z.uuid(),
    contributions: z.array(contributionSchema).min(1),
  }),
  z.strictObject({ type: z.literal("batch.drained"), batchId: z.uuid() }),
  z.strictObject({
    type: z.literal("generation.started"),
    batchId: z.uuid(),
    attemptId: z.uuid(),
    messages,
  }),
  z.strictObject({
    type: z.literal("generation.failed"),
    batchId: z.uuid(),
    attemptId: z.uuid(),
    reason: z.enum(["failed", "aborted", "interrupted"]),
    code: code.optional(),
  }),
  z.strictObject({
    type: z.literal("passage.accepted"),
    batchId: z.uuid(),
    attemptId: z.uuid(),
    passageId: z.uuid(),
    text: z
      .string()
      .min(1)
      .max(500_000)
      .refine((text) => text.trim().length > 0),
    durationMs,
    usage,
  }),
  z.strictObject({ type: z.literal("run.completed") }),
]);

export type ContinuousEvent = z.infer<typeof bodySchema>;
export type ContinuousContribution = Contribution & {
  source: "simulated";
  turnId: string;
  from: number;
  to: number;
};
export type ContinuousTurn = {
  id: string;
  participantId: string;
  index: number;
  respondingToPassageId: string | null;
  text: string;
  consumed: number;
  status: "streaming" | "completed" | "failed" | "interrupted";
};
export type ContinuousBatch = {
  id: string;
  contributions: ContinuousContribution[];
  attemptId: string | null;
  passage: Passage | null;
  drained: boolean;
};
export type ContinuousState = {
  runId: string;
  scenario: SimulationScenario;
  config: ContinuousConfig;
  turns: ContinuousTurn[];
  batches: ContinuousBatch[];
  pendingBatch: ContinuousBatch | null;
  passages: Passage[];
  complete: boolean;
};

export function pendingCharacters(
  state: ContinuousState,
  participantId: string,
): number {
  return state.turns
    .filter((turn) => turn.participantId === participantId)
    .reduce(
      (total, turn) => total + Array.from(turn.text).length - turn.consumed,
      0,
    );
}

export function nextContributions(
  state: ContinuousState,
): ContinuousContribution[] {
  return state.scenario.voices.flatMap((voice) => {
    const turn = state.turns.find(
      (candidate) =>
        candidate.participantId === voice.id &&
        candidate.consumed < Array.from(candidate.text).length,
    );
    if (!turn) return [];
    const characters = Array.from(turn.text);
    const from = turn.consumed;
    const to = Math.min(
      characters.length,
      from + state.config.continuous.maxCharactersPerParticipant,
    );
    return [
      {
        id: `${turn.id}:${from}:${to}`,
        participantId: voice.id,
        source: "simulated" as const,
        text: characters.slice(from, to).join(""),
        respondingToPassageId: turn.respondingToPassageId,
        turnId: turn.id,
        from,
        to,
      },
    ];
  });
}

function rebuild(records: JournalEvent<ContinuousEvent>[]): ContinuousState {
  const first = records[0];
  if (first?.event.type !== "continuous.created")
    throw new Error("Continuous log has no valid opening record.");
  const state: ContinuousState = {
    runId: first.runId,
    scenario: first.event.scenario,
    config: first.event.config,
    turns: [],
    batches: [],
    pendingBatch: null,
    passages: [],
    complete: false,
  };
  const participants = new Set(state.scenario.voices.map((voice) => voice.id));
  const turnIds = new Set<string>();
  const batchIds = new Set<string>();
  const attemptIds = new Set<string>();
  const passageIds = new Set<string>();
  for (const [index, record] of records.entries()) {
    if (
      record.runId !== state.runId ||
      record.sequence !== index + 1 ||
      state.complete
    )
      throw new Error("Continuous log has inconsistent ordering or identity.");
    const event = record.event;
    switch (event.type) {
      case "continuous.created":
        if (index !== 0)
          throw new Error("Continuous log contains multiple opening records.");
        break;
      case "participant.started": {
        const ownTurns = state.turns.filter(
          (turn) => turn.participantId === event.participantId,
        );
        if (
          !participants.has(event.participantId) ||
          turnIds.has(event.turnId) ||
          event.turnIndex !== ownTurns.length ||
          ownTurns.length >= state.config.continuous.maxTurnsPerParticipant ||
          ownTurns.some((turn) => turn.status === "streaming") ||
          state.turns.filter((turn) => turn.status === "streaming").length >=
            state.config.continuous.concurrency ||
          event.respondingToPassageId !== (state.passages.at(-1)?.id ?? null)
        )
          throw new Error(
            "Continuous participant turn has invalid ordering or collective context.",
          );
        turnIds.add(event.turnId);
        state.turns.push({
          id: event.turnId,
          participantId: event.participantId,
          index: event.turnIndex,
          respondingToPassageId: event.respondingToPassageId,
          text: "",
          consumed: 0,
          status: "streaming",
        });
        break;
      }
      case "participant.delta": {
        const turn = state.turns.find(
          (candidate) => candidate.id === event.turnId,
        );
        if (turn?.status !== "streaming")
          throw new Error("Continuous delta refers to an inactive turn.");
        if (
          pendingCharacters(state, turn.participantId) +
            Array.from(event.text).length >
          state.config.continuous.maxPendingCharactersPerParticipant
        )
          throw new Error(
            "Continuous participant pending character capacity exceeded.",
          );
        turn.text += event.text;
        break;
      }
      case "participant.finished": {
        const turn = state.turns.find(
          (candidate) => candidate.id === event.turnId,
        );
        if (
          turn?.status !== "streaming" ||
          (event.outcome === "completed" && !turn.text.trim())
        )
          throw new Error(
            "Continuous turn completion refers to an invalid turn.",
          );
        turn.status = event.outcome;
        break;
      }
      case "batch.admitted": {
        const expected = nextContributions(state);
        if (
          state.pendingBatch ||
          batchIds.has(event.batchId) ||
          !expected.length ||
          JSON.stringify(event.contributions) !== JSON.stringify(expected)
        )
          throw new Error(
            "Continuous batch must match the next available participant portions.",
          );
        batchIds.add(event.batchId);
        for (const contribution of event.contributions) {
          const turn = state.turns.find(
            (candidate) => candidate.id === contribution.turnId,
          );
          if (!turn)
            throw new Error("Continuous batch refers to an unknown turn.");
          turn.consumed = contribution.to;
        }
        const batch: ContinuousBatch = {
          id: event.batchId,
          contributions: event.contributions,
          attemptId: null,
          passage: null,
          drained: false,
        };
        state.batches.push(batch);
        state.pendingBatch = batch;
        break;
      }
      case "batch.drained": {
        const batch = state.pendingBatch;
        if (
          !batch ||
          batch.id !== event.batchId ||
          batch.attemptId ||
          batch.passage ||
          batch.contributions.some((contribution) => contribution.text.trim())
        )
          throw new Error("Only an inactive whitespace batch can be drained.");
        batch.drained = true;
        state.pendingBatch = null;
        break;
      }
      case "generation.started": {
        const batch = state.pendingBatch;
        if (
          !batch ||
          batch.id !== event.batchId ||
          batch.attemptId ||
          batch.passage ||
          attemptIds.has(event.attemptId) ||
          !batch.contributions.some((contribution) => contribution.text.trim())
        )
          throw new Error("Invalid continuous collective generation attempt.");
        attemptIds.add(event.attemptId);
        batch.attemptId = event.attemptId;
        break;
      }
      case "generation.failed": {
        const batch = state.pendingBatch;
        if (
          !batch ||
          batch.id !== event.batchId ||
          batch.attemptId !== event.attemptId
        )
          throw new Error(
            "Continuous failure refers to an unknown collective attempt.",
          );
        batch.attemptId = null;
        break;
      }
      case "passage.accepted": {
        const batch = state.pendingBatch;
        if (
          !batch ||
          batch.id !== event.batchId ||
          batch.attemptId !== event.attemptId ||
          passageIds.has(event.passageId)
        )
          throw new Error(
            "Continuous passage refers to an invalid collective attempt.",
          );
        passageIds.add(event.passageId);
        batch.passage = { id: event.passageId, text: event.text };
        state.passages.push(batch.passage);
        batch.attemptId = null;
        state.pendingBatch = null;
        break;
      }
      case "run.completed":
        if (
          state.pendingBatch ||
          state.turns.some((turn) => turn.status === "streaming") ||
          state.scenario.voices.some(
            (voice) =>
              state.turns.filter((turn) => turn.participantId === voice.id)
                .length !== state.config.continuous.maxTurnsPerParticipant ||
              pendingCharacters(state, voice.id) > 0,
          )
        )
          throw new Error(
            "Continuous run completes before all turns and portions finish.",
          );
        state.complete = true;
        break;
    }
  }
  return state;
}

export const ContinuousLog = journalFor(
  bodySchema,
  rebuild,
  (state): ContinuousEvent[] => [
    ...state.turns
      .filter((turn) => turn.status === "streaming")
      .map(
        (turn): ContinuousEvent => ({
          type: "participant.finished",
          turnId: turn.id,
          outcome: "interrupted",
        }),
      ),
    ...(state.pendingBatch?.attemptId
      ? [
          {
            type: "generation.failed" as const,
            batchId: state.pendingBatch.id,
            attemptId: state.pendingBatch.attemptId,
            reason: "interrupted" as const,
          },
        ]
      : []),
  ],
);
export type ContinuousLog = Awaited<ReturnType<typeof ContinuousLog.create>>;
export const readContinuousRun = (path: string) => ContinuousLog.read(path);

export async function isContinuousRun(path: string): Promise<boolean> {
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
      first.event.type === "continuous.created"
    );
  } catch {
    return false;
  }
}
