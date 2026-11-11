import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { readLiveRun } from "./live-runs.ts";

function summary(values: number[]) {
  const ordered = values.toSorted((a, b) => a - b);
  return {
    count: ordered.length,
    p95Ms: ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? null,
    maxMs: ordered.at(-1) ?? null,
  };
}

/** Inspect a closed load run. The next record cannot be created before the
 * preceding journal write has synced. Its timestamp is a conservative bound,
 * not an exact sync timestamp. SQLite saved_at precedes its commit as well.
 */
export async function inspectLoadDurability(directory: string) {
  const metrics = JSON.parse(
    await readFile(join(directory, "metrics.json"), "utf8"),
  ) as {
    durationMs: number;
    schedule: string;
    participantCount: number;
    requests: { attempted: number; exactRetries: number };
    thresholds: Record<string, boolean>;
  };
  const run = await readLiveRun(join(directory, "live.jsonl"));
  if (run.state.status !== "ended" || run.tail.length)
    throw new Error("Inspect a completed load run with an intact journal.");
  const db = new DatabaseSync(join(directory, "participation.sqlite"), {
    readOnly: true,
  });
  let rows: { participant: string; revision: number; saved_at: string }[];
  try {
    rows = db
      .prepare(
        "SELECT participant,revision,saved_at FROM revisions ORDER BY participant,revision",
      )
      .all() as typeof rows;
  } finally {
    db.close();
  }
  const saved = new Map(
    rows.map((row) => [`${row.participant}:revision:${row.revision}`, row]),
  );
  type Point = { at: number; revision: number; kind: "saved" | "admitted" };
  const timelines = new Map<string, Point[]>();
  const latencies = new Map<string, number[]>();
  for (const row of rows) {
    const points = timelines.get(row.participant) ?? [];
    points.push({
      at: Date.parse(row.saved_at),
      revision: row.revision,
      kind: "saved",
    });
    timelines.set(row.participant, points);
  }
  let missingBound = 0;
  for (const [index, record] of run.events.entries()) {
    if (record.event.type !== "input.revised") continue;
    const row = saved.get(record.event.id);
    const next = run.events[index + 1];
    if (!row || !next) {
      missingBound++;
      continue;
    }
    const upper = Date.parse(next.at);
    const values = latencies.get(row.participant) ?? [];
    values.push(upper - Date.parse(row.saved_at));
    latencies.set(row.participant, values);
    timelines
      .get(row.participant)
      ?.push({ at: upper, revision: row.revision, kind: "admitted" });
  }
  const participants = [...timelines].map(([id, points]) => {
    points.sort(
      (a, b) =>
        a.at - b.at ||
        (a.kind === b.kind
          ? a.revision - b.revision
          : a.kind === "saved"
            ? -1
            : 1),
    );
    let pending: Point[] = [];
    let admitted = 0;
    let maxPendingWaitUpperBoundMs = 0;
    for (const point of points) {
      if (point.kind === "saved") {
        if (point.revision > admitted) pending.push(point);
      } else {
        const oldest = pending[0];
        if (oldest)
          maxPendingWaitUpperBoundMs = Math.max(
            maxPendingWaitUpperBoundMs,
            point.at - oldest.at,
          );
        admitted = Math.max(admitted, point.revision);
        pending = pending.filter((p) => p.revision > admitted);
      }
    }
    if (pending[0])
      maxPendingWaitUpperBoundMs = Math.max(
        maxPendingWaitUpperBoundMs,
        Date.parse(run.state.updatedAt) - pending[0].at,
      );
    return {
      id,
      saveToDurableAdmissionUpperBound: summary(latencies.get(id) ?? []),
      maxPendingWaitUpperBoundMs,
      pendingAtEnd: pending.length,
    };
  });
  const all = summary([...latencies.values()].flat());
  const existing = Object.fromEntries(
    Object.entries(metrics.thresholds).filter(
      ([key]) => !key.startsWith("durableAdmission"),
    ),
  );
  const offeredFraction =
    metrics.schedule === "burst"
      ? (metrics.requests.attempted - metrics.requests.exactRetries) /
        (Math.ceil(metrics.durationMs / 1000) * metrics.participantCount)
      : null;
  const thresholds: Record<string, boolean> = {
    ...existing,
    completeDurabilityBounds: missingBound === 0,
    durableAdmissionP95AtMost3000Ms: all.p95Ms !== null && all.p95Ms <= 3000,
    durableAdmissionMaxAtMost5000Ms: all.maxMs !== null && all.maxMs <= 5000,
    noParticipantWaitsOver5000Ms:
      participants.length === metrics.participantCount &&
      participants.every(
        (p) =>
          p.maxPendingWaitUpperBoundMs <= 5000 &&
          p.pendingAtEnd === 0 &&
          p.saveToDurableAdmissionUpperBound.count > 0,
      ),
    ...(offeredFraction === null
      ? {}
      : { offeredAtLeast95PercentOfBurstLoad: offeredFraction >= 0.95 }),
  };
  return {
    version: 1,
    basis:
      "SQLite pre-commit saved_at to the next journal record after admission: conservative durable-admission upper bounds. Pending wait includes superseded revisions until a newer revision is admitted.",
    runPath: join(directory, "live.jsonl"),
    saveToDurableAdmissionUpperBound: all,
    offeredFraction,
    notApplicable:
      offeredFraction === null ? ["offeredAtLeast95PercentOfBurstLoad"] : [],
    thresholds,
    passed: Object.values(thresholds).every(Boolean),
    participants,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    if (process.argv.length !== 3)
      throw new Error("Usage: participation-load-inspect RUN_DIRECTORY");
    const directory = resolve(process.argv[2] ?? "");
    const report = await inspectLoadDurability(directory);
    await writeFile(
      join(directory, "durability.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    const { participants: _participants, ...compact } = report;
    console.log(JSON.stringify(compact));
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Inspection failed.",
    );
    process.exitCode = 1;
  }
}
