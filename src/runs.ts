import { randomUUID } from "node:crypto";
import {
  type FileHandle,
  mkdir,
  open,
  readFile,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import lockfile from "proper-lockfile";
import { z } from "zod";
import { contributionsFor, type Passage, stepCount } from "./composition.ts";
import {
  type Contribution,
  configSchema,
  parse,
  storedScoreSchema,
} from "./schema.ts";

const contributionSchema = z.strictObject({
  id: z.string(),
  participantId: z.string(),
  source: z.literal("script"),
  text: z.string(),
  respondingToPassageId: z.string().nullable(),
});
const messageSchema = z.strictObject({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});
const bodySchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("run.created"),
    score: storedScoreSchema,
    config: configSchema,
    sourceRunId: z.uuid().optional(),
    stepLimit: z.number().int().positive().optional(),
  }),
  z.strictObject({
    type: z.literal("batch.admitted"),
    batchIndex: z.number().int().nonnegative(),
    contributions: z.array(contributionSchema).min(1),
  }),
  z.strictObject({
    type: z.literal("generation.started"),
    attemptId: z.uuid(),
    messages: z.array(messageSchema).min(1),
  }),
  z.strictObject({
    type: z.literal("generation.failed"),
    attemptId: z.uuid(),
    reason: z.enum(["failed", "aborted", "interrupted"]),
    code: z.enum(["timeout", "aborted", "empty", "provider"]).optional(),
    status: z.number().int().min(100).max(599).optional(),
  }),
  z.strictObject({
    type: z.literal("passage.accepted"),
    attemptId: z.uuid(),
    passageId: z.uuid(),
    text: z.string().min(1).max(500_000),
    durationMs: z.number().nonnegative(),
    usage: z
      .strictObject({
        inputTokens: z.number().nonnegative().optional(),
        outputTokens: z.number().nonnegative().optional(),
        totalTokens: z.number().nonnegative().optional(),
      })
      .optional(),
  }),
  z.strictObject({ type: z.literal("run.completed") }),
]);
const eventSchema = z.strictObject({
  schemaVersion: z.literal(1),
  runId: z.uuid(),
  sequence: z.number().int().positive(),
  at: z.iso.datetime(),
  event: bodySchema,
});
export type RunEvent = z.infer<typeof eventSchema>;
export type EventBody = z.infer<typeof bodySchema>;
export type RunState = {
  runId: string;
  score: z.infer<typeof storedScoreSchema>;
  totalSteps: number;
  config: z.infer<typeof configSchema>;
  passages: (Passage & { batchIndex: number })[];
  admitted: Contribution[][];
  pending: Contribution[] | null;
  attemptId: string | null;
  complete: boolean;
};

function rebuild(events: RunEvent[]): RunState {
  const first = events[0];
  if (first?.event.type !== "run.created")
    throw new Error("Run log has no valid opening record.");
  const availableSteps = stepCount(first.event.score);
  const totalSteps = first.event.stepLimit ?? availableSteps;
  if (totalSteps > availableSteps)
    throw new Error("Run step limit exceeds its score.");
  const state: RunState = {
    runId: first.runId,
    score: first.event.score,
    totalSteps,
    config: first.event.config,
    passages: [],
    admitted: [],
    pending: null,
    attemptId: null,
    complete: false,
  };
  const attempts = new Set<string>();
  const passageIds = new Set<string>();
  for (const [index, record] of events.entries()) {
    if (
      record.runId !== state.runId ||
      record.sequence !== index + 1 ||
      state.complete
    )
      throw new Error("Run log has inconsistent ordering or identity.");
    const event = record.event;
    switch (event.type) {
      case "run.created":
        if (index !== 0)
          throw new Error("Run log contains multiple opening records.");
        break;
      case "batch.admitted": {
        if (
          state.pending ||
          event.batchIndex !== state.passages.length ||
          event.batchIndex >= state.totalSteps
        )
          throw new Error("Run log has an out-of-order batch.");
        const expected = contributionsFor(
          state.score,
          event.batchIndex,
          state.passages.at(-1)?.id ?? null,
        );
        if (JSON.stringify(expected) !== JSON.stringify(event.contributions))
          throw new Error("Run log contributions do not match its score.");
        state.pending = event.contributions;
        state.admitted.push(event.contributions);
        break;
      }
      case "generation.started":
        if (!state.pending || state.attemptId || attempts.has(event.attemptId))
          throw new Error("Run log has an invalid generation attempt.");
        attempts.add(event.attemptId);
        state.attemptId = event.attemptId;
        break;
      case "generation.failed":
        if (state.attemptId !== event.attemptId)
          throw new Error("Run log failure refers to an unknown attempt.");
        state.attemptId = null;
        break;
      case "passage.accepted":
        if (
          !state.pending ||
          state.attemptId !== event.attemptId ||
          passageIds.has(event.passageId) ||
          !event.text.trim()
        )
          throw new Error("Run log passage refers to an invalid attempt.");
        passageIds.add(event.passageId);
        state.passages.push({
          id: event.passageId,
          text: event.text,
          batchIndex: state.passages.length,
        });
        state.pending = null;
        state.attemptId = null;
        break;
      case "run.completed":
        if (state.pending || state.passages.length !== state.totalSteps)
          throw new Error("Run log completes before all batches are accepted.");
        state.complete = true;
        break;
    }
  }
  return state;
}

