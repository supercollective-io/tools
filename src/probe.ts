import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import type { ModelConfig, PromptMessage } from "./models.ts";

export type ProbeRequest = {
  id: number;
  startedMs: number;
  firstTokenMs: number | null;
  lastTokenMs: number | null;
  endedMs: number;
  tokenTimesMs: number[];
  text: string;
  finishReason?: string;
  outputTokens?: number;
  error?: "aborted" | "timeout" | "provider";
  status?: number;
};
export type ConcurrencyProbe = {
  model: string;
  baseUrl: string;
  count: number;
  contextTokens: number;
  startedAt: string;
  requests: ProbeRequest[];
  deliveryOverlapMs: number;
  chunksInSharedInterval: number[];
  allDeliveringWindows: {
    fromMs: number;
    toMs: number;
    chunksPerRequest: number[];
  }[];
  simultaneousDeliveryObserved: boolean;
};
const rounded = (value: number) => Math.round(value * 1000) / 1000;

function localEndpoint(config: ModelConfig): URL {
  if (config.provider !== "ollama")
    throw new Error("This probe supports local Ollama inference only.");
  const base = new URL(config.baseUrl ?? "http://127.0.0.1:11434");
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new Error(
      "The inference probe requires an HTTP(S) loopback URL without credentials.",
    );
  }
  return new URL("api/chat", `${base.href.replace(/\/$/, "")}/`);
}

async function streamRequest(
  config: ModelConfig,
  messages: PromptMessage[],
  id: number,
  origin: number,
  signal: AbortSignal,
): Promise<ProbeRequest> {
  const request: ProbeRequest = {
    id,
    startedMs: rounded(performance.now() - origin),
    firstTokenMs: null,
    lastTokenMs: null,
    endedMs: 0,
    tokenTimesMs: [],
    text: "",
  };
  const timeout = AbortSignal.timeout(config.timeoutMs);
  let status: number | undefined;
  try {
    const response = await fetch(localEndpoint(config), {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.any([signal, timeout]),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        keep_alive: "60s",
        ...(config.think === undefined ? {} : { think: config.think }),
        options: {
          num_predict: config.maxOutputTokens,
          temperature: config.temperature ?? 0.7,
          num_ctx: config.numCtx ?? 2048,
        },
      }),
    });
    if (!response.ok || !response.body) {
      status = response.status;
      throw new Error("Provider rejected the probe.");
    }
    const decoder = new TextDecoder();
    let pending = "";
    const consume = (line: string) => {
      if (!line.trim()) return;
      const value: unknown = JSON.parse(line);
      if (typeof value !== "object" || value === null)
        throw new Error("Invalid provider response.");
      const chunk = value as {
        message?: { content?: unknown };
        done_reason?: unknown;
        eval_count?: unknown;
        error?: unknown;
      };
      if (chunk.error !== undefined) throw new Error("Provider stream failed.");
      if (
        typeof chunk.message?.content === "string" &&
        chunk.message.content.length > 0
      ) {
        const at = rounded(performance.now() - origin);
        request.firstTokenMs ??= at;
        request.lastTokenMs = at;
        request.tokenTimesMs.push(at);
        request.text += chunk.message.content;
      }
      if (typeof chunk.done_reason === "string")
        request.finishReason = chunk.done_reason;
      if (typeof chunk.eval_count === "number")
        request.outputTokens = chunk.eval_count;
    };
    for await (const bytes of response.body) {
      pending += decoder.decode(bytes, { stream: true });
      let end = pending.indexOf("\n");
      while (end !== -1) {
        consume(pending.slice(0, end));
        pending = pending.slice(end + 1);
        end = pending.indexOf("\n");
      }
    }
    pending += decoder.decode();
    if (pending) consume(pending);
  } catch {
    request.error = signal.aborted
      ? "aborted"
      : timeout.aborted
        ? "timeout"
        : "provider";
    if (status !== undefined) request.status = status;
  }
  request.endedMs = rounded(performance.now() - origin);
  return request;
}

