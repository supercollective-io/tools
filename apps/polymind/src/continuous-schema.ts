import { z } from "zod";
import { baseConfigSchema } from "./schema.ts";

export const continuousConfigSchema = baseConfigSchema.extend({
  continuous: z
    .strictObject({
      maxTurnsPerParticipant: z.number().int().min(1).max(1_000),
      concurrency: z.number().int().min(1).max(32),
      composerIntervalMs: z.number().int().min(100).max(60_000),
      maxCharactersPerParticipant: z.number().int().min(1).max(12_000),
      maxPendingCharactersPerParticipant: z.number().int().min(1).max(200_000),
      participants: baseConfigSchema.shape.composer,
      instructions: z.string().trim().min(1).max(12_000),
      history: z.strictObject({
        maxTurns: z.number().int().min(0).max(100),
        maxCharacters: z.number().int().min(0).max(200_000),
      }),
    })
    .refine(
      (settings) =>
        settings.maxPendingCharactersPerParticipant >=
        settings.maxCharactersPerParticipant,
      "Pending character capacity must be at least the per-participant batch size.",
    ),
});

export type ContinuousConfig = z.infer<typeof continuousConfigSchema>;
