import { z } from "zod";
import { baseConfigSchema } from "./schema.ts";

export const liveConfigSchema = baseConfigSchema.extend({
  schemaVersion: z.literal(2),
  live: z.strictObject({
    participants: baseConfigSchema.shape.composer,
    instructions: z.string().trim().min(1).max(12_000),
    maxDurationMs: z.number().int().min(1_000).max(3_600_000),
    feedbackIntervalMs: z.number().int().min(100).max(60_000),
    refreshIntervalMs: z.number().int().min(100).max(60_000),
    maxContextCharacters: z.number().int().min(1_000).max(1_000_000),
  }),
});

export type LiveConfig = z.infer<typeof liveConfigSchema>;
