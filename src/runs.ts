import { z } from "zod";
import { contributionsFor, type Passage, stepCount } from "./composition.ts";
import { type JournalEvent, journalFor } from "./journal.ts";
import {
  type Contribution,
  configSchema,
  storedScoreSchema,
} from "./schema.ts";

const contributionSchema = z.strictObject({
  id: z.string(),
  participantId: z.string(),
  source: z.literal("script"),
  text: z.string(),
  respondingToPassageId: z.string().nullable(),
});
const messageSchema = z.strictObject({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});
const bodySchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("run.created"),
    score: storedScoreSchema,
    config: configSchema,
    sourceRunId: z.uuid().optional(),
    stepLimit: z.number().int().positive().optional(),
  }),
  z.strictObject({
    type: z.literal("batch.admitted"),
    batchIndex: z.number().int().nonnegative(),
    contributions: z.array(contributionSchema).min(1),
  }),
  z.strictObject({
    type: z.literal("generation.started"),
    attemptId: z.uuid(),
    messages: z.array(messageSchema).min(1),
  }),
  z.strictObject({
    type: z.literal("generation.failed"),
    attemptId: z.uuid(),
    reason: z.enum(["failed", "aborted", "interrupted"]),
    code: z
      .enum(["timeout", "aborted", "empty", "provider", "truncated"])
      .optional(),
    status: z.number().int().min(100).max(599).optional(),
  }),
  z.strictObject({
    type: z.literal("passage.accepted"),
    attemptId: z.uuid(),
    passageId: z.uuid(),
    text: z.string().min(1).max(500_000),
    durationMs: z.number().nonnegative(),
    usage: z
      .strictObject({
        inputTokens: z.number().nonnegative().optional(),
        outputTokens: z.number().nonnegative().optional(),
        totalTokens: z.number().nonnegative().optional(),
      })
      .optional(),
  }),
  z.strictObject({ type: z.literal("run.completed") }),
]);
export type RunEvent = JournalEvent<z.infer<typeof bodySchema>>;
export type EventBody = z.infer<typeof bodySchema>;
export type RunState = {
  runId: string;
  score: z.infer<typeof storedScoreSchema>;
  totalSteps: number;
  config: z.infer<typeof configSchema>;
  passages: (Passage & { batchIndex: number })[];
  admitted: Contribution[][];
  pending: Contribution[] | null;
  attemptId: string | null;
  complete: boolean;
};

function rebuild(events: RunEvent[]): RunState {
  const first = events[0];
  if (first?.event.type !== "run.created")
    throw new Error("Run log has no valid opening record.");
  const availableSteps = stepCount(first.event.score);
  const totalSteps = first.event.stepLimit ?? availableSteps;
  if (totalSteps > availableSteps)
    throw new Error("Run step limit exceeds its score.");
  const state: RunState = {
    runId: first.runId,
    score: first.event.score,
    totalSteps,
    config: first.event.config,
    passages: [],
    admitted: [],
    pending: null,
    attemptId: null,
    complete: false,
  };
  const attempts = new Set<string>();
  const passageIds = new Set<string>();
  for (const [index, record] of events.entries()) {
    if (
      record.runId !== state.runId ||
      record.sequence !== index + 1 ||
      state.complete
    )
      throw new Error("Run log has inconsistent ordering or identity.");
    const event = record.event;
    switch (event.type) {
      case "run.created":
        if (index !== 0)
          throw new Error("Run log contains multiple opening records.");
        break;
      case "batch.admitted": {
        if (
          state.pending ||
          event.batchIndex !== state.passages.length ||
          event.batchIndex >= state.totalSteps
        )
          throw new Error("Run log has an out-of-order batch.");
        const expected = contributionsFor(
          state.score,
          event.batchIndex,
          state.passages.at(-1)?.id ?? null,
        );
        if (JSON.stringify(expected) !== JSON.stringify(event.contributions))
          throw new Error("Run log contributions do not match its score.");
        state.pending = event.contributions;
        state.admitted.push(event.contributions);
        break;
      }
      case "generation.started":
        if (!state.pending || state.attemptId || attempts.has(event.attemptId))
          throw new Error("Run log has an invalid generation attempt.");
        attempts.add(event.attemptId);
        state.attemptId = event.attemptId;
        break;
      case "generation.failed":
        if (state.attemptId !== event.attemptId)
          throw new Error("Run log failure refers to an unknown attempt.");
        state.attemptId = null;
        break;
      case "passage.accepted":
        if (
          !state.pending ||
          state.attemptId !== event.attemptId ||
          passageIds.has(event.passageId) ||
          !event.text.trim()
        )
          throw new Error("Run log passage refers to an invalid attempt.");
        passageIds.add(event.passageId);
        state.passages.push({
          id: event.passageId,
          text: event.text,
          batchIndex: state.passages.length,
        });
        state.pending = null;
        state.attemptId = null;
        break;
      case "run.completed":
        if (state.pending || state.passages.length !== state.totalSteps)
          throw new Error("Run log completes before all batches are accepted.");
        state.complete = true;
        break;
    }
  }
  return state;
}

export const RunLog = journalFor(bodySchema, rebuild, (state): EventBody[] =>
  state.attemptId
    ? [
        {
          type: "generation.failed",
          attemptId: state.attemptId,
          reason: "interrupted",
        },
      ]
    : [],
);
export type RunLog = Awaited<ReturnType<typeof RunLog.create>>;
export const readRun = (path: string) => RunLog.read(path);
