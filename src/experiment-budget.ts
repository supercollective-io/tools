import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import lockfile from "proper-lockfile";
import type {
  Generate,
  ModelErrorCode,
  ModelRequest,
  ModelResult,
} from "./models.ts";

const TOTAL_BUDGET_USD = 5;
const MESSAGE_OVERHEAD_BYTES = 32;
const REQUEST_OVERHEAD_BYTES = 128;

/** Approved USD per million tokens: input and output respectively. */
export const EXPERIMENT_RATES = {
  "gpt-6-luna": { input: 0.1, output: 0.5 },
  "gpt-6.1-terra": { input: 1, output: 5 },
} as const;

export type ExperimentBudgetOptions = {
  /** Defaults to the ignored runs/composer-budget.jsonl ledger. */
  ledgerPath?: string;
  /** Defaults to USD 5 across this ledger. */
  totalBudgetUsd?: number;
  /** Optional cumulative maximum for this slice. */
  sliceCapUsd?: number;
  /** Links ledger records to a composer experiment run. */
  runId?: string;
  /** Groups requests that share one cumulative slice cap. */
  sliceId?: string;
};

type LedgerEvent = {
  type: "reserved" | "finished";
  id: string;
  runId: string;
  sliceId: string;
  sequence: number;
  at: string;
  model: string;
  provider: string;
  maxOutputTokens: number;
  estimatedInputTokens: number;
  reservedUsd: number;
  requestFingerprint: string;
  startedAt: string;
  endedAt?: string;
  outcome?:
    | "success"
    | "failure"
    | "usage_unavailable"
    | "usage_invalid"
    | "usage_over_reservation";
  usage?: { inputTokens: number; outputTokens: number; totalTokens?: number };
  actualUsd?: number;
  finishReason?: string;
};