/** Measures receipt of non-empty generated chunks, rather than open HTTP calls. */
export async function probeConcurrency(
  config: ModelConfig,
  count = 3,
  signal: AbortSignal = new AbortController().signal,
): Promise<ConcurrencyProbe> {
  const endpoint = localEndpoint(config);
  if (!Number.isInteger(count) || count < 1 || count > 32)
    throw new Error("Probe count must be between 1 and 32.");
  const startedAt = new Date().toISOString();
  const origin = performance.now();
  const requests = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      streamRequest(
        config,
        [
          {
            role: "system",
            content:
              "You are a person thinking aloud in ordinary speech about the place where you live. Continue a long, detailed account across many paragraphs. Keep developing concrete memories, difficulties and possibilities instead of wrapping up. Do not supply headings, lists, a conclusion, or a short finished thought. Keep writing until the generation budget stops you.",
          },
          {
            role: "user",
            content: `Speaker ${index + 1}: describe your own experience of a neighbourhood meeting place and how your daily life connects to it. Produce at least 1500 words of ongoing speech, with new concrete details as you go. Begin now and keep going.`,
          },
        ],
        index + 1,
        origin,
        signal,
      ),
    ),
  );
  const allProduced = requests.every(
    (request) =>
      !request.error &&
      request.firstTokenMs !== null &&
      request.lastTokenMs !== null,
  );
  const from = allProduced
    ? Math.max(...requests.map((request) => request.firstTokenMs ?? 0))
    : 0;
  const to = allProduced
    ? Math.min(...requests.map((request) => request.lastTokenMs ?? 0))
    : 0;
  const deliveryOverlapMs = rounded(Math.max(0, to - from));
  const chunksInSharedInterval = requests.map(
    (request) =>
      request.tokenTimesMs.filter((at) => at >= from && at <= to).length,
  );
  const allDeliveringWindows: ConcurrencyProbe["allDeliveringWindows"] = [];
  for (
    let window = Math.ceil(from / 250) * 250;
    window + 250 <= to;
    window += 250
  ) {
    const counts = requests.map(
      (request) =>
        request.tokenTimesMs.filter((at) => at >= window && at < window + 250)
          .length,
    );
    if (counts.every((value) => value > 0))
      allDeliveringWindows.push({
        fromMs: window,
        toMs: window + 250,
        chunksPerRequest: counts,
      });
  }
  return {
    model: config.model,
    baseUrl: endpoint.origin,
    count,
    contextTokens: config.numCtx ?? 2048,
    startedAt,
    requests,
    deliveryOverlapMs,
    chunksInSharedInterval,
    allDeliveringWindows,
    simultaneousDeliveryObserved:
      count > 1 &&
      allProduced &&
      deliveryOverlapMs >= 500 &&
      chunksInSharedInterval.every((chunks) => chunks >= 3) &&
      allDeliveringWindows.length >= 2,
  };
}

/** Native assistant prefill: returned text is a candidate suffix, never concatenated here. */
export async function probeContinuation(
  config: ModelConfig,
  prefix: string,
  latestCollective: string,
  signal: AbortSignal = new AbortController().signal,
): Promise<{ prefix: string; latestCollective: string; suffix: ProbeRequest }> {
  localEndpoint(config);
  const origin = performance.now();
  const suffix = await streamRequest(
    config,
    [
      {
        role: "system",
        content:
          "You are Elena, a neighbour speaking in ordinary English about your own daily life and the community hall. Continue the final assistant message exactly from its last character, including a word cut in half. Return only the new suffix: do not repeat, correct or summarise words already present. Keep developing your own ongoing speech with concrete details rather than concluding or writing headings. The latest collective is optional context, not a question you must answer, and you may keep your own thread.",
      },
      {
        role: "user",
        content: JSON.stringify({
          latestCollective,
          instruction:
            "Continue your existing speech. Do not restart. Do not add a fresh speaker label. Keep going until the output budget interrupts you.",
        }),
      },
      { role: "assistant", content: prefix },
    ],
    1,
    origin,
    signal,
  );
  return { prefix, latestCollective, suffix };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      model: { type: "string" },
      "base-url": { type: "string" },
      count: { type: "string" },
      tokens: { type: "string" },
      context: { type: "string" },
      out: { type: "string" },
    },
  });
  const config: ModelConfig = {
    provider: "ollama",
    model: values.model ?? "qwen2.5:1.5b-instruct-q4_K_M",
    baseUrl: values["base-url"] ?? "http://127.0.0.1:11435",
    maxOutputTokens: Number(values.tokens ?? 512),
    timeoutMs: 120000,
    temperature: 0.7,
    numCtx: Number(values.context ?? 2048),
  };
  if (
    !Number.isInteger(config.maxOutputTokens) ||
    config.maxOutputTokens < 1 ||
    config.maxOutputTokens > 4096
  )
    throw new Error("Probe tokens must be between 1 and 4096.");
  const cancellation = new AbortController();
  const abort = () => cancellation.abort();
  process.on("SIGINT", abort);
  process.on("SIGTERM", abort);
  try {
    const result = await probeConcurrency(
      config,
      Number(values.count ?? 3),
      cancellation.signal,
    );
    const json = `${JSON.stringify(result, null, 2)}\n`;
    if (values.out)
      await writeFile(values.out, json, { flag: "wx", mode: 0o600 });
    process.stdout.write(json);
    if (result.requests.some((request) => request.error))
      process.exitCode = cancellation.signal.aborted ? 130 : 1;
  } finally {
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
  }
}
