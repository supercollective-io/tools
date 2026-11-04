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
  numCtx?: number;
  rawPrefill?: boolean;
  reasoningEffort?: "none" | "low" | "medium" | "high";
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
  finishReason?: string;
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

type NativeChunk = {
  content: string;
  response_metadata?: { done_reason?: string; finish_reason?: string };
  usage_metadata?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

/** Continue an open model turn when Ollama's chat renderer closes assistant messages. */
async function* rawPrefillStream(
  config: ModelConfig,
  messages: PromptMessage[],
  signal: AbortSignal,
): AsyncGenerator<NativeChunk> {
  const prefix = messages.at(-1);
  if (prefix?.role !== "assistant" || !prefix.content)
    throw new Error("Raw prefill requires a saved assistant prefix.");
  const baseUrl = (config.baseUrl ?? "http://127.0.0.1:11434").replace(
    /\/$/u,
    "",
  );
  const options = {
    num_predict: config.maxOutputTokens,
    ...(config.temperature === undefined
      ? {}
      : { temperature: config.temperature }),
    ...(config.numCtx === undefined ? {} : { num_ctx: config.numCtx }),
  };
  const post = async (path: string, body: object) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Object.assign(new Error("Local model request failed."), {
        status: response.status,
      });
    }
    return response;
  };
  // Ollama's render-only endpoint supplies its own canonical chat template.
  // Removing the final assistant message leaves an open generation turn; append
  // the exact saved characters there, without closing it or guessing a join.
  const rendered: unknown = await (
    await post("/api/chat", {
      model: config.model,
      messages: messages.slice(0, -1),
      stream: false,
      _debug_render_only: true,
      ...(config.think === undefined ? {} : { think: config.think }),
      options,
    })
  ).json();
  const debug =
    typeof rendered === "object" &&
    rendered !== null &&
    "_debug_info" in rendered
      ? rendered._debug_info
      : undefined;
  const template =
    typeof debug === "object" && debug !== null && "rendered_template" in debug
      ? debug.rendered_template
      : undefined;
  if (typeof template !== "string" || !template)
    throw new Error("The local service does not support render-only prefill.");
  signal.throwIfAborted();
  const response = await post("/api/generate", {
    model: config.model,
    prompt: template + prefix.content,
    raw: true,
    stream: true,
    ...(config.think === undefined ? {} : { think: config.think }),
    options,
  });
  if (!response.body) throw new Error("Local model response has no stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let done = false;
  const parseLine = (line: string): NativeChunk => {
    const value: unknown = JSON.parse(line);
    if (typeof value !== "object" || value === null || "error" in value)
      throw new Error("Invalid local model response.");
    const chunk = value as Record<string, unknown>;
    if (
      done ||
      (chunk.response !== undefined && typeof chunk.response !== "string") ||
      (chunk.done !== undefined && typeof chunk.done !== "boolean") ||
      (chunk.done_reason !== undefined && typeof chunk.done_reason !== "string")
    )
      throw new Error("Invalid local model stream record.");
    done = chunk.done === true;
    const count = (value: unknown): number | undefined =>
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0
        ? value
        : undefined;
    const input = count(chunk.prompt_eval_count);
    const output = count(chunk.eval_count);
    return {
      content: typeof chunk.response === "string" ? chunk.response : "",
      ...(typeof chunk.done_reason === "string"
        ? { response_metadata: { done_reason: chunk.done_reason } }
        : {}),
      ...(input !== undefined || output !== undefined
        ? {
            usage_metadata: {
              input_tokens: input,
              output_tokens: output,
              total_tokens:
                input !== undefined && output !== undefined
                  ? input + output
                  : undefined,
            },
          }
        : {}),
    };
  };
  try {
    while (true) {
      signal.throwIfAborted();
      const next = await reader.read();
      pending += next.done
        ? decoder.decode()
        : decoder.decode(next.value, { stream: true });
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        if (line.trim()) yield parseLine(line);
        newline = pending.indexOf("\n");
      }
      if (next.done) break;
    }
    if (pending.trim()) yield parseLine(pending);
    if (!done) throw new Error("Local model stream ended before completion.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
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
            ...(config.reasoningEffort === undefined
              ? {}
              : { reasoningEffort: config.reasoningEffort }),
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
            ...(config.numCtx === undefined ? {} : { numCtx: config.numCtx }),
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
    const prefix = messages.at(-1);
    const nativePrefill =
      config.provider === "ollama" &&
      config.rawPrefill === true &&
      prefix?.role === "assistant" &&
      prefix.content.length > 0;
    const stream = nativePrefill
      ? rawPrefillStream(config, messages, controller.signal)
      : await model.stream(prompt, {
          signal: controller.signal,
          callbacks: [],
        });
    let text = "";
    let usage: ModelResult["usage"];
    let providerFinishReason: string | undefined;
    for await (const chunk of stream) {
      controller.signal.throwIfAborted();
      // Completion metadata may precede a separate final usage-only chunk.
      // Keep a detected cutoff rather than replacing it with later metadata.
      const finishReason =
        config.provider === "openai"
          ? chunk.response_metadata?.finish_reason
          : chunk.response_metadata?.done_reason;
      if (finishReason === "length") truncated = true;
      if (typeof finishReason === "string") providerFinishReason = finishReason;
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
    return {
      text,
      ...(usage ? { usage } : {}),
      ...(providerFinishReason ? { finishReason: providerFinishReason } : {}),
    };
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
