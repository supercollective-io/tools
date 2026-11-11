import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsStreaming,
} from "openai/resources/responses/responses";
import {
  type Generate,
  type ModelConfig,
  type PromptMessage,
  validateModelEnvironment,
} from "./models.ts";

/** Explicit offline-screen transport. Does not change the live model adapter. */
export function screenResponsesBody(
  config: ModelConfig,
  messages: PromptMessage[],
): ResponseCreateParamsStreaming {
  if (config.provider !== "openai" || config.reasoningEffort === undefined)
    throw new Error(
      "Responses screens require OpenAI and an explicit reasoning effort.",
    );
  return {
    model: config.model,
    input: messages.map(({ role, content }) => ({ role, content })),
    reasoning: {
      effort: config.reasoningEffort,
      ...(config.reasoningEffort === "none"
        ? {}
        : { summary: "auto" as const }),
    },
    max_output_tokens: config.maxOutputTokens,
    ...(config.temperature === undefined
      ? {}
      : { temperature: config.temperature }),
    stream: true,
    store: false,
  };
}

export const generateScreenResponses: Generate = async (
  { config, messages, signal },
  onToken,
) => {
  validateModelEnvironment(config);
  const body = screenResponsesBody(config, messages);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);
  let failure = "provider";
  try {
    controller.signal.throwIfAborted();
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: config.baseUrl ?? "https://api.openai.com/v1",
      maxRetries: 0,
      logLevel: "off",
      timeout: config.timeoutMs,
    });
    const stream = await client.responses.create(body, {
      signal: controller.signal,
    });
    let text = "";
    let completed: Response | undefined;
    for await (const event of stream) {
      controller.signal.throwIfAborted();
      if (event.type === "response.output_text.delta") {
        text += event.delta;
        await onToken(event.delta);
      } else if (event.type === "response.completed") {
        completed = event.response;
      } else if (event.type === "response.incomplete") {
        failure =
          event.response.incomplete_details?.reason === "max_output_tokens"
            ? "truncated"
            : "incomplete";
        throw new Error("Incomplete response");
      } else if (event.type === "response.failed" || event.type === "error") {
        throw new Error("Provider failure");
      }
      // Summary deltas, raw/opaque reasoning and provider metadata never reach onToken.
    }
    controller.signal.throwIfAborted();
    if (completed?.status !== "completed")
      throw new Error("Missing completion");
    const finalText = completed.output
      .flatMap((item) =>
        item.type === "message"
          ? item.content.flatMap((part) =>
              part.type === "output_text" ? [part.text] : [],
            )
          : [],
      )
      .join("");
    if (finalText !== text) {
      failure = "stream_mismatch";
      throw new Error("Stream mismatch");
    }
    if (!text.trim()) {
      failure = "empty";
      throw new Error("Empty response");
    }
    const summary = completed.output.flatMap((item) =>
      item.type === "reasoning"
        ? item.summary
            .filter((part) => part.type === "summary_text")
            .map((part) => part.text)
        : [],
    );
    return {
      text,
      finishReason: "stop",
      ...(completed.usage
        ? {
            usage: {
              inputTokens: completed.usage.input_tokens,
              outputTokens: completed.usage.output_tokens,
              totalTokens: completed.usage.total_tokens,
            },
          }
        : {}),
      reasoning: {
        summaryRequested: body.reasoning?.summary === "auto",
        summary,
        ...(completed.usage?.output_tokens_details?.reasoning_tokens ===
        undefined
          ? {}
          : {
              tokens: completed.usage.output_tokens_details.reasoning_tokens,
            }),
      },
    };
  } catch {
    const code = timedOut ? "timeout" : signal.aborted ? "aborted" : failure;
    // No upstream body, headers, error message or opaque reasoning is persisted.
    throw Object.assign(
      new Error(`OpenAI Responses screen failed (${code}).`),
      { code },
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
};
