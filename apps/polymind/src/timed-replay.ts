import { createHash, randomUUID } from "node:crypto";
import {
  type FileHandle,
  mkdir,
  open,
  readFile,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { inspectComposer } from "./composer-audit.ts";
import { createBudgetedGenerate } from "./experiment-budget.ts";
import { LiveController } from "./live.ts";
import { LiveLog } from "./live-runs.ts";
import { liveConfigSchema } from "./live-schema.ts";
import { type Generate, generate } from "./models.ts";
import { configSchema } from "./schema.ts";

const fixtureSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    title: z.string().min(1),
    invitation: z.string().min(1),
    durationMs: z.number().int().positive(),
    voices: z
      .array(z.strictObject({ id: z.string(), name: z.string() }))
      .min(1),
    events: z.array(
      z.strictObject({
        id: z.string(),
        atMs: z.number().int().nonnegative(),
        participantId: z.string(),
        text: z.string().min(1),
      }),
    ),
  })
  .superRefine((fixture, ctx) => {
    const voiceIds = new Set(fixture.voices.map(({ id }) => id));
    if (voiceIds.size !== fixture.voices.length)
      ctx.addIssue({
        code: "custom",
        message: "Timed replay voice IDs must be unique.",
      });
    if (
      new Set(fixture.voices.map(({ name }) => name)).size !==
      fixture.voices.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Timed replay voice names must be unique.",
      });
    const eventIds = new Set<string>();
    for (const event of fixture.events) {
      if (!voiceIds.has(event.participantId))
        ctx.addIssue({
          code: "custom",
          message: `Unknown participant in timed event ${event.id}.`,
        });
      if (eventIds.has(event.id))
        ctx.addIssue({
          code: "custom",
          message: "Timed replay event IDs must be unique.",
        });
      eventIds.add(event.id);
      if (event.atMs > fixture.durationMs)
        ctx.addIssue({
          code: "custom",
          message: `Timed event ${event.id} is after the fixture duration.`,
        });
    }
  });

type Fixture = z.infer<typeof fixtureSchema>;
export type TimedReplayOptions = {
  outputDir?: string;
  previousAttempt?: string;
  fixturePath?: string;
  configPath?: string;
  /** Direct inputs keep tests deterministic and avoid modifying repository fixtures. */
  fixture?: Fixture;
  config?: z.infer<typeof configSchema>;
  generate?: Generate;
  durationMs?: number;
  feedbackIntervalMs?: number;
  refreshIntervalMs?: number;
  requestCap?: number;
  sliceCapUsd?: number;
  ledgerPath?: string;
};
export type TimedReplayResult = {
  directory: string;
  journalPath: string;
  tracePath: string;
  auditPath: string;
  status: string;
  requests: number;
};

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function parseParticipantId(
  messages: { role: string; content: string }[],
  fixture: Fixture,
): string | null {
  const system =
    messages.find((message) => message.role === "system")?.content ?? "";
  const marker = "Private starting context: ";
  const start = system.lastIndexOf(marker);
  if (start < 0) return null;
  try {
    const context: unknown = JSON.parse(system.slice(start + marker.length));
    if (typeof context !== "object" || context === null || !("name" in context))
      return null;
    return (
      fixture.voices.find((voice) => voice.name === context.name)?.id ?? null
    );
  } catch {
    return null;
  }
}

function savedPrefix(messages: { role: string; content: string }[]): string {
  const assistant = messages.at(-1);
  if (assistant?.role === "assistant") return assistant.content;
  const user = messages.find((message) => message.role === "user");
  if (!user) return "";
  try {
    const content: unknown = JSON.parse(user.content);
    return typeof content === "object" &&
      content !== null &&
      "existingText" in content &&
      typeof content.existingText === "string"
      ? content.existingText
      : "";
  } catch {
    return "";
  }
}