function validLimit(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${label} must be a finite non-negative amount.`);
}

function rateFor(model: string) {
  if (model === "gpt-6-luna") return EXPERIMENT_RATES["gpt-6-luna"];
  if (model === "gpt-6.1-terra") return EXPERIMENT_RATES["gpt-6.1-terra"];
  throw new Error(`No approved composer experiment rate for model "${model}".`);
}

function estimateInputTokens(request: ModelRequest): number {
  const bytes = Buffer.byteLength(
    JSON.stringify(
      request.messages.map(({ role, content }) => ({ role, content })),
    ),
    "utf8",
  );
  const estimate =
    bytes +
    request.messages.length * MESSAGE_OVERHEAD_BYTES +
    REQUEST_OVERHEAD_BYTES;
  if (!Number.isSafeInteger(estimate))
    throw new Error("The request is too large to budget safely.");
  return estimate;
}

function usdFor(
  inputTokens: number,
  outputTokens: number,
  rate: { input: number; output: number },
): number {
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}

function fingerprint(request: ModelRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        config: {
          provider: request.config.provider,
          model: request.config.model,
          temperature: request.config.temperature,
          think: request.config.think,
          numCtx: request.config.numCtx,
          rawPrefill: request.config.rawPrefill,
          reasoningEffort: request.config.reasoningEffort,
          maxOutputTokens: request.config.maxOutputTokens,
          timeoutMs: request.config.timeoutMs,
        },
        messages: request.messages,
      }),
    )
    .digest("hex");
}

function checkedUsage(result: ModelResult): LedgerEvent["usage"] | undefined {
  const usage = result.usage;
  if (!usage) return undefined;
  const { inputTokens, outputTokens, totalTokens } = usage;
  if (
    typeof inputTokens !== "number" ||
    !Number.isSafeInteger(inputTokens) ||
    inputTokens < 0 ||
    typeof outputTokens !== "number" ||
    !Number.isSafeInteger(outputTokens) ||
    outputTokens < 0 ||
    (totalTokens !== undefined &&
      (!Number.isSafeInteger(totalTokens) ||
        totalTokens < 0 ||
        totalTokens !== inputTokens + outputTokens))
  )
    return undefined;
  return {
    inputTokens,
    outputTokens,
    ...(totalTokens === undefined ? {} : { totalTokens }),
  };
}

async function withLedgerLock<T>(
  path: string,
  action: () => Promise<T>,
): Promise<T> {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "a");
  await handle.close();
  const release = await lockfile.lock(path, { realpath: false, retries: 0 });
  try {
    return await action();
  } finally {
    await release();
  }
}

async function append(path: string, event: LedgerEvent): Promise<void> {
  const handle = await open(path, "a");
  try {
    await handle.write(`${JSON.stringify(event)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function committedUsd(path: string, sliceId?: string): Promise<number> {
  const source = await readFile(path, "utf8");
  const events: LedgerEvent[] = [];
  for (const line of source.split("\n")) {
    if (!line) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error("The budget ledger is damaged; refusing model dispatch.");
    }
    if (
      typeof event !== "object" ||
      event === null ||
      !("type" in event) ||
      (event.type !== "reserved" && event.type !== "finished") ||
      !("id" in event) ||
      typeof event.id !== "string" ||
      !("reservedUsd" in event) ||
      typeof event.reservedUsd !== "number" ||
      !Number.isFinite(event.reservedUsd) ||
      event.reservedUsd < 0 ||
      !("runId" in event) ||
      typeof event.runId !== "string" ||
      !("sliceId" in event) ||
      typeof event.sliceId !== "string" ||
      !("sequence" in event) ||
      typeof event.sequence !== "number" ||
      !Number.isSafeInteger(event.sequence) ||
      event.sequence < 1 ||
      !("requestFingerprint" in event) ||
      typeof event.requestFingerprint !== "string" ||
      !("startedAt" in event) ||
      typeof event.startedAt !== "string" ||
      ("actualUsd" in event &&
        (typeof event.actualUsd !== "number" ||
          !Number.isFinite(event.actualUsd) ||
          event.actualUsd < 0))
    )
      throw new Error(
        "The budget ledger contains an invalid record; refusing model dispatch.",
      );
    events.push(event as LedgerEvent);
  }
  const reservations = new Map<string, LedgerEvent>();
  const finished = new Map<string, LedgerEvent>();
  for (const event of events) {
    if (event.type === "reserved") {
      if (reservations.has(event.id) || finished.has(event.id))
        throw new Error(
          "The budget ledger contains duplicate records; refusing model dispatch.",
        );
      reservations.set(event.id, event);
    } else {
      if (!reservations.has(event.id) || finished.has(event.id))
        throw new Error(
          "The budget ledger contains an unmatched finish; refusing model dispatch.",
        );
      finished.set(event.id, event);
    }
  }
  let total = 0;
  for (const [id, reservation] of reservations) {
    if (sliceId !== undefined && reservation.sliceId !== sliceId) continue;
    const finish = finished.get(id);
    total += finish?.actualUsd ?? reservation.reservedUsd;
  }
  return total;
}

/** Wrap Generate with a durable reservation-before-dispatch USD budget. */
export function createBudgetedGenerate(
  generate: Generate,
  options: ExperimentBudgetOptions = {},
): Generate {
  const path = resolve(options.ledgerPath ?? "runs/composer-budget.jsonl");
  const totalBudget = options.totalBudgetUsd ?? TOTAL_BUDGET_USD;
  validLimit(totalBudget, "Total budget");
  if (totalBudget > TOTAL_BUDGET_USD)
    throw new Error("Total budget cannot exceed the approved USD 5 cap.");
  if (options.sliceCapUsd !== undefined)
    validLimit(options.sliceCapUsd, "Per-slice cap");
  let inFlight = false;
  const runId = options.runId ?? randomUUID();
  const sliceId = options.sliceId ?? "default";

  return async (request, onToken) => {
    if (inFlight)
      throw new Error("Concurrent budgeted Generate calls are not supported.");
    inFlight = true;
    try {
      const rate = rateFor(request.config.model);
      if (request.config.provider !== "openai")
        throw new Error(
          "Composer experiment pricing is approved for OpenAI only.",
        );
      if (
        !Number.isSafeInteger(request.config.maxOutputTokens) ||
        request.config.maxOutputTokens <= 0
      )
        throw new Error(
          "Maximum output tokens must be a positive safe integer.",
        );
      const inputTokens = estimateInputTokens(request);
      const reserved = usdFor(
        inputTokens,
        request.config.maxOutputTokens,
        rate,
      );
      const id = randomUUID();
      const startedAt = new Date().toISOString();
      const base: LedgerEvent = {
        type: "reserved",
        id,
        runId,
        sliceId,
        sequence: 0,
        at: startedAt,
        model: request.config.model,
        provider: request.config.provider,
        maxOutputTokens: request.config.maxOutputTokens,
        estimatedInputTokens: inputTokens,
        reservedUsd: reserved,
        requestFingerprint: fingerprint(request),
        startedAt,
      };
      await withLedgerLock(path, async () => {
        const used = await committedUsd(path);
        if (used + reserved > totalBudget)
          throw new Error(
            "Composer request exceeds the remaining experiment budget.",
          );
        const sliceUsed = await committedUsd(path, sliceId);
        if (
          options.sliceCapUsd !== undefined &&
          sliceUsed + reserved > options.sliceCapUsd
        )
          throw new Error(
            "Composer request exceeds the remaining per-slice budget cap.",
          );
        const source = await readFile(path, "utf8");
        const sequence =
          source
            .split("\n")
            .filter(Boolean)
            .map(
              (line) =>
                JSON.parse(line) as { runId?: string; sequence?: number },
            )
            .filter((event) => event.runId === runId)
            .reduce((max, event) => Math.max(max, event.sequence ?? 0), 0) + 1;
        base.sequence = sequence;
        await append(path, base);
      });

      let result: ModelResult;
      try {
        result = await generate(request, onToken);
      } catch (error) {
        const endedAt = new Date().toISOString();
        await withLedgerLock(path, () =>
          append(path, {
            ...base,
            type: "finished",
            at: endedAt,
            endedAt,
            outcome: "failure",
          }),
        );
        const code =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          ["timeout", "aborted", "empty", "truncated", "provider"].includes(
            String(error.code),
          )
            ? (error.code as ModelErrorCode)
            : request.signal.aborted
              ? "aborted"
              : "provider";
        throw Object.assign(
          new Error("Composer model request failed; reservation remains held."),
          { code },
        );
      }
      const endedAt = new Date().toISOString();
      const usage = checkedUsage(result);
      const finishReason = result.finishReason;
      if (!usage) {
        await withLedgerLock(path, () =>
          append(path, {
            ...base,
            type: "finished",
            at: endedAt,
            endedAt,
            outcome: result.usage ? "usage_invalid" : "usage_unavailable",
            ...(finishReason === undefined ? {} : { finishReason }),
          }),
        );
        return result;
      }
      const actualUsd = usdFor(usage.inputTokens, usage.outputTokens, rate);
      const overReservation = actualUsd > reserved;
      await withLedgerLock(path, () =>
        append(path, {
          ...base,
          type: "finished",
          at: endedAt,
          endedAt,
          outcome: overReservation ? "usage_over_reservation" : "success",
          usage,
          actualUsd,
          ...(finishReason === undefined ? {} : { finishReason }),
        }),
      );
      if (overReservation)
        throw new Error(
          "Reported usage exceeded the budget reservation; stopping safely.",
        );
      return result;
    } finally {
      inFlight = false;
    }
  };
}
