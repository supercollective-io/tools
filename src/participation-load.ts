import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { liveConfigSchema } from "./live-schema.ts";
import type { Generate } from "./models.ts";
import { startParticipation } from "./participation.ts";

export type ParticipationLoadOptions = {
  out: string;
  durationMs?: number;
  participants?: number;
  schedule?: "burst" | "staggered";
};

type Metric = {
  count: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

const percentile = (values: number[], p: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? null;
};

const metric = (values: number[]): Metric => ({
  count: values.length,
  p50Ms: percentile(values, 50),
  p95Ms: percentile(values, 95),
  maxMs: values.length ? Math.max(...values) : null,
});

const delay = (ms: number) =>
  new Promise<void>((resolveDelay) => setTimeout(resolveDelay, ms));

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not reserve a local port.");
  const port = address.port;
  await new Promise<void>((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return port;
}

function deterministicGenerate(stats: {
  calls: number;
  streamedTokens: number;
}): Generate {
  return async ({ signal }, onToken) => {
    stats.calls++;
    const started = Date.now();
    let text = "";
    while (!signal.aborted && Date.now() - started < 2_000) {
      await new Promise<void>((resolveChunk) => {
        const finish = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", finish);
          resolveChunk();
        };
        const timer = setTimeout(finish, 200);
        signal.addEventListener("abort", finish, { once: true });
        if (signal.aborted) finish();
      });
      if (signal.aborted) break;
      const token = "The room keeps changing. ";
      await onToken(token);
      stats.streamedTokens++;
      text += token;
    }
    return { text, finishReason: "stop" };
  };
}

function participantText(revision: number): string {
  if (revision % 5 === 0) return "";
  const label = `Revision ${revision}: `;
  const targetLength = Math.min(4_000, 320 + revision * 32);
  const passage =
    "I think we should leave room for another voice because this place keeps changing. ";
  const bodyLength = Math.max(0, targetLength - label.length);
  return (
    label +
    passage.repeat(Math.ceil(bodyLength / passage.length)).slice(0, bodyLength)
  );
}

function latestIsActive(
  schedule: "burst" | "staggered",
  participantIndex: number,
  elapsedMs: number,
  durationMs: number,
): boolean {
  if (schedule === "burst") return true;
  const startSpreadMs = Math.min(
    10_000,
    Math.max(0, Math.floor(durationMs / 4)),
  );
  if (elapsedMs < (participantIndex / Math.max(1, 99)) * startSpreadMs)
    return false;
  const phase = (elapsedMs + participantIndex * 379) % 30_000;
  return phase >= 4_000;
}

function validateOptions(options: ParticipationLoadOptions) {
  const durationMs = options.durationMs ?? 600_000;
  const participants = options.participants ?? 100;
  const schedule = options.schedule ?? "burst";
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs < 100 ||
    durationMs > 3_540_000
  )
    throw new Error("--duration-ms must be an integer from 100 to 3540000.");
  if (
    !Number.isSafeInteger(participants) ||
    participants < 1 ||
    participants > 100
  )
    throw new Error("--participants must be an integer from 1 to 100.");
  if (schedule !== "burst" && schedule !== "staggered")
    throw new Error("--schedule must be burst or staggered.");
  return { durationMs, participants, schedule };
}

