import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generate,
  type ModelConfig,
  type PromptMessage,
} from "../src/models.ts";
import { baseConfigSchema } from "../src/schema.ts";

const config: ModelConfig = {
  provider: "ollama",
  model: "test-gemma",
  baseUrl: "http://local.test:11434",
  rawPrefill: true,
  think: false,
  numCtx: 8192,
  temperature: 0,
  maxOutputTokens: 96,
  timeoutMs: 1_000,
};
const template =
  "<bos><|turn>system\nInstructions<turn|>\n<|turn>model\n<|channel>thought\n<channel|>";
const messages: PromptMessage[] = [
  { role: "system", content: "Instructions" },
  { role: "user", content: "Develop one contribution." },
  { role: "assistant", content: "We have people who are not even" },
];
type Request = {
  path: string;
  body: Record<string, unknown>;
  signal: AbortSignal | null | undefined;
};
let requests: Request[];
beforeEach(() => {
  requests = [];
  for (const name of [
    "LANGSMITH_TRACING",
    "LANGSMITH_TRACING_V2",
    "LANGCHAIN_TRACING",
    "LANGCHAIN_TRACING_V2",
    "LANGCHAIN_VERBOSE",
  ])
    vi.stubEnv(name, "false");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function mockService(
  handler: (request: Request) => Response | Promise<Response>,
) {
  return vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input, init) => {
      const request = {
        path: new URL(String(input)).pathname,
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        signal: init?.signal,
      };
      requests.push(request);
      return handler(request);
    }),
  );
}
function rendered() {
  return Response.json({ _debug_info: { rendered_template: template } });
}
function stream(records: object[], splitBytes = false) {
  const bytes = new TextEncoder().encode(
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        if (splitBytes)
          for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        else controller.enqueue(bytes);
        controller.close();
      },
    }),
    { headers: { "Content-Type": "application/x-ndjson" } },
  );
}
const request = (
  overrides: Partial<ModelConfig> = {},
  prompt = messages,
  signal = new AbortController().signal,
) => ({ config: { ...config, ...overrides }, messages: prompt, signal });

