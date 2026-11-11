import { createHash } from "node:crypto";
import { z } from "zod";

export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const id = z.uuid();
export const text = z
  .string()
  .max(12000)
  .refine((s) => !/[\uD800-\uDFFF]/u.test(s), "Invalid Unicode.");
export const revisionSchema = z.strictObject({
  requestId: id,
  roundId: id,
  expectedRevision: z.number().int().nonnegative(),
  text,
  confirmed: z.boolean(),
  matching: z.boolean(),
  source: z.enum(["typed", "transcript"]).default("typed"),
  recordingId: id.optional(),
});
export type RevisionInput = z.infer<typeof revisionSchema>;
export const contributionSchema = z.strictObject({
  id: z.string(),
  participantId: id,
  roundId: id,
  prompt: z.string(),
  revision: z.number().int().positive(),
  text,
  confirmed: z.boolean(),
  matching: z.boolean(),
  source: z.enum(["typed", "transcript"]),
  recordingId: id.optional(),
  savedAt: z.iso.datetime(),
});
export const snapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id,
  sessionId: id,
  roundId: id,
  createdAt: z.iso.datetime(),
  contributions: z.array(contributionSchema),
  eligible: z.array(id),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const modelSchema = z.strictObject({
  provider: z.enum(["openai", "ollama"]),
  model: z.string().min(1).max(150),
  maxOutputTokens: z.number().int().min(100).max(16000),
  timeoutMs: z.number().int().min(1000).max(360000),
});
export const operationConfigSchema = z.strictObject({
  model: modelSchema,
  promptVersion: z.literal("bounded-v1"),
  maxInputCharacters: z.number().int().min(1).max(2000000),
  mode: z.enum(["collaboration", "similarity"]).optional(),
  oddPolicy: z.enum(["reject", "trio"]).optional(),
  maxCalls: z.number().int().nonnegative().max(20000).optional(),
  embeddingModel: z.string().min(1).max(150).optional(),
  avoidPrevious: z.boolean().default(false),
  forbiddenPairs: z
    .array(z.tuple([id, id]))
    .max(20000)
    .default([]),
});
export type OperationConfig = z.input<typeof operationConfigSchema>;
export type OperationKind = "analysis" | "voice" | "matching";
export type Operation = {
  id: string;
  snapshotId: string;
  snapshotHash: string;
  kind: OperationKind;
  config: OperationConfig;
  state:
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "interrupted";
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  progress?: string;
  error?: string;
  result?: unknown;
  published: boolean;
};
const finding = z.strictObject({
  text: z.string().min(1).max(800),
  sourceRefs: z.array(z.string()).min(1).max(180),
});
export const analysisSchema = z.strictObject({
  themes: z.array(finding).max(12),
  similarities: z.array(finding).max(12),
  tensions: z.array(finding).max(12),
  conflicts: z.array(finding).max(12),
  outlyingConcerns: z.array(finding).max(12),
  questions: z.array(finding).max(12),
});
export const voiceSchema = z.strictObject({
  text: z.string().min(1).max(8000),
  sourceRefs: z.array(z.string()).min(1),
});
export const matchingSchema = z
  .object({
    schemaVersion: z.literal(1),
    jobId: z.string(),
    snapshot: z.object({ id: z.string(), hash: z.string() }),
    mode: z.enum(["collaboration", "similarity"]),
    groups: z.array(
      z.object({
        id: z.string(),
        participantIds: z.array(id).min(2).max(3),
        sourceRefs: z.record(z.string(), z.array(z.string())),
        reviewRequired: z.boolean(),
      }),
    ),
  })
  .passthrough();
export class SessionError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
