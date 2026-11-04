import OpenAI from "openai";
import { ResponsesWS } from "openai/resources/responses/ws";
import type { ModelConfig, ModelResult, PromptMessage } from "./models.ts";
import { validateModelEnvironment } from "./models.ts";

type PairEvent = Record<string, unknown> & { type: string };

export interface PairSocket {
  send(event: unknown): void;
  stream(): AsyncIterableIterator<{
    type: string;
    message?: PairEvent;
    error?: unknown;
  }>;
  close(props?: { code: number; reason: string }): void;
}

export type ResponsesPairOptions = {
  config: ModelConfig;
  initial: PromptMessage[];
  update: PromptMessage;
  policy: "cancel" | "complete" | "steer";
  phase: "before" | "during" | "after";
  refreshMs?: number;
  signal: AbortSignal;
  onRecord: (safeRecord: Record<string, unknown>) => Promise<void>;
  socketFactory?: (client: OpenAI) => PairSocket;
};

type Usage = { inputTokens: number; outputTokens: number; totalTokens: number };

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function readUsage(response: unknown): Usage | undefined {
  if (!response || typeof response !== "object") return undefined;
  const usage = (response as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return undefined;
  const value = usage as Record<string, unknown>;
  if (
    !validCount(value.input_tokens) ||
    !validCount(value.output_tokens) ||
    !validCount(value.total_tokens) ||
    value.total_tokens !== value.input_tokens + value.output_tokens
  )
    return undefined;
  return {
    inputTokens: value.input_tokens,
    outputTokens: value.output_tokens,
    totalTokens: value.total_tokens,
  };
}

function textOf(message: PromptMessage): {
  role: "user" | "assistant";
  content: string;
} {
  return {
    role: message.role as "user" | "assistant",
    content: message.content,
  };
}

function recordUsage(response: unknown): Record<string, number> | undefined {
  const usage = readUsage(response);
  return usage
    ? {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      }
    : undefined;
}

function safeFailure(error: unknown): Error {
  if (error instanceof Error && error.name === "AbortError")
    return Object.assign(new Error("Responses pair aborted."), {
      code: "aborted",
    });
  const proposed =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "provider";
  const code = [
    "steering_not_supported",
    "aborted",
    "timeout",
    "truncated",
    "empty",
  ].includes(proposed)
    ? proposed
    : "provider";
  return Object.assign(new Error("Responses pair failed."), { code });
}

/** Experimental two-response driver for comparing Responses WebSocket interventions. */
export async function runResponsesPair(
  options: ResponsesPairOptions,
): Promise<ModelResult> {
  const { config, initial, update, signal } = options;
  if (config.provider !== "openai")
    throw Object.assign(
      new Error("Responses WebSocket pairs require the OpenAI provider."),
      { code: "provider" },
    );
  if (config.baseUrl)
    throw Object.assign(
      new Error("Responses WebSocket pairs do not accept a custom base URL."),
      { code: "provider" },
    );
  validateModelEnvironment(config);
  if (
    initial.length !== 2 ||
    initial[0]?.role !== "system" ||
    initial[1]?.role !== "user" ||
    update.role !== "user"
  ) {
    throw Object.assign(
      new Error(
        "Responses pair requires one system message and one user message.",
      ),
      { code: "provider" },
    );
  }
  if (signal.aborted)
    throw Object.assign(new Error("Responses pair aborted."), {
      name: "AbortError",
      code: "aborted",
    });
  const systemMessage = initial[0];
  const originalUser = initial[1];
  const refreshMs = options.refreshMs ?? 2_000;
  if (!Number.isFinite(refreshMs) || refreshMs < 0)
    throw new Error("refreshMs must be a non-negative number.");

  const started = Date.now();
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: config.timeoutMs,
    maxRetries: 0,
    logLevel: "off",
  });
  const makeSocket =
    options.socketFactory ??
    ((sdk) =>
      new ResponsesWS(sdk, { reconnect: null }) as unknown as PairSocket);
  let socket = makeSocket(client);
  let iterator = socket.stream()[Symbol.asyncIterator]();
  let emitted = "";
  let firstResponseId: string | undefined;
  let latestResponseId: string | undefined;
  let firstTerminal: PairEvent | undefined;
  let secondTerminal: PairEvent | undefined;
  let firstUsage: Usage | undefined;
  let secondUsage: Usage | undefined;
  let responseCount = 0;
  let updateSent = false;
  let steerAccepted = false;
  let firstCompleted = false;
  let currentResponse = 0;
  let sawDelta = false;
  let cancelDeadline: number | undefined;
  let cancelled = false;
  let pendingInput: PromptMessage[] | undefined = [originalUser];
  const pendingStart = { mode: "initial" as "initial" | "cancel_resume" };
  let itemId: string | undefined;
  let sourceArrived = false;
  let supplied = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  let resolveAbort: (() => void) | undefined;
  let resolveTimeout: (() => void) | undefined;
  const safeRecord = async (value: Record<string, unknown>) => {
    await options.onRecord({
      elapsedMs: Math.max(0, Date.now() - started),
      ...value,
    });
  };
  const parameters = (
    messages: PromptMessage[],
    previousResponseId?: string,
  ) => ({
    type: "response.create",
    model: config.model,
    instructions: systemMessage.content,
    input: messages.map(textOf),
    max_output_tokens: config.maxOutputTokens,
    store: false,
    tools: [],
    ...(config.temperature === undefined
      ? {}
      : { temperature: config.temperature }),
    ...(config.reasoningEffort === undefined
      ? {}
      : { reasoning: { effort: config.reasoningEffort } }),
    ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
  });
  const startResponse = (
    messages: PromptMessage[],
    previousResponseId?: string,
  ) => {
    responseCount += 1;
    if (responseCount > 2)
      throw new Error("Responses pair exceeded its two-response limit.");
    socket.send(parameters(messages, previousResponseId));
  };
  const sendUpdate = async (mode: "steer" | "create", previousId: string) => {
    if (updateSent) return;
    updateSent = true;
    if (mode === "steer") {
      socket.send({
        type: "response.steer",
        previous_response_id: previousId,
        input: [textOf(update)],
      });
      await recordSupplied();
      await safeRecord({
        kind: "update_sent",
        mode: "steer",
        responseId: previousId,
      });
    } else {
      startResponse([update], previousId);
      await recordSupplied();
      await safeRecord({
        kind: "update_sent",
        mode: "create",
        responseId: previousId,
      });
    }
  };
  const closeSocket = () => {
    try {
      socket.close({ code: 1000, reason: "pair phase complete" });
    } catch {
      /* already closed */
    }
  };
  const switchForCancel = async () => {
    if (cancelled) return;
    cancelled = true;
    closeSocket();
    await safeRecord({
      kind: "cancelled",
      responseId: firstResponseId,
      itemId,
      prefix: emitted,
    });
    const history: PromptMessage[] = [systemMessage, originalUser];
    if (emitted) history.push({ role: "assistant", content: emitted });
    history.push(update);
    socket = makeSocket(client);
    iterator = socket.stream()[Symbol.asyncIterator]();
    pendingInput = history.slice(1);
    pendingStart.mode = "cancel_resume";
  };
  const maybeArmCancel = () => {
    if (
      options.policy !== "cancel" ||
      options.phase === "after" ||
      cancelDeadline !== undefined ||
      firstCompleted
    )
      return;
    if (!sawDelta) return;
    cancelDeadline = Date.now() + refreshMs;
  };
  const recordArrival = async (responseId?: string) => {
    if (sourceArrived) return;
    sourceArrived = true;
    await safeRecord({
      kind: "source_arrived",
      source: options.phase,
      responseId,
      itemId,
    });
  };
  const recordSupplied = async () => {
    if (supplied) return;
    supplied = true;
    await safeRecord({ kind: "supplied", responseId: latestResponseId });
  };
  const checkAbort = () => {
    if (signal.aborted)
      throw Object.assign(new Error("Responses pair aborted."), {
        name: "AbortError",
        code: "aborted",
      });
  };

  try {
    const abortPromise = new Promise<{ kind: "abort" }>((resolve) => {
      resolveAbort = () => resolve({ kind: "abort" });
      abortListener = () => resolveAbort?.();
      signal.addEventListener("abort", abortListener, { once: true });
      if (signal.aborted) abortListener();
    });
    const timeoutPromise = new Promise<{ kind: "timeout" }>((resolve) => {
      resolveTimeout = () => resolve({ kind: "timeout" });
      timeoutHandle = setTimeout(() => resolveTimeout?.(), config.timeoutMs);
    });
    checkAbort();
    while (true) {
      checkAbort();
      // A buffered stream must not starve cancellation by winning every timer
      // race with an already-resolved next event.
      if (
        cancelDeadline !== undefined &&
        !cancelled &&
        Date.now() >= cancelDeadline
      ) {
        await switchForCancel();
        continue;
      }
      const nextPromise = iterator.next();
      let next: IteratorResult<{
        type: string;
        message?: PairEvent;
        error?: unknown;
      }>;
      if (cancelDeadline !== undefined && !cancelled) {
        const delay = Math.max(0, cancelDeadline - Date.now());
        let raceTimer: ReturnType<typeof setTimeout> | undefined;
        const outcome = await Promise.race([
          nextPromise.then(
            (value) => ({ kind: "event" as const, value }),
            () => ({ kind: "rejected" as const }),
          ),
          new Promise<{ kind: "timer" }>((resolve) => {
            raceTimer = setTimeout(() => resolve({ kind: "timer" }), delay);
          }),
          abortPromise,
          timeoutPromise,
        ]);
        if (raceTimer) clearTimeout(raceTimer);
        if (outcome.kind === "timer") {
          await switchForCancel();
          continue;
        }
        if (outcome.kind === "rejected")
          throw new Error("Responses WebSocket event failed.");
        if (outcome.kind === "abort")
          throw Object.assign(new Error("Responses pair aborted."), {
            name: "AbortError",
            code: "aborted",
          });
        if (outcome.kind === "timeout")
          throw Object.assign(new Error("Responses pair timed out."), {
            code: "timeout",
          });
        next = outcome.value;
      } else {
        const outcome = await Promise.race([
          nextPromise.then(
            (value) => ({ kind: "event" as const, value }),
            () => ({ kind: "rejected" as const }),
          ),
          abortPromise,
          timeoutPromise,
        ]);
        if (outcome.kind === "rejected")
          throw new Error("Responses WebSocket event failed.");
        if (outcome.kind === "abort")
          throw Object.assign(new Error("Responses pair aborted."), {
            name: "AbortError",
            code: "aborted",
          });
        if (outcome.kind === "timeout")
          throw Object.assign(new Error("Responses pair timed out."), {
            code: "timeout",
          });
        next = outcome.value;
      }
      if (next.done)
        throw new Error(
          "Responses WebSocket closed before the pair completed.",
        );
      const envelope = next.value;
      if (envelope.type === "open") {
        if (pendingInput) {
          startResponse(pendingInput);
          pendingInput = undefined;
          if (pendingStart.mode === "cancel_resume") await recordSupplied();
          await safeRecord({
            kind: "response_started",
            mode: pendingStart.mode,
          });
        }
        continue;
      }
      if (envelope.type === "error")
        throw new Error("Responses WebSocket event failed.");
      if (envelope.type !== "message" || !envelope.message) continue;
      const event = envelope.message;
      if (event.type === "error")
        throw new Error("Responses WebSocket event failed.");
      const response = event.response as Record<string, unknown> | undefined;
      if (event.type === "response.created") {
        currentResponse += 1;
        if (currentResponse > 2)
          throw new Error("Responses pair exceeded its two-response limit.");
        if (currentResponse === 2 && !firstCompleted && !cancelled)
          throw new Error("Overlapping response boundaries are unsupported.");
        responseCount = Math.max(responseCount, currentResponse);
        latestResponseId =
          typeof response?.id === "string" ? response.id : undefined;
        if (!latestResponseId) throw new Error("Response ID was missing.");
        itemId = undefined;
        if (!firstResponseId) firstResponseId = latestResponseId;
        await safeRecord({
          kind: "response_created",
          responseId: latestResponseId,
          responseIndex: currentResponse,
        });
        if (currentResponse === 1) {
          if (options.phase === "before") await recordArrival(latestResponseId);
          if (options.phase === "before") {
            if (options.policy === "steer") {
              if (!latestResponseId)
                throw new Error("Responses response ID was missing.");
              await sendUpdate("steer", latestResponseId);
            } else if (options.policy === "complete") {
              /* wait for terminal */
            }
            maybeArmCancel();
          }
        }
        continue;
      }
      if (event.type === "response.output_item.added") {
        const item = event.item as Record<string, unknown> | undefined;
        itemId = typeof item?.id === "string" ? item.id : undefined;
        await safeRecord({
          kind: "item_added",
          responseId: latestResponseId,
          itemId,
        });
        continue;
      }
      if (event.type === "response.output_item.done") {
        const item = event.item as Record<string, unknown> | undefined;
        const doneItemId = typeof item?.id === "string" ? item.id : itemId;
        await safeRecord({
          kind: "item_done",
          responseId: latestResponseId,
          itemId: doneItemId,
        });
        continue;
      }
      if (
        event.type === "response.output_text.delta" ||
        event.type === "response.text.delta"
      ) {
        if (!latestResponseId)
          throw new Error("Text arrived before a response boundary.");
        if (currentResponse === 1) {
          const delta = typeof event.delta === "string" ? event.delta : "";
          if (delta) {
            emitted += delta;
            sawDelta = true;
            if (options.phase === "during")
              await recordArrival(latestResponseId);
            await safeRecord({
              kind: "delta",
              responseId: latestResponseId,
              itemId:
                typeof event.item_id === "string" ? event.item_id : itemId,
              delta,
            });
            if (options.policy === "cancel") maybeArmCancel();
            if (options.phase === "during" && !updateSent) {
              if (options.policy === "steer") {
                if (!latestResponseId)
                  throw new Error("Responses response ID was missing.");
                await sendUpdate("steer", latestResponseId);
              }
            }
          }
        } else {
          // Preserve successor output as part of the combined returned text.
          const delta = typeof event.delta === "string" ? event.delta : "";
          emitted += delta;
          if (delta)
            await safeRecord({
              kind: "delta",
              responseId: latestResponseId,
              itemId:
                typeof event.item_id === "string" ? event.item_id : itemId,
              delta,
            });
        }
        continue;
      }
      if (event.type === "response.steer.accepted") {
        steerAccepted = true;
        await safeRecord({
          kind: "steer_accepted",
          responseId: (event.steer as Record<string, unknown> | undefined)
            ?.previous_response_id,
        });
        continue;
      }
      if (event.type === "response.steer.failed") {
        const error = event.error as Record<string, unknown> | undefined;
        throw Object.assign(new Error("Responses steering was rejected."), {
          code:
            error?.code === "steering_not_supported"
              ? "steering_not_supported"
              : "provider",
        });
      }
      if (
        [
          "response.completed",
          "response.incomplete",
          "response.failed",
        ].includes(event.type)
      ) {
        const terminalResponse = response ?? {};
        if (!latestResponseId || terminalResponse.id !== latestResponseId)
          throw new Error(
            "Terminal response ID does not match the active response.",
          );
        const status =
          typeof terminalResponse.status === "string"
            ? terminalResponse.status
            : event.type.slice("response.".length);
        const terminal = {
          kind: "response_terminal",
          responseId: terminalResponse.id ?? latestResponseId,
          status,
          reason: (
            terminalResponse.incomplete_details as
              | Record<string, unknown>
              | undefined
          )?.reason,
          usage: recordUsage(terminalResponse),
        };
        await safeRecord(terminal);
        if (currentResponse <= 1) {
          firstCompleted = true;
          firstTerminal = event;
          firstUsage = readUsage(terminalResponse);
          cancelDeadline = undefined;
          if (event.type === "response.failed")
            throw new Error("Responses generation failed.");
          if (event.type === "response.incomplete") {
            const details = terminalResponse.incomplete_details as
              | Record<string, unknown>
              | undefined;
            if (options.policy !== "steer" || details?.reason !== "steered")
              throw Object.assign(
                new Error("Responses pair ended with an incomplete response."),
                { code: "truncated" },
              );
          }
          if (options.phase === "after")
            await recordArrival(String(terminalResponse.id ?? firstResponseId));
          if (options.phase === "after") {
            if (options.policy === "steer")
              await sendUpdate(
                "steer",
                String(terminalResponse.id ?? firstResponseId),
              );
            else
              await sendUpdate(
                "create",
                String(terminalResponse.id ?? firstResponseId),
              );
            if (options.policy === "cancel")
              await safeRecord({
                kind: "cancel_skipped",
                reason: "response_already_terminal",
              });
          } else if (
            options.policy === "complete" ||
            (options.policy === "cancel" && !cancelled)
          ) {
            await sendUpdate(
              "create",
              String(terminalResponse.id ?? firstResponseId),
            );
          }
        } else {
          secondTerminal = event;
          secondUsage = readUsage(terminalResponse);
          if (event.type === "response.failed")
            throw new Error("Responses generation failed.");
          if (event.type !== "response.completed")
            throw Object.assign(
              new Error("Responses pair ended with an incomplete response."),
              { code: "truncated" },
            );
          if (firstTerminal?.type === "response.incomplete" && !steerAccepted)
            throw Object.assign(
              new Error("Responses steering was not acknowledged."),
              { code: "provider" },
            );
          break;
        }
      }
    }
    const usages =
      firstUsage && secondUsage
        ? {
            inputTokens: firstUsage.inputTokens + secondUsage.inputTokens,
            outputTokens: firstUsage.outputTokens + secondUsage.outputTokens,
            totalTokens: firstUsage.totalTokens + secondUsage.totalTokens,
          }
        : undefined;
    const finalResponse =
      secondTerminal &&
      typeof (secondTerminal.response as Record<string, unknown> | undefined)
        ?.status === "string"
        ? (secondTerminal.response as Record<string, unknown>)
        : undefined;
    if (!emitted.trim())
      throw Object.assign(new Error("Responses pair returned no text."), {
        code: "empty",
      });
    return {
      text: emitted,
      ...(typeof finalResponse?.status === "string"
        ? { finishReason: finalResponse.status }
        : {}),
      ...(usages ? { usage: usages } : {}),
    };
  } catch (error) {
    const failure = safeFailure(error);
    try {
      await safeRecord({
        kind: "failed",
        code: (failure as Error & { code?: string }).code ?? "provider",
      });
    } catch {
      /* preserve original failure */
    }
    throw failure;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (abortListener) signal.removeEventListener("abort", abortListener);
    closeSocket();
    void iterator.return?.().catch(() => {});
  }
}