describe("native Ollama prefill", () => {
  it.each([
    {
      prefix: "We have people who are not even",
      tokens: [" ", "there", ". 😀"],
      joined: "We have people who are not even there. 😀",
    },
    {
      prefix: "We are organ",
      tokens: ["ising", " our work"],
      joined: "We are organising our work",
    },
    {
      prefix: "We keep trailing spaces  ",
      tokens: ["and", " punctuation."],
      joined: "We keep trailing spaces  and punctuation.",
    },
  ])(
    "uses the canonical open template and preserves exact characters for $prefix",
    async ({ prefix, tokens, joined }) => {
      mockService(({ path }) =>
        path === "/api/chat"
          ? rendered()
          : stream(
              [
                ...tokens.map((response) => ({ response, done: false })),
                {
                  done: true,
                  done_reason: "stop",
                  prompt_eval_count: 12,
                  eval_count: 5,
                },
              ],
              true,
            ),
      );
      const received: string[] = [];
      const result = await generate(
        request({}, [
          ...messages.slice(0, -1),
          { role: "assistant", content: prefix },
        ]),
        (token) => {
          received.push(token);
        },
      );
      expect(prefix + received.join("")).toBe(joined);
      expect(result).toEqual({
        text: tokens.join(""),
        usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
      });
      expect(requests.map((request) => request.path)).toEqual([
        "/api/chat",
        "/api/generate",
      ]);
      expect(requests[0]?.body).toMatchObject({
        messages: messages.slice(0, -1),
        _debug_render_only: true,
        stream: false,
        think: false,
      });
      expect(requests[1]?.body).toEqual({
        model: config.model,
        prompt: template + prefix,
        raw: true,
        stream: true,
        think: false,
        options: { num_predict: 96, temperature: 0, num_ctx: 8192 },
      });
    },
  );

  it("retains streamed text and cutoff metadata when final usage arrives separately", async () => {
    mockService(({ path }) =>
      path === "/api/chat"
        ? rendered()
        : stream([
            { response: " in", done: false, done_reason: "length" },
            { response: " the room", done: false },
            { done: true, prompt_eval_count: 12, eval_count: 3 },
          ]),
    );
    const received: string[] = [];
    await expect(
      generate(request(), (token) => {
        received.push(token);
      }),
    ).rejects.toMatchObject({ code: "truncated" });
    expect(received.join("")).toBe(" in the room");
    expect(requests).toHaveLength(2);
  });

  it.each(["unsupported", "empty template"])(
    "rejects %s render-only responses before requesting raw generation",
    async (kind) => {
      mockService(() =>
        Response.json(
          kind === "unsupported"
            ? { message: { content: "PRIVATE ordinary reply" } }
            : { _debug_info: { rendered_template: "" } },
        ),
      );
      await expect(generate(request(), () => {})).rejects.toMatchObject({
        code: "provider",
        message: "ollama generation failed.",
      });
      expect(requests).toHaveLength(1);
    },
  );

  it("rejects premature stream EOF while retaining received writing", async () => {
    mockService(({ path }) =>
      path === "/api/chat"
        ? rendered()
        : stream([{ response: " some saved writing", done: false }]),
    );
    const received: string[] = [];
    await expect(
      generate(request(), (token) => {
        received.push(token);
      }),
    ).rejects.toMatchObject({ code: "provider" });
    expect(received.join("")).toBe(" some saved writing");
    expect(requests).toHaveLength(2);
  });

  it("cancels an in-flight native stream and emits no extra writing after abort", async () => {
    const cancellation = new AbortController();
    const cancelled = vi.fn();
    mockService(({ path }) =>
      path === "/api/chat"
        ? rendered()
        : new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `${JSON.stringify({ response: " saved", done: false })}\n`,
                  ),
                );
              },
              cancel: cancelled,
            }),
          ),
    );
    const received: string[] = [];
    await expect(
      generate(request({}, messages, cancellation.signal), (token) => {
        received.push(token);
        cancellation.abort();
      }),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(received).toEqual([" saved"]);
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("applies the existing request timeout to rendering, without retry or leaked service errors", async () => {
    mockService(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new Error("PRIVATE upstream details")),
            { once: true },
          );
        }),
    );
    await expect(
      generate(request({ timeoutMs: 30 }), () => {}),
    ).rejects.toMatchObject({
      code: "timeout",
      message: "ollama request timed out.",
    });
    expect(requests).toHaveLength(1);
  });

  it("times out a stalled raw stream and retains the text already received", async () => {
    mockService(({ path, signal }) =>
      path === "/api/chat"
        ? rendered()
        : new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `${JSON.stringify({ response: " saved", done: false })}\n`,
                  ),
                );
                signal?.addEventListener(
                  "abort",
                  () => controller.error(new Error("PRIVATE upstream details")),
                  { once: true },
                );
              },
            }),
          ),
    );
    const received: string[] = [];
    await expect(
      generate(request({ timeoutMs: 30 }), (token) => {
        received.push(token);
      }),
    ).rejects.toMatchObject({
      code: "timeout",
      message: "ollama request timed out.",
    });
    expect(received).toEqual([" saved"]);
    expect(requests).toHaveLength(2);
  });

  it("does not start raw inference if cancelled after template rendering", async () => {
    const cancellation = new AbortController();
    mockService(() => {
      cancellation.abort();
      return rendered();
    });
    await expect(
      generate(request({}, messages, cancellation.signal), () => {}),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(requests).toHaveLength(1);
  });

  it.each(["http", "stream"])(
    "keeps %s provider details private",
    async (kind) => {
      mockService(({ path }) =>
        path === "/api/chat"
          ? rendered()
          : kind === "http"
            ? new Response("PRIVATE service credentials", { status: 503 })
            : stream([{ error: "PRIVATE service credentials" }]),
      );
      const error = await generate(request(), () => {}).catch(
        (error: unknown) => error,
      );
      expect(error).toMatchObject({ code: "provider" });
      expect(String(error)).not.toContain("PRIVATE");
      if (kind === "http") expect(error).toMatchObject({ status: 503 });
      expect(requests).toHaveLength(2);
    },
  );

  it.each([
    { rawPrefill: false, prompt: messages },
    { rawPrefill: true, prompt: messages.slice(0, -1) },
    {
      rawPrefill: true,
      prompt: [
        ...messages.slice(0, -1),
        { role: "assistant" as const, content: "" },
      ],
    },
  ])(
    "keeps ordinary chat unchanged when raw continuation is not requested",
    async ({ rawPrefill, prompt }) => {
      mockService(() =>
        stream([
          {
            model: config.model,
            message: { role: "assistant", content: "A normal reply." },
            done: false,
          },
          {
            model: config.model,
            message: { role: "assistant", content: "" },
            done: true,
            done_reason: "stop",
            prompt_eval_count: 5,
            eval_count: 4,
          },
        ]),
      );
      expect(
        await generate(request({ rawPrefill }, prompt), () => {}),
      ).toMatchObject({ text: "A normal reply." });
      expect(requests).toHaveLength(1);
      expect(requests[0]?.path).toBe("/api/chat");
      expect(requests[0]?.body._debug_render_only).toBeUndefined();
      expect(requests[0]?.body.messages).toEqual(prompt);
    },
  );

  it("restricts raw prefill to Ollama configurations", () => {
    expect(baseConfigSchema.shape.composer.safeParse(config).success).toBe(
      true,
    );
    const { think: _think, numCtx: _numCtx, ...openai } = config;
    expect(
      baseConfigSchema.shape.composer.safeParse({
        ...openai,
        provider: "openai",
      }).success,
    ).toBe(false);
  });
});