/** Run the frozen timed fixture through the existing continuous live composer. */
export async function runTimedReplay(
  options: TimedReplayOptions = {},
): Promise<TimedReplayResult> {
  const fixtureText = options.fixture
    ? JSON.stringify(options.fixture)
    : await readFile(
        options.fixturePath ?? "examples/composer-timed.json",
        "utf8",
      );
  const configText = options.config
    ? JSON.stringify(options.config)
    : await readFile(
        options.configPath ?? "examples/composer-terra.json",
        "utf8",
      );
  const fixture = fixtureSchema.parse(
    options.fixture ?? JSON.parse(fixtureText),
  );
  const baseConfig = configSchema.parse(
    options.config ?? JSON.parse(configText),
  );
  if (
    baseConfig.composer.provider !== "openai" ||
    baseConfig.composer.model !== "gpt-6.1-terra" ||
    baseConfig.composer.reasoningEffort !== "none"
  )
    throw new Error(
      "Timed replay requires the frozen Terra composer configuration.",
    );
  const durationMs = options.durationMs ?? fixture.durationMs;
  const feedbackIntervalMs = options.feedbackIntervalMs ?? 500;
  const refreshIntervalMs = options.refreshIntervalMs ?? 2_000;
  const requestCap = options.requestCap ?? 6;
  if (!Number.isSafeInteger(requestCap) || requestCap < 1)
    throw new Error("Timed replay request cap must be a positive integer.");
  if (fixture.events.some((event) => event.atMs > durationMs))
    throw new Error(
      "Timed replay events must arrive within the configured run duration.",
    );
  const model = baseConfig.composer;
  const config = liveConfigSchema.parse({
    schemaVersion: 2,
    composer: model,
    instructions: baseConfig.instructions,
    history: baseConfig.history,
    live: {
      mode: "continuous",
      participants: {
        provider: "ollama",
        model: "timed-replay-source",
        maxOutputTokens: 512,
        timeoutMs: 15_000,
      },
      instructions: baseConfig.instructions,
      maxDurationMs: durationMs,
      feedbackIntervalMs,
      refreshIntervalMs,
      maxContextCharacters: 64_000,
    },
  });
  const directory = resolve(
    options.outputDir ?? `runs/composer-pilot/timed-${randomUUID()}`,
  );
  await mkdir(directory, { recursive: true });
  const journalPath = resolve(directory, "run.jsonl");
  const tracePath = resolve(directory, "experiment.jsonl");
  const auditPath = resolve(directory, "composer-audit.json");
  const manifestPath = resolve(directory, "frozen-inputs.json");
  const protocol = await readFile("docs/composer-timed-protocol.md", "utf8");
  const manifest = {
    schemaVersion: 1,
    previousAttempt: options.previousAttempt,
    protocol,
    protocolFingerprint: sha256(protocol),
    fixtureFingerprint: sha256(fixtureText),
    configFingerprint: sha256(JSON.stringify(config)),
    baseConfigFingerprint: sha256(configText),
    fixture,
    config,
    durationMs,
    feedbackIntervalMs,
    refreshIntervalMs,
    requestCap,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: "wx",
  });
  const log = await LiveLog.create(journalPath, {
    type: "live.created",
    scenario: {
      schemaVersion: 1,
      title: fixture.title,
      openingInvitation: fixture.invitation,
      voices: fixture.voices.map(({ id, name }) => ({
        id,
        name,
        perspective: "A fictional participant in a timed replay.",
        background:
          "Private fixture marker; source text is supplied only by the timed participant stream.",
      })),
    },
    config,
  });
  let traceHandle: FileHandle;
  try {
    traceHandle = await open(tracePath, "wx");
  } catch (error) {
    await log.close();
    throw error;
  }
  let traceQueue = Promise.resolve();
  const trace = (record: Record<string, unknown>) => {
    traceQueue = traceQueue.then(async () => {
      await traceHandle.write(
        `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`,
      );
      await traceHandle.sync();
    });
    return traceQueue;
  };
  const events = fixture.events
    .map((event, order) => ({ ...event, order }))
    .sort((a, b) => a.atMs - b.atMs || a.order - b.order);
  const sourceOffsets = new Map<string, number>();
  const eventOffsets = new Map<string, number>();
  for (const event of events) {
    const startOffset = sourceOffsets.get(event.participantId) ?? 0;
    eventOffsets.set(event.id, startOffset);
    sourceOffsets.set(event.participantId, startOffset + event.text.length);
  }
  const groups = [...new Set(events.map((event) => event.atMs))];
  const arrived = new Set<string>();
  const arrivalWaiters = new Set<() => void>();
  let startAt = 0;
  let calls = 0;
  let logClosed = false;
  let traceClosed = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const wakeArrivals = () => {
    for (const wake of [...arrivalWaiters]) wake();
  };
  const waitArrival = (abortSignal: AbortSignal) =>
    new Promise<void>((resolvePromise) => {
      if (abortSignal.aborted) return resolvePromise();
      const done = () => {
        arrivalWaiters.delete(done);
        abortSignal.removeEventListener("abort", done);
        resolvePromise();
      };
      arrivalWaiters.add(done);
      abortSignal.addEventListener("abort", done, { once: true });
    });
  const schedule = (target: LiveController) => {
    startAt = performance.now();
    for (const atMs of groups) {
      timers.push(
        setTimeout(
          () => {
            // Sorting before scheduling makes equal-time arrivals stable by fixture order.
            for (const event of events.filter((item) => item.atMs === atMs)) {
              arrived.add(event.id);
              const startOffset = eventOffsets.get(event.id) ?? 0;
              void trace({
                type: "source.arrived",
                eventId: event.id,
                participantId: event.participantId,
                plannedAtMs: event.atMs,
                observedAtMs: Math.round(performance.now() - startAt),
                startOffset,
                endOffset: startOffset + event.text.length,
                text: event.text,
              }).catch(() => {});
            }
            wakeArrivals();
          },
          Math.max(0, atMs),
        ),
      );
    }
    timers.push(
      setTimeout(() => {
        void target.end().catch(() => target.pause().catch(() => {}));
      }, durationMs),
    );
  };
  const composer = createBudgetedGenerate(options.generate ?? generate, {
    ledgerPath: options.ledgerPath ?? "runs/composer-pilot/usage.jsonl",
    totalBudgetUsd: 5,
    sliceCapUsd: options.sliceCapUsd ?? 0.25,
    sliceId: "timed-baseline",
    runId: log.state.runId,
  });
  const replayGenerate: Generate = async (request, onToken) => {
    const participantId = parseParticipantId(request.messages, fixture);
    if (participantId) {
      const prefix = savedPrefix(request.messages);
      let accumulated = "";
      for (;;) {
        const available = events.filter(
          (event) =>
            event.participantId === participantId && arrived.has(event.id),
        );
        const target = available.map((event) => event.text).join("");
        if (!target.startsWith(prefix))
          throw new Error(
            "Timed replay source prefix does not match saved participant text.",
          );
        if (target.length > prefix.length) {
          let offset = 0;
          let cursor = prefix.length + accumulated.length;
          for (const event of available) {
            const end = offset + event.text.length;
            if (end <= cursor) {
              offset = end;
              continue;
            }
            const part = event.text.slice(Math.max(0, cursor - offset));
            if (part && !request.signal.aborted) {
              await onToken(part);
              if (!request.signal.aborted) {
                accumulated += part;
                cursor += part.length;
              }
            }
            offset = end;
          }
        }
        if (request.signal.aborted) return { text: accumulated };
        if (
          available.length ===
          events.filter((event) => event.participantId === participantId).length
        ) {
          await new Promise<void>((resolvePromise) =>
            request.signal.addEventListener("abort", () => resolvePromise(), {
              once: true,
            }),
          );
          return { text: accumulated };
        }
        await waitArrival(request.signal);
      }
    }
    if (
      request.messages.some((message) =>
        message.content.includes("Private starting context:"),
      )
    )
      throw new Error("Private participant context reached the composer.");
    if (calls >= requestCap)
      throw new Error("Timed replay composer dispatch cap reached.");
    calls++;
    await trace({
      type: "composer.request",
      sequence: calls,
      elapsedMs: Math.round(performance.now() - startAt),
      messages: request.messages,
    });
    const result = await composer(request, async (fragment) => {
      await trace({
        type: "composer.fragment",
        sequence: calls,
        text: fragment,
      });
      await onToken(fragment);
    });
    await trace({
      type: "composer.response",
      sequence: calls,
      text: result.text,
      finishReason: result.finishReason ?? null,
    });
    return result;
  };
  const activeController = new LiveController(log, replayGenerate);
  const interrupt = () => {
    void activeController.pause().catch(() => {});
  };
  let startFailed = false;
  const finished = new Promise<void>((resolvePromise) => {
    const observe = () => {
      if (
        log.state.status === "ended" ||
        log.state.status === "paused" ||
        activeController.snapshot().fatal ||
        activeController.snapshot().error
      )
        resolvePromise();
    };
    activeController.onChange(observe);
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    void activeController.start().then(
      () => {
        schedule(activeController);
        observe();
      },
      () => {
        startFailed = true;
        void trace({
          type: "run.start-failed",
          error: "model_environment_or_start_failure",
        }).catch(() => {});
        resolvePromise();
      },
    );
  });
  let runError: unknown;
  try {
    await finished;
    if (
      startFailed ||
      activeController.snapshot().error ||
      activeController.snapshot().fatal ||
      log.state.status === "running" ||
      log.state.status === "ready"
    )
      runError = new Error(
        "Timed replay stopped after a live generation failure; inspect the saved journal and audit.",
      );
  } catch (error) {
    runError = error;
  } finally {
    for (const timer of timers) clearTimeout(timer);
    wakeArrivals();
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    try {
      await activeController.close();
    } catch (error) {
      runError ??= error;
    }
    try {
      await log.close();
      logClosed = true;
    } catch (error) {
      runError ??= error;
    }
    try {
      await trace({
        type: "run.finished",
        status: log.state.status,
        composerRequests: calls,
        error: runError ? "run_failed" : null,
      });
      await traceQueue;
    } catch (error) {
      runError ??= error;
    }
    if (!logClosed) {
      try {
        await log.close();
      } catch {}
    }
    if (!traceClosed) {
      try {
        await traceHandle.close();
        traceClosed = true;
      } catch {}
    }
    try {
      const audit = await inspectComposer(journalPath);
      await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, {
        flag: "wx",
      });
    } catch (error) {
      runError ??= error;
      await writeFile(
        auditPath,
        `${JSON.stringify({ schemaVersion: 1, status: "audit_failed", error: "Saved journal could not be audited." }, null, 2)}\n`,
        { flag: "wx" },
      ).catch(() => {});
    }
    if (!traceClosed) {
      try {
        await traceHandle.close();
      } catch {}
    }
  }
  if (runError) throw runError;
  const audit = await inspectComposer(journalPath);
  return {
    directory,
    journalPath,
    tracePath,
    auditPath,
    status: log.state.status,
    requests: audit.requests.length,
  };
}

if (import.meta.main) {
  if (process.argv.length > 3)
    throw new Error("Expected at most one previous attempt path.");
  runTimedReplay({ previousAttempt: process.argv[2] })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error: unknown) => {
      console.error(
        error instanceof Error ? error.message : "Timed replay failed.",
      );
      process.exitCode = 1;
    });
}
