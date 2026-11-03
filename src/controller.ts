import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { buildPrompt, contributionsFor } from "./composition.ts";
import type { Generate } from "./models.ts";
import type { RunLog } from "./runs.ts";

export class GenerationError extends Error {}

export class Controller {
  private busy = false;
  private log: RunLog;
  private generate: Generate;
  constructor(log: RunLog, generate: Generate) {
    this.log = log;
    this.generate = generate;
  }

  async advance(
    signal: AbortSignal,
    onToken: (text: string) => void,
  ): Promise<void> {
    if (this.busy) throw new Error("A generation is already running.");
    signal.throwIfAborted();
    this.busy = true;
    try {
      let state = this.log.state;
      if (state.complete) return;
      if (state.passages.length === state.totalSteps) {
        await this.log.append({ type: "run.completed" });
        return;
      }
      if (!state.pending) {
        await this.log.append({
          type: "batch.admitted",
          batchIndex: state.passages.length,
          contributions: contributionsFor(
            state.score,
            state.passages.length,
            state.passages.at(-1)?.id ?? null,
          ),
        });
        state = this.log.state;
      }
      if (!state.pending) throw new Error("No admitted contributions.");
      const messages = buildPrompt(state.config, state.pending, state.passages);
      const attemptId = randomUUID();
      await this.log.append({
        type: "generation.started",
        attemptId,
        messages,
      });
      const started = performance.now();
      let result: Awaited<ReturnType<Generate>>;
      try {
        result = await this.generate(
          { config: state.config.composer, messages, signal },
          onToken,
        );
        signal.throwIfAborted();
        if (!result.text.trim())
          throw Object.assign(new Error("Empty response."), { code: "empty" });
      } catch (error) {
        const status =
          typeof error === "object" && error !== null && "status" in error
            ? error.status
            : undefined;
        const rawCode =
          typeof error === "object" && error !== null && "code" in error
            ? error.code
            : undefined;
        const code =
          rawCode === "timeout" ||
          rawCode === "aborted" ||
          rawCode === "empty" ||
          rawCode === "truncated"
            ? rawCode
            : "provider";
        const detail =
          code === "timeout"
            ? "Provider request timed out"
            : code === "empty"
              ? "Provider returned no passage; increase maxOutputTokens or configure the model's thinking setting"
              : code === "truncated"
                ? "Provider cut off the passage at its token limit; incomplete text was not accepted"
                : "Generation failed";
        await this.log.append({
          type: "generation.failed",
          attemptId,
          reason: signal.aborted ? "aborted" : "failed",
          code,
          ...(typeof status === "number" &&
          Number.isInteger(status) &&
          status >= 100 &&
          status <= 599
            ? { status }
            : {}),
        });
        throw new GenerationError(
          signal.aborted
            ? "Generation interrupted; batch remains pending."
            : `${detail}${typeof status === "number" ? ` (HTTP ${status})` : ""}; batch remains pending. ${code === "truncated" ? "Retry to compose a fresh passage from the same inputs." : "Check provider availability and model configuration, then retry."}`,
        );
      }
      // Storage failure is fatal: do not append a second record to a potentially
      // torn write. Resume will reconcile the journal before another attempt.
      await this.log.append({
        type: "passage.accepted",
        attemptId,
        passageId: randomUUID(),
        text: result.text,
        durationMs: performance.now() - started,
        ...(result.usage ? { usage: result.usage } : {}),
      });
      if (this.log.state.passages.length === state.totalSteps)
        await this.log.append({ type: "run.completed" });
    } finally {
      this.busy = false;
    }
  }
}
