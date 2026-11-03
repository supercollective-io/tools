import { readFile } from "node:fs/promises";
import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const text = z.string().trim().min(1).max(12_000);
const fragment = z.strictObject({ id, text });
// Historical scores remain readable so saved rehearsals keep their exact inputs.
export const legacyScoreSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    title: z.string().trim().min(1).max(200),
    voices: z
      .array(
        z.strictObject({
          id,
          name: text,
          fragments: z.array(fragment).min(1).max(200),
        }),
      )
      .min(1)
      .max(100),
    batches: z
      .array(
        z.strictObject({
          id,
          fragments: z
            .array(z.strictObject({ voiceId: id, fragmentId: id }))
            .min(1)
            .max(100),
        }),
      )
      .min(1)
      .max(1000),
  })
  .superRefine((score, ctx) => {
    const seenVoices = new Set<string>();
    const known = new Set<string>();
    for (const voice of score.voices) {
      if (seenVoices.has(voice.id))
        ctx.addIssue({ code: "custom", message: "Voice IDs must be unique." });
      seenVoices.add(voice.id);
      for (const item of voice.fragments) {
        const key = `${voice.id}/${item.id}`;
        if (known.has(key))
          ctx.addIssue({
            code: "custom",
            message: "Fragment IDs must be unique within each voice.",
          });
        known.add(key);
      }
    }
    const batches = new Set<string>();
    const admitted = new Set<string>();
    for (const batch of score.batches) {
      if (batches.has(batch.id))
        ctx.addIssue({ code: "custom", message: "Batch IDs must be unique." });
      batches.add(batch.id);
      for (const ref of batch.fragments) {
        const key = `${ref.voiceId}/${ref.fragmentId}`;
        if (!known.has(key))
          ctx.addIssue({
            code: "custom",
            message: "Every score reference must name an existing fragment.",
          });
        if (admitted.has(key))
          ctx.addIssue({
            code: "custom",
            message: "A fragment can appear only once in a score.",
          });
        admitted.add(key);
      }
    }
  });

export const scoreSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    title: z.string().trim().min(1).max(200),
    chunkPercent: z.number().int().min(1).max(100),
    voices: z
      .array(
        z.strictObject({
          id,
          name: text,
          // Whitespace belongs to the contribution and must survive slicing/replay.
          text: z
            .string()
            .min(1)
            .max(120_000)
            .refine(
              (value) => value.trim().length > 0,
              "A contribution must contain text.",
            ),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((score, ctx) => {
    if (
      new Set(score.voices.map((voice) => voice.id)).size !==
      score.voices.length
    )
      ctx.addIssue({ code: "custom", message: "Voice IDs must be unique." });
  });

export const storedScoreSchema = z.union([scoreSchema, legacyScoreSchema]);

const baseUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    ["http:", "https:"].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
  );
}, "Use an HTTP(S) URL without credentials, query parameters or a fragment.");

const baseConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  composer: z
    .strictObject({
      provider: z.enum(["openai", "ollama"]),
      model: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .refine(
          (value) => !value.startsWith("REPLACE_"),
          "Replace the example model name before generating.",
        ),
      baseUrl: baseUrl.optional(),
      temperature: z.number().min(0).max(2).optional(),
      think: z.boolean().optional(),
      maxOutputTokens: z.number().int().min(1).max(32_768),
      timeoutMs: z.number().int().min(100).max(600_000),
    })
    .refine(
      (value) => value.provider === "ollama" || value.think === undefined,
      "think is an Ollama-only setting.",
    ),
  instructions: text,
  history: z.strictObject({
    maxPassages: z.number().int().min(0).max(100),
    maxCharacters: z.number().int().min(0).max(200_000),
  }),
});

export const scenarioSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    title: z.string().trim().min(1).max(200),
    openingInvitation: text,
    voices: z
      .array(
        z.strictObject({ id, name: text, perspective: text, background: text }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((scenario, ctx) => {
    if (
      new Set(scenario.voices.map((voice) => voice.id)).size !==
      scenario.voices.length
    )
      ctx.addIssue({ code: "custom", message: "Voice IDs must be unique." });
  });

const simulationSettingsSchema = z.strictObject({
  maxRounds: z.number().int().min(1).max(1000),
  concurrency: z.number().int().min(1).max(32),
  intervalMs: z.number().int().min(0).max(60_000),
  participants: baseConfigSchema.shape.composer,
  instructions: text,
  history: z.strictObject({
    maxTurns: z.number().int().min(0).max(100),
    maxCharacters: z.number().int().min(0).max(200_000),
  }),
});

export const configSchema = baseConfigSchema.extend({
  simulation: simulationSettingsSchema.optional(),
});
export const simulationConfigSchema = baseConfigSchema.extend({
  simulation: simulationSettingsSchema,
});
export type SimulationScenario = z.infer<typeof scenarioSchema>;
export type SimulationConfig = z.infer<typeof simulationConfigSchema>;

export type ContinuousScore = z.infer<typeof scoreSchema>;
export type LegacyScore = z.infer<typeof legacyScoreSchema>;
export type Score = z.infer<typeof storedScoreSchema>;
export type Config = z.infer<typeof configSchema>;
export type Contribution = {
  id: string;
  participantId: string;
  source: "script" | "simulated";
  text: string;
  respondingToPassageId: string | null;
};

export function parse<T>(
  schema: z.ZodType<T>,
  value: unknown,
  label: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${label}: ${issues}`);
  }
  return result.data;
}

export async function readJson<T>(
  path: string,
  schema: z.ZodType<T>,
  label: string,
): Promise<T> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch {
    throw new Error(`Cannot read ${label} file.`);
  }
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  return parse(schema, value, label);
}