export async function readRun(path: string): Promise<{
  events: RunEvent[];
  state: RunState;
  validBytes: number;
  tail: Buffer;
  needsNewline: boolean;
}> {
  let data: Buffer;
  try {
    data = await readFile(path);
  } catch {
    throw new Error("Cannot read run log.");
  }
  const events: RunEvent[] = [];
  let offset = 0;
  let validBytes = 0;
  let needsNewline = false;
  while (offset < data.length) {
    const newline = data.indexOf(10, offset);
    const end = newline === -1 ? data.length : newline;
    const line = data.subarray(offset, end).toString("utf8");
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      if (newline === -1) break;
      throw new Error(
        `Run log contains invalid JSON on line ${events.length + 1}.`,
      );
    }
    events.push(parse(eventSchema, value, `Run log line ${events.length + 1}`));
    validBytes = newline === -1 ? end : end + 1;
    needsNewline = newline === -1;
    offset = validBytes;
  }
  return {
    events,
    state: rebuild(events),
    validBytes,
    tail: data.subarray(validBytes),
    needsNewline,
  };
}

export class RunLog {
  readonly path: string;
  private handle: FileHandle;
  private release: () => Promise<void>;
  private isCompromised: () => boolean;
  private events: RunEvent[];
  private constructor(
    path: string,
    handle: FileHandle,
    release: () => Promise<void>,
    isCompromised: () => boolean,
    events: RunEvent[],
  ) {
    this.path = path;
    this.handle = handle;
    this.release = release;
    this.isCompromised = isCompromised;
    this.events = events;
  }

  get state(): RunState {
    return rebuild(this.events);
  }

  private static async acquire(
    path: string,
  ): Promise<{ release: () => Promise<void>; isCompromised: () => boolean }> {
    let compromised = false;
    try {
      const release = await lockfile.lock(path, {
        stale: 10_000,
        update: 2_000,
        retries: 0,
        onCompromised: () => {
          compromised = true;
        },
      });
      return { release, isCompromised: () => compromised };
    } catch {
      throw new Error(
        "Run is locked by another process. After a crash, wait 10 seconds before resuming.",
      );
    }
  }

  static async create(
    path: string,
    event: Extract<EventBody, { type: "run.created" }>,
  ): Promise<RunLog> {
    parse(bodySchema, event, "New run");
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    let handle: FileHandle;
    try {
      handle = await open(path, "ax", 0o600);
    } catch {
      throw new Error(
        "Cannot create run log; choose a new writable path. Existing files are never overwritten.",
      );
    }
    let log: RunLog | undefined;
    try {
      const lease = await RunLog.acquire(path);
      log = new RunLog(path, handle, lease.release, lease.isCompromised, []);
      await log.append(event);
      return log;
    } catch (error) {
      if (log) await log.close();
      else await handle.close();
      throw error;
    }
  }

  static async resume(path: string): Promise<RunLog> {
    const lease = await RunLog.acquire(path);
    let handle: FileHandle | undefined;
    try {
      const read = await readRun(path);
      handle = await open(path, "a");
      if (read.tail.length) {
        await writeFile(`${path}.interrupted-${randomUUID()}`, read.tail, {
          flag: "wx",
          mode: 0o600,
        });
        await handle.truncate(read.validBytes);
      }
      if (read.needsNewline) await handle.write("\n");
      await handle.sync();
      const log = new RunLog(
        path,
        handle,
        lease.release,
        lease.isCompromised,
        read.events,
      );
      if (read.state.attemptId)
        await log.append({
          type: "generation.failed",
          attemptId: read.state.attemptId,
          reason: "interrupted",
        });
      return log;
    } catch (error) {
      await handle?.close();
      await lease.release();
      throw error;
    }
  }

  async append(event: EventBody): Promise<void> {
    if (this.isCompromised())
      throw new Error(
        "Run lock was lost; stop and resume this run in a single process.",
      );
    const record = parse(
      eventSchema,
      {
        schemaVersion: 1,
        runId: this.events[0]?.runId ?? randomUUID(),
        sequence: this.events.length + 1,
        at: new Date().toISOString(),
        event,
      },
      "Run event",
    );
    rebuild([...this.events, record]);
    await this.handle.writeFile(`${JSON.stringify(record)}\n`);
    await this.handle.sync();
    this.events.push(record);
  }

  async close(): Promise<void> {
    try {
      await this.handle.close();
    } finally {
      await this.release();
    }
  }
}
