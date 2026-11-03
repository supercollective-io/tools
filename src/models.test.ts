import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
  openai: vi.fn(),
  ollama: vi.fn(),
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    constructor(options: unknown) {
      mocks.openai(options);
    }
    stream = mocks.stream;
  },
}));
vi.mock("@langchain/ollama", () => ({
  ChatOllama: class {
    constructor(options: unknown) {
      mocks.ollama(options);
    }
    stream = mocks.stream;
  },
}));

import {
  generate,
  type ModelConfig,
  validateModelEnvironment,
} from "./models.ts";

const config: ModelConfig = {
  provider: "ollama",
  model: "example",
  maxOutputTokens: 100,
  timeoutMs: 1_000,
};
const tracingVariables = [
  "LANGSMITH_TRACING",
  "LANGSMITH_TRACING_V2",
  "LANGCHAIN_TRACING",
  "LANGCHAIN_TRACING_V2",
  "LANGCHAIN_VERBOSE",
];

beforeEach(() => {
  vi.clearAllMocks();
  for (const variable of tracingVariables) vi.stubEnv(variable, "false");
  vi.stubEnv("OPENAI_API_KEY", "test-secret-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("model adapter", () => {
  it("streams text blocks, excludes non-text blocks, and reports final usage", async () => {
    mocks.stream.mockImplementation(async function* () {
      yield { content: "Hello " };
      yield {
        content: [
          { type: "text", text: "world" },
          { type: "reasoning", text: "private" },
        ],
      };
      yield {
        content: "",
        usage_metadata: {
          input_tokens: 12,
          output_tokens: 2,
          total_tokens: 14,
        },
      };
    });
    const onToken = vi.fn();
    await expect(
      generate(
        {
          config,
          messages: [{ role: "user", content: "Hi" }],
          signal: new AbortController().signal,
        },
        onToken,
      ),
    ).resolves.toEqual({
      text: "Hello world",
      usage: { inputTokens: 12, outputTokens: 2, totalTokens: 14 },
    });
    expect(onToken.mock.calls).toEqual([["Hello "], ["world"]]);
    expect(mocks.ollama).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "http://127.0.0.1:11434",
        numPredict: 100,
        checkOrPullModel: false,
        maxRetries: 0,
      }),
    );
    expect(mocks.ollama.mock.calls[0]?.[0]).not.toHaveProperty("think");
  });

  it("forwards an explicitly disabled thinking setting to Ollama", async () => {
    mocks.stream.mockImplementation(async function* () {
      yield { content: "Result" };
    });
    await generate(
      {
        config: { ...config, think: false },
        messages: [],
        signal: new AbortController().signal,
      },
      vi.fn(),
    );
    expect(mocks.ollama).toHaveBeenCalledWith(
      expect.objectContaining({ think: false }),
    );
  });

  it("configures OpenAI with an explicit credential and completion limit", async () => {
    mocks.stream.mockImplementation(async function* () {
      yield { content: "Result" };
    });
    await generate(
      {
        config: { ...config, provider: "openai", think: false },
        messages: [],
        signal: new AbortController().signal,
      },
      vi.fn(),
    );
    expect(mocks.openai).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-secret-key",
        maxCompletionTokens: 100,
        timeout: 1_000,
        maxRetries: 0,
        streamUsage: true,
      }),
    );
    expect(mocks.ollama).not.toHaveBeenCalled();
    expect(mocks.openai.mock.calls[0]?.[0]).not.toHaveProperty("think");
  });

  it("does not start an already-aborted request", async () => {
    const controller = new AbortController();
    controller.abort(new Error("secret abort reason"));
    await expect(
      generate({ config, messages: [], signal: controller.signal }, vi.fn()),
    ).rejects.toMatchObject({
      message: "ollama request aborted.",
      code: "aborted",
    });
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it("passes cancellation to an active stream and stops delivering tokens", async () => {
    const controller = new AbortController();
    mocks.stream.mockImplementation(async function* (_messages, options) {
      yield { content: "First" };
      expect(options.signal.aborted).toBe(true);
      yield { content: "Second" };
    });
    const onToken = vi.fn(() => controller.abort());
    await expect(
      generate({ config, messages: [], signal: controller.signal }, onToken),
    ).rejects.toMatchObject({
      message: "ollama request aborted.",
      code: "aborted",
    });
    expect(onToken).toHaveBeenCalledExactlyOnceWith("First");
  });

  it("aborts a request when its timeout expires", async () => {
    vi.useFakeTimers();
    mocks.stream.mockImplementation(
      (_messages, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(new Error("sensitive upstream detail")),
            { once: true },
          );
        }),
    );
    const result = generate(
      { config, messages: [], signal: new AbortController().signal },
      vi.fn(),
    );
    const assertion = expect(result).rejects.toMatchObject({
      message: "ollama request timed out.",
      code: "timeout",
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it("rejects empty responses", async () => {
    mocks.stream.mockImplementation(async function* () {
      yield { content: "  " };
    });
    await expect(
      generate(
        { config, messages: [], signal: new AbortController().signal },
        vi.fn(),
      ),
    ).rejects.toMatchObject({
      message: "ollama returned an empty model response.",
      code: "empty",
    });
  });

  it.each([
    { provider: "openai" as const, field: "finish_reason" },
    { provider: "ollama" as const, field: "done_reason" },
  ])(
    "rejects $provider token-limit cutoffs after streaming provisional text",
    async ({ provider, field }) => {
      mocks.stream.mockImplementation(async function* () {
        yield { content: "An unfinished passage that" };
        yield {
          content: "",
          response_metadata: {
            [field]: "length",
            private_detail: "test-secret-key",
          },
        };
        // OpenAI may emit usage after its finish reason; do not lose the cutoff.
        yield {
          content: "",
          usage_metadata: {
            input_tokens: 12,
            output_tokens: 100,
            total_tokens: 112,
          },
        };
      });
      const onToken = vi.fn();
      const error = await generate(
        {
          config: { ...config, provider },
          messages: [],
          signal: new AbortController().signal,
        },
        onToken,
      ).catch((value: unknown) => value);
      expect(error).toMatchObject({
        code: "truncated",
        message: `${provider} response reached the output token limit and was not accepted.`,
      });
      expect(onToken).toHaveBeenCalledExactlyOnceWith(
        "An unfinished passage that",
      );
      expect(error).not.toHaveProperty("cause");
      expect(error).not.toHaveProperty("text");
      expect(String(error)).not.toContain("test-secret-key");
    },
  );

  it.each([
    { provider: "openai" as const, field: "finish_reason" },
    { provider: "ollama" as const, field: "done_reason" },
  ])(
    "accepts $provider normal stop metadata even at the configured token count",
    async ({ provider, field }) => {
      mocks.stream.mockImplementation(async function* () {
        yield { content: "A complete passage." };
        yield {
          content: "",
          response_metadata: { [field]: "stop" },
          usage_metadata: {
            input_tokens: 12,
            output_tokens: 100,
            total_tokens: 112,
          },
        };
      });
      await expect(
        generate(
          {
            config: { ...config, provider },
            messages: [],
            signal: new AbortController().signal,
          },
          vi.fn(),
        ),
      ).resolves.toEqual({
        text: "A complete passage.",
        usage: { inputTokens: 12, outputTokens: 100, totalTokens: 112 },
      });
    },
  );

  it("reports a token-limit cutoff rather than empty output when no visible text was produced", async () => {
    mocks.stream.mockImplementation(async function* () {
      yield { content: "", response_metadata: { done_reason: "length" } };
    });
    await expect(
      generate(
        { config, messages: [], signal: new AbortController().signal },
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: "truncated" });
  });

  it("retains a validated HTTP status without upstream bodies, credentials, or causes", async () => {
    mocks.stream.mockRejectedValue(
      Object.assign(new Error("test-secret-key upstream body"), {
        status: 401,
      }),
    );
    const error = await generate(
      { config, messages: [], signal: new AbortController().signal },
      vi.fn(),
    ).catch((value: unknown) => value);
    expect(error).toMatchObject({
      message: "ollama generation failed (HTTP 401).",
      code: "provider",
      status: 401,
    });
    expect(error).not.toHaveProperty("cause");
    expect(String(error)).not.toContain("test-secret-key");
    expect(JSON.stringify(error)).not.toContain("upstream");
  });

  it("requires the cloud key but permits local operation without it", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() =>
      validateModelEnvironment({ ...config, provider: "openai" }),
    ).toThrow("OPENAI_API_KEY");
    expect(() => validateModelEnvironment(config)).not.toThrow();
  });

  it.each(tracingVariables)(
    "refuses enabled %s before making provider calls",
    (variable) => {
      vi.stubEnv(variable, "true");
      expect(() => validateModelEnvironment(config)).toThrow(
        `Unset ${variable}`,
      );
      expect(mocks.stream).not.toHaveBeenCalled();
    },
  );
});
