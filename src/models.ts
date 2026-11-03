import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";

export type ModelConfig = {
  provider: "openai" | "ollama";
  model: string;
  baseUrl?: string;
  temperature?: number;
  think?: boolean;
  maxOutputTokens: number;
  timeoutMs: number;
};

export type PromptMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ModelRequest = {
  config: ModelConfig;
  messages: PromptMessage[];
  signal: AbortSignal;
};

export type ModelResult = {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
};

export type Generate = (
  request: ModelRequest,
  onToken: (token: string) => void | Promise<void>,
) => Promise<ModelResult>;

export type ModelErrorCode =
  | "timeout"
  | "aborted"
  | "empty"
  | "truncated"
  | "provider";

// An empty callbacks array does not override LangChain's environment tracing.
// Refuse it explicitly rather than risk sending prompts to a hosted tracer.
export function validateModelEnvironment(config: ModelConfig): void {
  for (const name of [
    "LANGSMITH_TRACING",
    "LANGSMITH_TRACING_V2",
    "LANGCHAIN_TRACING",
    "LANGCHAIN_TRACING_V2",
    "LANGCHAIN_VERBOSE",
  ]) {
    if (process.env[name]?.toLowerCase() === "true") {
      throw new Error(
        `Unset ${name} before running models; hosted tracing and verbose provider logging are disabled.`,
      );
    }
  }
  if (config.provider === "openai" && !process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OpenAI requires OPENAI_API_KEY in the environment.");
  }
}

function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block: unknown) => {
      if (typeof block !== "object" || block === null) return "";
      const value = block as { type?: unknown; text?: unknown };
      return value.type === "text" && typeof value.text === "string"
        ? value.text
        : "";
    })
    .join("");
}

function safeStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = error as { status?: unknown; status_code?: unknown };
  const status = value.status ?? value.status_code;
  return typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
    ? status
    : undefined;
}

export const generate: Generate = async (
  { config, messages, signal },
  onToken,
) => {
  validateModelEnvironment(config);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  let timedOut = false;
  let emptyResponse = false;
  let truncated = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);

  try {
    controller.signal.throwIfAborted();
    const model =
      config.provider === "openai"
        ? new ChatOpenAI({
            model: config.model,
            apiKey: process.env.OPENAI_API_KEY,
            configuration: {
              baseURL: config.baseUrl ?? "https://api.openai.com/v1",
              logLevel: "off",
            },
            ...(config.temperature === undefined
              ? {}
              : { temperature: config.temperature }),
            maxCompletionTokens: config.maxOutputTokens,
            timeout: config.timeoutMs,
            maxRetries: 0,
            streamUsage: true,
            verbose: false,
          })
        : new ChatOllama({
            model: config.model,
            baseUrl: config.baseUrl ?? "http://127.0.0.1:11434",
            ...(config.temperature === undefined
              ? {}
              : { temperature: config.temperature }),
            ...(config.think === undefined ? {} : { think: config.think }),
            numPredict: config.maxOutputTokens,
            checkOrPullModel: false,
            maxRetries: 0,
            verbose: false,
          });
    const prompt = messages.map(({ role, content }) => {
      if (role === "system") return new SystemMessage(content);
      if (role === "assistant") return new AIMessage(content);
      return new HumanMessage(content);
    });
    const stream = await model.stream(prompt, {
      signal: controller.signal,
      callbacks: [],
    });
    let text = "";
    let usage: ModelResult["usage"];
    for await (const chunk of stream) {
      controller.signal.throwIfAborted();
      // Completion metadata may precede a separate final usage-only chunk.
      // Keep a detected cutoff rather than replacing it with later metadata.
      const finishReason =
        config.provider === "openai"
          ? chunk.response_metadata?.finish_reason
          : chunk.response_metadata?.done_reason;
      if (finishReason === "length") truncated = true;
      const token = textContent(chunk.content);
      if (token) {
        text += token;
        await onToken(token);
      }
      if (chunk.usage_metadata) {
        usage = {
          inputTokens: chunk.usage_metadata.input_tokens,
          outputTokens: chunk.usage_metadata.output_tokens,
          totalTokens: chunk.usage_metadata.total_tokens,
        };
      }
    }
    controller.signal.throwIfAborted();
    if (truncated)
      throw new Error("Model response reached its output token limit");
    if (!text.trim()) {
      emptyResponse = true;
      throw new Error("Empty model response");
    }
    return usage ? { text, usage } : { text };
  } catch (error) {
    const status = safeStatus(error);
    const code: ModelErrorCode = timedOut
      ? "timeout"
      : signal.aborted
        ? "aborted"
        : truncated
          ? "truncated"
          : emptyResponse
            ? "empty"
            : "provider";
    const message = timedOut
      ? `${config.provider} request timed out.`
      : signal.aborted
        ? `${config.provider} request aborted.`
        : truncated
          ? `${config.provider} response reached the output token limit and was not accepted.`
          : emptyResponse
            ? `${config.provider} returned an empty model response.`
            : `${config.provider} generation failed${status ? ` (HTTP ${status})` : ""}.`;
    // Do not attach the upstream error as a cause: it may contain credentials,
    // request headers, or a response body. Expose only a validated HTTP status.
    throw Object.assign(
      new Error(message),
      { code },
      status === undefined ? {} : { status },
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
};
