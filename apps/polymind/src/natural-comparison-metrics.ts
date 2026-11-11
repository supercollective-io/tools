import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readLiveRun } from "./live-runs.ts";

type Arrival = {
  track: string;
  participant: string;
  cue: number;
  scheduledMs: number;
  savedAt?: string;
};
type Request = { at: number; revisions: Record<string, number> };

function distribution(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  return {
    count: ordered.length,
    medianMs: ordered[Math.max(0, Math.ceil(ordered.length * 0.5) - 1)] ?? null,
    p95Ms: ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? null,
    maxMs: ordered.at(-1) ?? null,
  };
}

/** A later revision can clear a pending wait, but is not exposure of the old text. */
export function measureFreshness(arrivals: Arrival[], requests: Request[]) {
  const revisions = arrivals.map((arrival) => {
    const savedAt = Date.parse(arrival.savedAt ?? "");
    const request = Number.isFinite(savedAt)
      ? requests.find(
          (request) =>
            request.at >= savedAt &&
            (request.revisions[arrival.participant] ?? 0) >= arrival.cue,
        )
      : undefined;
    return {
      track: arrival.track,
      cue: arrival.cue,
      phase: arrival.scheduledMs === 150_000 ? "burst" : "staggered",
      timingAvailable: Number.isFinite(savedAt),
      pendingToRequestMs: request ? request.at - savedAt : null,
      supersededBeforeRequest: request
        ? (request.revisions[arrival.participant] ?? 0) > arrival.cue
        : null,
    };
  });
  const summarise = (rows: typeof revisions) => ({
    ...distribution(
      rows.flatMap((r) =>
        r.pendingToRequestMs === null ? [] : [r.pendingToRequestMs],
      ),
    ),
    unresolved: rows.filter(
      (r) => r.timingAvailable && r.pendingToRequestMs === null,
    ).length,
    missingTiming: rows.filter((r) => !r.timingAvailable).length,
    supersededBeforeRequest: rows.filter((r) => r.supersededBeforeRequest)
      .length,
  });
  return {
    all: summarise(revisions),
    burst: summarise(revisions.filter((r) => r.phase === "burst")),
    staggered: summarise(revisions.filter((r) => r.phase === "staggered")),
    revisions,
    note: "Pending-to-request measures availability of this revision or a newer one. Superseded text may never have appeared in a prompt. This is not semantic uptake. Unresolved waits are excluded from percentiles and reported separately.",
  };
}

export async function inspectNaturalTiming(directory: string) {
  const outcome = JSON.parse(
    await readFile(join(directory, "outcome.json"), "utf8"),
  ) as { arrivals: Arrival[] };
  const { events } = await readLiveRun(join(directory, "live.jsonl"));
  const revisions: Record<string, number> = Object.create(null);
  const requests: Request[] = [];
  const publications: number[] = [];
  for (const record of events) {
    const event = record.event;
    if (event.type === "input.revised") {
      const cue = Number(event.id.split(":revision:").at(-1));
      if (Number.isSafeInteger(cue) && cue > 0)
        revisions[event.participantId] = cue;
    }
    if (event.type === "generation.started" && event.actorId === "collective")
      requests.push({ at: Date.parse(record.at), revisions: { ...revisions } });
    if (event.type === "collective.published")
      publications.push(Date.parse(record.at));
  }
  return {
    freshness: measureFreshness(outcome.arrivals, requests),
    publicationGaps: distribution(
      publications
        .slice(1)
        .map((at, index) => at - (publications[index] ?? at)),
    ),
    publicationCount: publications.length,
    note: "Times are saved revision acknowledgement to generation.started journal timestamps, not provider receipt. Publication gaps exclude the initial and final silent intervals.",
  };
}
