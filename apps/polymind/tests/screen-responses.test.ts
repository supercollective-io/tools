import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), constructor: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    constructor(options: unknown) {
      mocks.constructor(options);
    }
    responses = { create: mocks.create };
  },
}));

import { runScreen } from "../src/collective-screen.ts";
import type { ModelConfig } from "../src/models.ts";
import { generateScreenResponses } from "../src/screen-responses.ts";

const config: ModelConfig = {
  provider: "openai",
  model: "gpt-6-luna",
  reasoningEffort: "medium",
  maxOutputTokens: 8192,
  timeoutMs: 1000,
};
const messages = [{ role: "user" as const, content: "Fictional source." }];
const dirs: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test-secret");
  for (const name of [
    "LANGSMITH_TRACING",
    "LANGSMITH_TRACING_V2",
    "LANGCHAIN_TRACING",
    "LANGCHAIN_TRACING_V2",
    "LANGCHAIN_VERBOSE",
  ])
    vi.stubEnv(name, "false");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  await Promise.all(
    dirs.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
function events(items: unknown[]) {
  return (async function* () {
    for (const item of items) yield item;
  })();
}
function completed(summary: string[] = ["A provider summary."]) {
  return {
    type: "response.completed",
    response: {
      status: "completed",
      output: [
        {
          type: "reasoning",
          summary: summary.map((text) => ({ type: "summary_text", text })),
          encrypted_content: "never saved",
          content: [{ type: "reasoning_text", text: "never saved either" }],
        },
        {
          type: "message",
          content: [{ type: "output_text", text: "Final words." }],
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
        output_tokens_details: { reasoning_tokens: 15 },
      },
    },
  };
}
it("streams only spoken output, opts into summaries, and retains usage without opaque reasoning", async () => {
  mocks.create.mockResolvedValue(
    events([
      { type: "response.reasoning_summary_text.delta", delta: "not speech" },
      { type: "response.output_text.delta", delta: "Final " },
      { type: "response.output_text.delta", delta: "words." },
      completed(),
    ]),
  );
  const onToken = vi.fn();
  const result = await generateScreenResponses(
    { config, messages, signal: new AbortController().signal },
    onToken,
  );
  expect(onToken.mock.calls).toEqual([["Final "], ["words."]]);
  expect(result).toMatchObject({
    text: "Final words.",
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    reasoning: {
      summaryRequested: true,
      summary: ["A provider summary."],
      tokens: 15,
    },
  });
  expect(JSON.stringify(result)).not.toContain("never saved");
  expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
    store: false,
    stream: true,
    reasoning: { effort: "medium", summary: "auto" },
    input: messages,
    max_output_tokens: 8192,
  });
  expect(mocks.constructor.mock.calls[0]?.[0]).toMatchObject({
    maxRetries: 0,
    logLevel: "off",
  });
});

it("keeps summaries out of reading copies and subsequent stage inputs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "reasoning-screen-"));
  dirs.push(dir);
  mocks.create.mockImplementation(async () =>
    events([
      { type: "response.output_text.delta", delta: "Final words." },
      completed(),
    ]),
  );
  const out = join(dir, "run");
  const outcomes = await runScreen(
    {
      api: "responses",
      model: config,
      concurrency: 1,
      repetitions: 1,
      datasets: [
        {
          id: "fiction",
          invitation: "write",
          contributions: [{ id: "f1", text: "Fictional source." }],
        },
      ],
      variants: [
        {
          id: "two-stage",
          stages: [
            { instructions: "write" },
            { instructions: "adapt", includePrevious: true },
          ],
        },
      ],
    },
    out,
  );
  expect(outcomes[0]?.status).toBe("completed");
  const secondRequest = mocks.create.mock.calls[1]?.[0];
  expect(JSON.stringify(secondRequest)).not.toContain("A provider summary.");
  expect(JSON.parse(secondRequest.input[1].content).previousStageText).toBe(
    "Final words.",
  );
  expect(await readFile(join(out, "reading-copy.txt"), "utf8")).not.toContain(
    "A provider summary.",
  );
  expect(
    await readFile(join(out, "reasoning-summaries.txt"), "utf8"),
  ).toContain("A provider summary.");
  const requests = await readFile(join(out, "requests.jsonl"), "utf8");
  expect(requests).toContain('"store":false');
  expect(await readFile(join(out, "results.jsonl"), "utf8")).not.toContain(
    "never saved",
  );
});

it("does not request summaries for reasoning off and distinguishes absent summaries", async () => {
  for (const effort of ["none", "medium"] as const) {
    mocks.create.mockResolvedValue(
      events([
        { type: "response.output_text.delta", delta: "Final words." },
        completed([]),
      ]),
    );
    const result = await generateScreenResponses(
      {
        config: { ...config, reasoningEffort: effort },
        messages,
        signal: new AbortController().signal,
      },
      vi.fn(),
    );
    expect(result.reasoning).toMatchObject({
      summaryRequested: effort !== "none",
      summary: [],
    });
    const body = mocks.create.mock.calls.at(-1)?.[0];
    expect(body.reasoning.summary).toBe(effort === "none" ? undefined : "auto");
  }
});

it("rejects incomplete, missing and mismatched completions without leaking upstream errors", async () => {
  for (const tail of [
    [
      {
        type: "response.incomplete",
        response: { incomplete_details: { reason: "max_output_tokens" } },
      },
    ],
    [],
    [completed()],
    [{ type: "error", message: "test-secret private provider body" }],
  ]) {
    mocks.create.mockResolvedValue(
      events([
        { type: "response.output_text.delta", delta: "Partial" },
        ...tail,
      ]),
    );
    await expect(
      generateScreenResponses(
        { config, messages, signal: new AbortController().signal },
        vi.fn(),
      ),
    ).rejects.toThrow(
      /^OpenAI Responses screen failed \((truncated|provider|stream_mismatch)\)\.$/,
    );
  }
});

it("honours aborts and times out without exposing provider error text", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    generateScreenResponses(
      { config, messages, signal: controller.signal },
      vi.fn(),
    ),
  ).rejects.toMatchObject({ code: "aborted" });
  expect(mocks.create).not.toHaveBeenCalled();
  vi.useFakeTimers();
  mocks.create.mockImplementation(
    (_body, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new Error("test-secret private body")),
          { once: true },
        );
      }),
  );
  const pending = generateScreenResponses(
    { config, messages, signal: new AbortController().signal },
    vi.fn(),
  );
  const assertion = expect(pending).rejects.toMatchObject({
    code: "timeout",
    message: "OpenAI Responses screen failed (timeout).",
  });
  await vi.advanceTimersByTimeAsync(1000);
  await assertion;
});
