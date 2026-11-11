import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ModelConfig } from "../src/models.ts";
import { type PairSocket, runResponsesPair } from "../src/responses-pair.ts";

type Message = {
  type: string;
  message?: Record<string, unknown> & { type: string };
  error?: unknown;
};

class FakeSocket implements PairSocket {
  sent: unknown[] = [];
  closed = false;
  private waiters: Array<(result: IteratorResult<Message>) => void> = [];
  private values: Message[] = [{ type: "open" }];
  send(event: unknown) {
    this.sent.push(event);
  }
  close() {
    this.closed = true;
  }
  push(message: Record<string, unknown> & { type: string }) {
    const value: Message = { type: "message", message };
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value });
    else this.values.push(value);
  }
  stream(): AsyncIterableIterator<Message> {
    return {
      next: () => {
        const value = this.values.shift();
        if (value) return Promise.resolve({ done: false, value });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
      return: async () => ({ done: true, value: undefined }),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }
}

const config: ModelConfig = {
  provider: "openai",
  model: "approved-model",
  maxOutputTokens: 50,
  timeoutMs: 5_000,
};
// The injected sockets keep these tests offline; the SDK still validates that an API key exists.
const previousApiKey = process.env.OPENAI_API_KEY;
beforeAll(() => {
  process.env.OPENAI_API_KEY = "offline-test-key";
});
afterAll(() => {
  if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousApiKey;
});
const initial = [
  { role: "system", content: "system" },
  { role: "user", content: "initial" },
] as const;
const update = { role: "user", content: "update" } as const;
const opts = (
  socketFactory: () => PairSocket,
  extra: Partial<Parameters<typeof runResponsesPair>[0]> = {},
) => ({
  config,
  initial: [...initial],
  update: { ...update },
  policy: "steer" as const,
  phase: "before" as const,
  signal: new AbortController().signal,
  onRecord: async (_record: Record<string, unknown>) => {},
  socketFactory: () => socketFactory(),
  ...extra,
});
const created = (id: string) => ({
  type: "response.created",
  response: { id, status: "in_progress" },
});
const terminal = (
  id: string,
  status = "completed",
  usage?: Record<string, number>,
) => ({
  type: status === "completed" ? "response.completed" : "response.incomplete",
  response: {
    id,
    status,
    ...(status === "incomplete"
      ? { incomplete_details: { reason: "steered" } }
      : {}),
    ...(usage ? { usage } : {}),
  },
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("experimental Responses WebSocket pair", () => {
  it("steers once, distinguishes acknowledgement from the automatic successor, and sums valid usage", async () => {
    const socket = new FakeSocket();
    const records: Record<string, unknown>[] = [];
    const resultPromise = runResponsesPair(
      opts(() => socket, {
        onRecord: async (r) => {
          records.push(r);
        },
      }),
    );
    await tick();
    socket.push(created("r1"));
    await tick();
    socket.push({
      type: "response.steer.accepted",
      steer: { previous_response_id: "r1", id: "s1" },
    });
    socket.push(
      terminal("r1", "incomplete", {
        input_tokens: 2,
        output_tokens: 1,
        total_tokens: 3,
      }),
    );
    socket.push(created("r2"));
    socket.push({ type: "response.output_item.added", item: { id: "i2" } });
    socket.push({ type: "response.output_text.delta", delta: "answer" });
    socket.push(
      terminal("r2", "completed", {
        input_tokens: 4,
        output_tokens: 3,
        total_tokens: 7,
      }),
    );
    const result = await resultPromise;
    expect(result).toEqual({
      text: "answer",
      finishReason: "completed",
      usage: { inputTokens: 6, outputTokens: 4, totalTokens: 10 },
    });
    expect(
      socket.sent.map((event) => (event as { type: string }).type),
    ).toEqual(["response.create", "response.steer"]);
    expect(records.some((record) => record.kind === "steer_accepted")).toBe(
      true,
    );
    expect(
      records.filter((record) => record.kind === "response_created"),
    ).toHaveLength(2);
  });

  it("completes the first response before sending one explicit follow-up", async () => {
    const socket = new FakeSocket();
    const resultPromise = runResponsesPair(
      opts(() => socket, { policy: "complete", phase: "during" }),
    );
    await tick();
    socket.push(created("r1"));
    socket.push({ type: "response.output_text.delta", delta: "first " });
    socket.push(
      terminal("r1", "completed", {
        input_tokens: 2,
        output_tokens: 3,
        total_tokens: 5,
      }),
    );
    await tick();
    expect(
      socket.sent.map((event) => (event as { type: string }).type),
    ).toEqual(["response.create", "response.create"]);
    socket.push(created("r2"));
    socket.push({ type: "response.output_text.delta", delta: "second" });
    socket.push(
      terminal("r2", "completed", {
        input_tokens: 1,
        output_tokens: 2,
        total_tokens: 3,
      }),
    );
    expect(await resultPromise).toMatchObject({
      text: "first second",
      usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
    });
  });

  it.each(["before", "during"] as const)(
    "cuts at the emitted prefix after a %s arrival and resumes with that exact assistant history",
    async (phase) => {
      const first = new FakeSocket();
      const second = new FakeSocket();
      let calls = 0;
      const resultPromise = runResponsesPair(
        opts(() => (++calls === 1 ? first : second), {
          policy: "cancel",
          phase,
          refreshMs: 0,
        }),
      );
      await tick();
      first.push(created("r1"));
      first.push({
        type: "response.output_text.delta",
        delta: "unfinished wor",
      });
      await tick();
      await tick();
      second.push(created("r2"));
      second.push({ type: "response.output_text.delta", delta: "d resumed" });
      second.push(terminal("r2"));
      const result = await resultPromise;
      expect(result.text).toBe("unfinished word resumed");
      expect(first.closed).toBe(true);
      const resume = second.sent[0] as {
        input: Array<{ role: string; content: string }>;
      };
      expect(resume.input).toEqual([
        { role: "user", content: "initial" },
        { role: "assistant", content: "unfinished wor" },
        { role: "user", content: "update" },
      ]);
    },
  );

  it("keeps combined usage unknown if either response omits valid usage", async () => {
    const socket = new FakeSocket();
    const resultPromise = runResponsesPair(
      opts(() => socket, { policy: "complete" }),
    );
    await tick();
    socket.push(created("r1"));
    socket.push(
      terminal("r1", "completed", {
        input_tokens: 1,
        output_tokens: 1,
        total_tokens: 2,
      }),
    );
    await tick();
    socket.push(created("r2"));
    socket.push({ type: "response.output_text.delta", delta: "text" });
    socket.push(terminal("r2"));
    expect(await resultPromise).not.toHaveProperty("usage");
  });

  it("returns a safe steering-not-supported error without a fallback", async () => {
    const socket = new FakeSocket();
    const resultPromise = runResponsesPair(opts(() => socket));
    await tick();
    socket.push(created("r1"));
    socket.push({
      type: "response.steer.failed",
      error: {
        code: "steering_not_supported",
        message: "sensitive provider text",
      },
      steer: {},
    });
    await expect(resultPromise).rejects.toMatchObject({
      code: "steering_not_supported",
      message: "Responses pair failed.",
    });
    expect(
      socket.sent.map((event) => (event as { type: string }).type),
    ).toEqual(["response.create", "response.steer"]);
  });

  it("does a normal follow-up when the original completes before the cancel timer", async () => {
    const socket = new FakeSocket();
    const resultPromise = runResponsesPair(
      opts(() => socket, { policy: "cancel", phase: "during", refreshMs: 100 }),
    );
    await tick();
    socket.push(created("r1"));
    socket.push({ type: "response.output_text.delta", delta: "complete" });
    socket.push(terminal("r1"));
    await tick();
    socket.push(created("r2"));
    socket.push(terminal("r2"));
    expect(await resultPromise).toMatchObject({ text: "complete" });
    expect(
      socket.sent.map((event) => (event as { type: string }).type),
    ).toEqual(["response.create", "response.create"]);
  });

  it("aborts promptly while the socket has no response events", async () => {
    const socket = new FakeSocket();
    const controller = new AbortController();
    const resultPromise = runResponsesPair(
      opts(() => socket, { signal: controller.signal }),
    );
    await tick();
    controller.abort();
    await expect(resultPromise).rejects.toMatchObject({
      code: "aborted",
      message: "Responses pair aborted.",
    });
    expect(socket.closed).toBe(true);
  });

  it("times out the pair while the socket has no response events", async () => {
    const socket = new FakeSocket();
    const resultPromise = runResponsesPair(
      opts(() => socket, { config: { ...config, timeoutMs: 15 } }),
    );
    await expect(resultPromise).rejects.toMatchObject({
      code: "timeout",
      message: "Responses pair failed.",
    });
    expect(socket.closed).toBe(true);
  });

  it("does not dispatch when already aborted", async () => {
    const socket = new FakeSocket();
    const controller = new AbortController();
    controller.abort();
    await expect(
      runResponsesPair(opts(() => socket, { signal: controller.signal })),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(socket.sent).toEqual([]);
  });

  it("treats SDK and server error events as safe provider errors", async () => {
    const socket = new FakeSocket();
    const resultPromise = runResponsesPair(opts(() => socket));
    await tick();
    socket.push({
      type: "error",
      error: { message: "private provider details", status: 500 },
    });
    await expect(resultPromise).rejects.toMatchObject({
      code: "provider",
      message: "Responses pair failed.",
    });
  });

  it("supports after-phase steering after the original has completed", async () => {
    const socket = new FakeSocket();
    const records: Record<string, unknown>[] = [];
    const resultPromise = runResponsesPair(
      opts(() => socket, {
        phase: "after",
        onRecord: async (record) => {
          records.push(record);
        },
      }),
    );
    await tick();
    socket.push(created("r1"));
    socket.push({ type: "response.output_text.delta", delta: "first" });
    socket.push(terminal("r1"));
    await tick();
    socket.push({
      type: "response.steer.accepted",
      steer: { previous_response_id: "r1", id: "s1" },
    });
    socket.push(created("r2"));
    socket.push({ type: "response.output_text.delta", delta: " second" });
    socket.push(terminal("r2"));
    expect(await resultPromise).toMatchObject({ text: "first second" });
    expect(
      socket.sent.map((event) => (event as { type: string }).type),
    ).toEqual(["response.create", "response.steer"]);
    const arrivalIndex = records.findIndex(
      (record) => record.kind === "source_arrived",
    );
    const suppliedIndex = records.findIndex(
      (record) => record.kind === "supplied",
    );
    expect(arrivalIndex).toBeGreaterThanOrEqual(0);
    expect(suppliedIndex).toBeGreaterThan(arrivalIndex);
  });

  it("rejects a third response created on the same pair", async () => {
    const socket = new FakeSocket();
    const resultPromise = runResponsesPair(
      opts(() => socket, { policy: "complete" }),
    );
    await tick();
    socket.push(created("r1"));
    socket.push(terminal("r1"));
    await tick();
    socket.push(created("r2"));
    socket.push(created("r3"));
    await expect(resultPromise).rejects.toMatchObject({ code: "provider" });
  });

  it("rejects a pair with no emitted text", async () => {
    const socket = new FakeSocket();
    const resultPromise = runResponsesPair(
      opts(() => socket, { policy: "complete" }),
    );
    await tick();
    socket.push(created("r1"));
    socket.push(terminal("r1"));
    await tick();
    socket.push(created("r2"));
    socket.push(terminal("r2"));
    await expect(resultPromise).rejects.toMatchObject({ code: "empty" });
  });
});
