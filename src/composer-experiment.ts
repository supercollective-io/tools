import { type LiveConfig, liveConfigSchema } from "./live-schema.ts";
import type { Config, ContinuousScore, SimulationScenario } from "./schema.ts";

/** Use the live append-only composer with a complete, frozen source schedule. */
export function fixedComposerExperiment(
  score: ContinuousScore,
  config: Config,
): { scenario: SimulationScenario; config: LiveConfig } {
  return {
    scenario: {
      schemaVersion: 1,
      title: score.title,
      openingInvitation: score.title,
      voices: score.voices.map(({ id, name }) => ({
        id,
        name,
        perspective: "Prewritten contribution",
        background: "The frozen score supplies this participant's writing.",
      })),
    },
    config: liveConfigSchema.parse({
      composer: config.composer,
      instructions: config.instructions,
      history: config.history,
      schemaVersion: 2,
      live: {
        mode: "fixed",
        serialRequestTokens: config.composer.maxOutputTokens,
        score,
        // Required by the live schema; fixed mode never calls this model.
        participants: config.composer,
        instructions: "Use the frozen source text.",
        maxDurationMs: 3_600_000,
        feedbackIntervalMs: 2_000,
        refreshIntervalMs: 2_000,
        maxContextCharacters: 64_000,
      },
    }),
  };
}