export async function runParticipationLoad(options: ParticipationLoadOptions) {
  const { durationMs, participants, schedule } = validateOptions(options);
  const out = resolve(options.out);
  await mkdir(dirname(out), { recursive: true, mode: 0o700 });
  await mkdir(out, { mode: 0o700 });
  await chmod(out, 0o700);

  const configPath = fileURLToPath(
    new URL("../examples/live-projection.json", import.meta.url),
  );
  const config = liveConfigSchema.parse(
    JSON.parse(await readFile(configPath, "utf8")),
  );
  config.composer = {
    provider: "ollama",
    model: "load-fixture",
    maxOutputTokens: 64,
    timeoutMs: 5_000,
  };
  config.live.participants = config.composer;
  config.live.mode = "typed";
  config.live.continuationPolicy = "natural-short";
  config.live.maxContextCharacters = 1_000_000;
  config.live.maxDurationMs = Math.max(
    config.live.maxDurationMs,
    durationMs + 60_000,
  );

  const sourceFiles = [
    "journal.ts",
    "live-runs.ts",
    "live.ts",
    "live-schema.ts",
    "participation.ts",
    "participation-store.ts",
    "participation-admission.ts",
    "participation-load.ts",
  ];
  const sources = Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (file) => [
        file,
        createHash("sha256")
          .update(
            await readFile(
              new URL(
                import.meta.url.endsWith(".js")
                  ? file.replace(/\.ts$/u, ".js")
                  : file,
                import.meta.url,
              ),
            ),
          )
          .digest("hex"),
      ]),
    ),
  );
  await writeFile(
    join(out, "manifest.json"),
    `${JSON.stringify({ durationMs, participants, schedule, config, sourceSha256: sources, node: process.version, platform: process.platform, realModelCalls: false }, null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );

  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const generationStats = { calls: 0, streamedTokens: 0 };
  const app = await startParticipation({
    directory: out,
    invitation: "What changes when we listen together?",
    config,
    origin,
    operatorPort: 0,
    generate: deterministicGenerate(generationStats),
  });
  const ackLatencies: number[] = [];
  const errors: number[] = [];
  let attempted = 0;
  let acknowledged = 0;
  let retries = 0;
  const people: {
    id: string;
    cookie: string;
    attempted: number;
    acknowledged: number;
    retries: number;
    latestAckRevision: number;
  }[] = [];
  const post = async (route: string, data: unknown, cookie = "") =>
    fetch(`${origin}${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: cookie,
      },
      body: JSON.stringify(data),
    });

  try {
    const joinToken = new URL(app.joinUrl).hash.slice(1);
    for (let index = 0; index < participants; index++) {
      const response = await post("/api/join", { token: joinToken });
      if (!response.ok)
        throw new Error(
          `Participant join failed with HTTP ${response.status}.`,
        );
      const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
      const id = app.store.identify(cookie.split("=").slice(1).join("="));
      if (!id || !cookie)
        throw new Error("Participant join did not return a usable credential.");
      people.push({
        id,
        cookie,
        attempted: 0,
        acknowledged: 0,
        retries: 0,
        latestAckRevision: 0,
      });
    }

    await app.controller.start();
    const startedAt = Date.now();
    const deadline = startedAt + durationMs;
    const requestWorkers = people.map(async (person, index) => {
      const spread =
        schedule === "staggered"
          ? (Math.min(10_000, Math.floor(durationMs / 4)) * index) /
            Math.max(1, people.length - 1)
          : 0;
      let tickAt = startedAt + spread;
      let revision = 0;
      while (tickAt < deadline) {
        await delay(Math.max(0, tickAt - Date.now()));
        if (Date.now() >= deadline) break;
        const elapsed = Date.now() - startedAt;
        if (latestIsActive(schedule, index, elapsed, durationMs)) {
          revision++;
          const payload = { revision, text: participantText(revision) };
          if (payload.text.length > 4_000)
            throw new Error(
              "Load fixture exceeded the participant text limit.",
            );
          const sentAt = performance.now();
          attempted++;
          person.attempted++;
          try {
            const response = await post(
              "/api/contribution",
              payload,
              person.cookie,
            );
            if (response.ok) {
              const result = (await response.json()) as {
                revision: number;
                savedAt: string;
                duplicate: boolean;
              };
              ackLatencies.push(performance.now() - sentAt);
              acknowledged++;
              person.acknowledged++;
              person.latestAckRevision = result.revision;
              if (revision % 17 === 0) {
                const retryAt = performance.now();
                attempted++;
                person.attempted++;
                retries++;
                person.retries++;
                const retried = await post(
                  "/api/contribution",
                  payload,
                  person.cookie,
                );
                if (!retried.ok) {
                  await retried.arrayBuffer();
                  ackLatencies.push(performance.now() - retryAt);
                  errors.push(revision);
                } else {
                  const retryResult = (await retried.json()) as {
                    duplicate: boolean;
                  };
                  ackLatencies.push(performance.now() - retryAt);
                  if (!retryResult.duplicate) errors.push(revision);
                  else {
                    acknowledged++;
                    person.acknowledged++;
                  }
                }
              }
            } else {
              await response.arrayBuffer();
              ackLatencies.push(performance.now() - sentAt);
              errors.push(response.status);
            }
          } catch {
            errors.push(1);
          }
        }
        tickAt = Math.max(tickAt + 1_000, Date.now());
      }
    });

    const pauseAt = startedAt + Math.floor(durationMs / 2);
    await delay(Math.max(0, pauseAt - Date.now()));
    const pauseStarted = performance.now();
    await app.controller.pause("Load harness pause probe.");
    const pauseMs = performance.now() - pauseStarted;
    const resumeStarted = performance.now();
    await app.controller.start();
    const resumeMs = performance.now() - resumeStarted;
    await Promise.all(requestWorkers);

    const drainStartedAt = Date.now();
    const drainDeadline = drainStartedAt + 5_000;
    const allCurrentAdmitted = () =>
      people.every((person) => {
        const row = app.store.db
          .prepare(
            "SELECT revision,admitted FROM revision_heads WHERE participant=?",
          )
          .get(person.id) as { revision: number; admitted: number } | undefined;
        return !row || row.admitted >= row.revision;
      });
    while (!allCurrentAdmitted() && Date.now() < drainDeadline) await delay(20);
    const drainMs = Date.now() - drainStartedAt;
    const drained = allCurrentAdmitted();

    const generationDeadline = Date.now() + 5_000;
    while (
      (generationStats.calls === 0 || generationStats.streamedTokens === 0) &&
      Date.now() < generationDeadline
    )
      await delay(20);
    const observedGeneration =
      generationStats.calls > 0 && generationStats.streamedTokens > 0;

    const endStarted = performance.now();
    await app.controller.end();
    const endMs = performance.now() - endStarted;

    const revisionRows = app.store.db
      .prepare(
        "SELECT participant,revision,saved_at FROM revisions ORDER BY participant,revision",
      )
      .all() as { participant: string; revision: number; saved_at: string }[];
    const headRows = app.store.db
      .prepare("SELECT participant,revision,admitted FROM revision_heads")
      .all() as { participant: string; revision: number; admitted: number }[];
    const heads = new Map(headRows.map((row) => [row.participant, row]));
    const participantDetails = people.map((person) => {
      const head = heads.get(person.id);
      const stateWriter = app.log.state.participants.find(
        (writer) => writer.id === `participant/${person.id}`,
      );
      return {
        id: person.id,
        attempts: person.attempted,
        acknowledged: person.acknowledged,
        exactRetries: person.retries,
        latestAcknowledgedRevision: person.latestAckRevision,
        savedRevision: head?.revision ?? 0,
        admittedRevision: head?.admitted ?? 0,
        fresh:
          (head?.revision ?? 0) === (head?.admitted ?? 0) &&
          (head?.revision ?? 0) === person.latestAckRevision,
        journalMatches:
          (head?.revision ?? 0) === 0
            ? (stateWriter?.sourceRevision ?? 0) === 0
            : stateWriter?.text === app.store.current(person.id).text,
      };
    });

    const storeSaveDates = new Map(
      revisionRows.map((row) => [
        `${row.participant}:revision:${row.revision}`,
        Date.parse(row.saved_at),
      ]),
    );
    const runPath = app.runPath;
    await app.close();
    const { readLiveRun } = await import("./live-runs.ts");
    const run = await readLiveRun(runPath);
    const admissionDates = new Map<string, number>();
    const admissionIds: string[] = [];
    for (const [index, record] of run.events.entries()) {
      if (
        record.event.type === "input.revised" ||
        record.event.type === "input.admitted"
      ) {
        admissionIds.push(record.event.id);
        const next = run.events[index + 1];
        if (!next) throw new Error("Missing durable-admission upper bound.");
        admissionDates.set(record.event.id, Date.parse(next.at));
      }
    }
    const durableAdmissionLatencies: number[] = [];
    let supersededUnadmitted = 0;
    let missingLatestAdmission = 0;
    for (const row of revisionRows) {
      const id = `${row.participant}:revision:${row.revision}`;
      const admittedAt = admissionDates.get(id);
      if (admittedAt !== undefined) {
        const savedAt = storeSaveDates.get(id);
        if (savedAt !== undefined)
          durableAdmissionLatencies.push(admittedAt - savedAt);
      } else if (row.revision < (heads.get(row.participant)?.revision ?? 0)) {
        supersededUnadmitted++;
      } else {
        missingLatestAdmission++;
      }
    }
    const duplicateAdmissionIds =
      admissionIds.length - new Set(admissionIds).size;
    const acknowledgedStateLost = participantDetails.some(
      (item) => !item.fresh || !item.journalMatches,
    );
    const summary = {
      version: 1,
      createdAt: new Date().toISOString(),
      schedule,
      durationMs,
      participantCount: participants,
      intervalMs: 2_000,
      outputDirectory: out,
      runPath,
      requests: {
        attempted,
        acknowledged,
        exactRetries: retries,
        failures: errors.length,
      },
      generation: generationStats,
      latencyBasis:
        "Save-to-admission is an upper bound: SQLite pre-commit saved_at to the next journal record after the admission has synced.",
      latency: {
        sendToAck: metric(ackLatencies),
        durableSaveToAdmission: metric(durableAdmissionLatencies),
        finalDrainMs: drainMs,
        controllerPauseMs: pauseMs,
        controllerResumeMs: resumeMs,
        controllerEndMs: endMs,
      },
      state: {
        allLatestRevisionsAdmitted: drained,
        acknowledgedStateLost,
        duplicateAdmissionIds,
        missingLatestAdmission,
        supersededUnadmittedRevisions: supersededUnadmitted,
        finalRevisionFreshness:
          participantDetails.filter((item) => item.fresh).length / participants,
        journalMatchesSavedState: participantDetails.every(
          (item) => item.journalMatches,
        ),
      },
      thresholds: {
        sendToAckP95AtMost1000Ms:
          (metric(ackLatencies).p95Ms ?? Infinity) <= 1_000,
        durableAdmissionP95AtMost3000Ms:
          (metric(durableAdmissionLatencies).p95Ms ?? Infinity) <= 3_000,
        durableAdmissionMaxAtMost5000Ms:
          (metric(durableAdmissionLatencies).maxMs ?? Infinity) <= 5_000,
        drainAtMost5000Ms: drained && drainMs <= 5_000,
        controllerPauseAtMost5000Ms: pauseMs <= 5_000,
        controllerResumeAtMost5000Ms: resumeMs <= 5_000,
        controllerEndAtMost5000Ms: endMs <= 5_000,
        noLostAcknowledgedState: !acknowledgedStateLost,
        noDuplicateAdmission: duplicateAdmissionIds === 0,
        noMissingLatestAdmission: missingLatestAdmission === 0,
        noRequestFailures: errors.length === 0,
        observedStreamingGeneration: observedGeneration,
      },
      participants: participantDetails,
    };
    const passed = Object.values(summary.thresholds).every(Boolean);
    const result = { ...summary, passed };
    await writeFile(join(out, "metrics.json"), JSON.stringify(result), {
      mode: 0o600,
      flag: "wx",
    });
    await chmod(join(out, "metrics.json"), 0o600);
    return result;
  } catch (error) {
    await app.close().catch(() => {});
    throw error;
  }
}

function parseArgs(args: string[]): ParticipationLoadOptions {
  const parsed: Partial<ParticipationLoadOptions> = {};
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--"))
      throw new Error(
        "Usage: participation-load --out PATH [--duration-ms N] [--participants N] [--schedule burst|staggered]",
      );
    index++;
    if (name === "--out") parsed.out = value;
    else if (name === "--duration-ms") parsed.durationMs = Number(value);
    else if (name === "--participants") parsed.participants = Number(value);
    else if (name === "--schedule")
      parsed.schedule = value as ParticipationLoadOptions["schedule"];
    else throw new Error(`Unknown option ${name}.`);
  }
  parsed.out ??= join(
    "runs",
    `participation-load-${new Date().toISOString().replaceAll(":", "-")}`,
  );
  return parsed as ParticipationLoadOptions;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const result = await runParticipationLoad(parseArgs(process.argv.slice(2)));
    const { participants: _participants, ...summary } = result;
    console.log(JSON.stringify(summary));
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Load harness failed.",
    );
    process.exitCode = 1;
  }
}
