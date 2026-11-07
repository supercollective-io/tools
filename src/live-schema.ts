import { z } from "zod";
import { baseConfigSchema, scoreSchema } from "./schema.ts";

export const liveConfigSchema = baseConfigSchema
  .extend({
    schemaVersion: z.literal(2),
    live: z.strictObject({
      participants: baseConfigSchema.shape.composer,
      instructions: z.string().trim().min(1).max(12_000),
      maxDurationMs: z.number().int().min(1_000).max(3_600_000),
      feedbackIntervalMs: z.number().int().min(100).max(60_000),
      refreshIntervalMs: z.number().int().min(100).max(60_000),
      maxContextCharacters: z.number().int().min(1_000).max(1_000_000),
      composerStyle: z.enum(["configured"]).optional(),
      mode: z.enum(["continuous", "chunked", "fixed", "typed"]).optional(),
      // Absent in earlier journals: retain their implicit 96-token ceiling.
      serialRequestTokens: z.number().int().min(1).max(32_768).optional(),
      score: scoreSchema.optional(),
    }),
  })
  .superRefine((config, ctx) => {
    if (config.live.mode === "fixed" && !config.live.score)
      ctx.addIssue({
        code: "custom",
        path: ["live", "score"],
        message: "Fixed mode requires a frozen score.",
      });
  });

export type LiveConfig = z.infer<typeof liveConfigSchema>;
