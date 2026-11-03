import { open, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { percentageRanges } from "./composition.ts";
import { readContinuousRun } from "./continuous-runs.ts";
import { readLiveRun } from "./live-runs.ts";
import { readRun } from "./runs.ts";
import { readSimulationRun } from "./simulation-runs.ts";

type SavedText = { text: string; characters: number; truncated: boolean };
type RecordedEvent = {
  at: string;
  event: {
    type: string;
    reason?: string;
    outcome?: string;
    code?: string;
    actorId?: string;
    participantId?: string;
    turnId?: string;
    status?: number;
  };
};
type Failure = {
  at: string;
  actor: string;
  reason: string;
  code: string | null;
  httpStatus: number | null;
};
export type RunSummary = {
  schemaVersion: 1;
  path: string;
  runId: string;
  kind: "live" | "scripted" | "simulation" | "historical-continuous";
  title: string;
  mode: string | null;
  recordedStatus: string;
  createdAt: string;
  updatedAt: string;
  recordCount: number;
  incompleteTailBytes: number;
  models: { composer: string; participants: string | null };
  progress: { completed: number; total: number | null; unit: string };
  timing: { recordedActiveMs: number; limitMs: number } | null;
  collective: SavedText & {
    basis: "saved live text" | "accepted passages";
    publishedCharacters: number | null;
  };
  participants: { id: string; name: string; output: SavedText }[];
  outstandingAttempts: number;
  pending: string[];
  failures: { total: number; recent: Failure[] };
  warnings: string[];
};

function excerpt(text: string, limit: number, full: boolean): SavedText {
  const characters = Array.from(text);
  const truncated = !full && characters.length > limit;
  return {
    text: truncated
      ? `${characters.slice(0, Math.floor(limit * 0.75)).join("")}\n[…]\n${characters.slice(-Math.floor(limit * 0.25)).join("")}`
      : text,
    characters: characters.length,
    truncated,
  };
}

function failures(events: RecordedEvent[]): RunSummary["failures"] {
  const found: Failure[] = [];
  const turnActors = new Map<string, string>();
  for (const { at, event } of events) {
    if (
      event.type === "participant.started" &&
      event.turnId &&
      event.participantId
    )
      turnActors.set(event.turnId, event.participantId);
    const reason = event.reason ?? event.outcome;
    if (
      event.type === "generation.failed" ||
      event.type === "participant.failed" ||
      event.type === "session.recovered" ||
      ((event.type === "generation.finished" ||
        event.type === "participant.finished") &&
        (reason === "failed" || reason === "interrupted"))
    ) {
      found.push({
        at,
        actor:
          event.actorId ??
          event.participantId ??
          (event.turnId ? turnActors.get(event.turnId) : undefined) ??
          (event.type === "session.recovered" ? "session" : "collective"),
        reason:
          event.type === "session.recovered"
            ? "interrupted"
            : (reason ?? "failed"),
        code: event.code ?? null,
        httpStatus: event.status ?? null,
      });
    }
  }
  return { total: found.length, recent: found.slice(-5) };
}

/** Select by modification time; print the selected path so comparisons are explicit. */
export async function latestJournal(directory = "runs"): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map(async (entry) => {
        const path = resolve(join(directory, entry.name));
        return { path, modified: (await stat(path)).mtimeMs };
      }),
  );
  candidates.sort(
    (a, b) => b.modified - a.modified || a.path.localeCompare(b.path),
  );
  const latest = candidates[0];
  if (!latest)
    throw new Error("No saved JSONL runs found. Use inspect --run <path>.");
  return latest.path;
}

/** Reads validated journal state without acquiring a writer lock or recovering it. */
export async function inspectRun(
  path: string,
  full = false,
): Promise<RunSummary> {
  path = resolve(path);
  let opening: { event?: { type?: string } } | null = null;
  try {
    const file = await open(path, "r");
    try {
      for await (const line of file.readLines()) {
        opening = JSON.parse(line);
        break;
      }
      if (opening === null) throw new Error("Missing opening record.");
    } finally {
      await file.close();
    }
  } catch {
    throw new Error("Cannot read a valid opening record from the run log.");
  }
  const model = (value: { provider: string; model: string }) =>
    `${value.provider}/${value.model}`;
  const collective = (
    text: string,
    basis: RunSummary["collective"]["basis"],
    publishedCharacters: number | null = null,
  ) => ({ ...excerpt(text, 1200, full), basis, publishedCharacters });
  const participant = (id: string, name: string, text: string) => ({
    id,
    name,
    output: excerpt(text, 240, full),
  });
  const base = (runId: string, events: RecordedEvent[], tail: Buffer) => ({
    schemaVersion: 1 as const,
    path,
    runId,
    createdAt: events[0]?.at ?? "",
    updatedAt: events.at(-1)?.at ?? "",
    recordCount: events.length,
    incompleteTailBytes: tail.length,
    failures: failures(events),
    timing: null,
    warnings: [
      "Snapshot of recorded state; does not establish whether a writer process is still running.",
      ...(tail.length
        ? [
            "Incomplete final JSONL fragment ignored; inspection has not repaired the file.",
          ]
        : []),
    ],
  });
  switch (opening?.event?.type) {
    case "live.created": {
      const { state, events, tail } = await readLiveRun(path);
      const active = [state.composer, ...state.participants].filter(
        (writer) => writer.active,
      ).length;
      const unpublished = state.composer.text.slice(state.publishedOffset);
      const fixedSteps =
        state.config.live.mode === "fixed" && state.config.live.score
          ? percentageRanges(state.config.live.score).length
          : null;
      const uncomposedSteps =
        fixedSteps === null ? 0 : fixedSteps - state.scheduler.cycle;
      return {
        ...base(state.runId, events, tail),
        kind: "live",
        title: state.scenario.title,
        mode: state.config.live.mode ?? "continuous",
        recordedStatus: state.status,
        models: {
          composer: model(state.config.composer),
          participants: model(state.config.live.participants),
        },
        progress: {
          completed:
            state.config.live.mode === "fixed"
              ? state.scheduler.cycle
              : state.collectiveVersion,
          total: fixedSteps,
          unit:
            state.config.live.mode === "fixed"
              ? "composed source steps"
              : "collective publications",
        },
        timing: {
          recordedActiveMs:
            state.elapsedMs +
            (state.sessionStartedAt
              ? Math.max(
                  0,
                  Date.parse(state.updatedAt) -
                    Date.parse(state.sessionStartedAt),
                )
              : 0),
          limitMs: state.config.live.maxDurationMs,
        },
        collective: collective(
          state.composer.text,
          "saved live text",
          Array.from(state.composer.text.slice(0, state.publishedOffset))
            .length,
        ),
        participants: state.scenario.voices.map((voice, index) =>
          participant(
            voice.id,
            voice.name,
            state.participants[index]?.text ?? "",
          ),
        ),
        outstandingAttempts: active,
        pending: [
          ...(uncomposedSteps > 0
            ? [
                state.status === "ended"
                  ? `${uncomposedSteps} source steps were not composed before the session ended.`
                  : `${uncomposedSteps} source steps remain uncomposed.`,
              ]
            : []),
          ...(state.pauseReason ? [`Pause reason: ${state.pauseReason}`] : []),
          ...(unpublished
            ? [
                `${Array.from(unpublished).length} saved collective characters are unpublished.`,
              ]
            : []),
          ...(active
            ? [`${active} recorded attempts have no finish event.`]
            : []),
          ...(state.status !== "ended" ? ["Session has no end event."] : []),
        ],
      };
    }
    case "run.created": {
      const { state, events, tail } = await readRun(path);
      return {
        ...base(state.runId, events, tail),
        kind: "scripted",
        title: state.score.title,
        mode: null,
        recordedStatus: state.complete ? "completed" : "incomplete",
        models: { composer: model(state.config.composer), participants: null },
        progress: {
          completed: state.passages.length,
          total: state.totalSteps,
          unit: "steps",
        },
        collective: collective(
          state.passages.map((passage) => passage.text).join("\n\n"),
          "accepted passages",
        ),
        participants: state.score.voices.map((voice) =>
          participant(
            voice.id,
            voice.name,
            state.admitted
              .flat()
              .filter((input) => input.participantId === voice.id)
              .map((input) => input.text)
              .join(""),
          ),
        ),
        outstandingAttempts: state.attemptId ? 1 : 0,
        pending: state.complete
          ? []
          : [
              ...(state.pending
                ? ["Admitted input has no accepted collective passage."]
                : []),
              ...(state.attemptId
                ? ["Recorded collective attempt has no finish event."]
                : []),
              "Run has no completion event.",
            ],
      };
    }
    case "simulation.created": {
      const { state, events, tail } = await readSimulationRun(path);
      const active = state.rounds.reduce(
        (sum, round) =>
          sum +
          Object.keys(round.attempts).length +
          (round.composerAttemptId ? 1 : 0),
        0,
      );
      return {
        ...base(state.runId, events, tail),
        kind: "simulation",
        title: state.scenario.title,
        mode: state.recordedRounds
          ? "frozen-response rerun"
          : "generated responses",
        recordedStatus: state.complete ? "completed" : "incomplete",
        models: {
          composer: model(state.config.composer),
          participants: model(state.config.simulation.participants),
        },
        progress: {
          completed: state.roundsCompleted,
          total:
            state.recordedRounds?.length ?? state.config.simulation.maxRounds,
          unit: "rounds",
        },
        collective: collective(
          state.passages.map((passage) => passage.text).join("\n\n"),
          "accepted passages",
        ),
        participants: state.scenario.voices.map((voice) =>
          participant(
            voice.id,
            voice.name,
            state.rounds
              .map((round) => round.responses[voice.id]?.text ?? "")
              .filter(Boolean)
              .join("\n\n"),
          ),
        ),
        outstandingAttempts: active,
        pending: state.complete
          ? []
          : [
              ...state.rounds
                .filter((round) => !round.complete)
                .map(
                  (round) =>
                    `Round ${round.index + 1}: ${Object.keys(round.responses).length}/${state.scenario.voices.length} participant responses saved; collective ${round.passage ? "accepted" : "pending"}.`,
                ),
              ...(active
                ? [`${active} recorded attempts have no finish event.`]
                : []),
              "Run has no completion event.",
            ],
      };
    }
    case "continuous.created": {
      const { state, events, tail } = await readContinuousRun(path);
      const active =
        state.turns.filter((turn) => turn.status === "streaming").length +
        (state.pendingBatch?.attemptId ? 1 : 0);
      return {
        ...base(state.runId, events, tail),
        kind: "historical-continuous",
        title: state.scenario.title,
        mode: "bounded turns",
        recordedStatus: state.complete ? "completed" : "incomplete",
        models: {
          composer: model(state.config.composer),
          participants: model(state.config.continuous.participants),
        },
        progress: {
          completed: state.passages.length,
          total: null,
          unit: "accepted passages",
        },
        collective: collective(
          state.passages.map((passage) => passage.text).join("\n\n"),
          "accepted passages",
        ),
        participants: state.scenario.voices.map((voice) =>
          participant(
            voice.id,
            voice.name,
            state.turns
              .filter((turn) => turn.participantId === voice.id)
              .map((turn) => turn.text)
              .join("\n\n"),
          ),
        ),
        outstandingAttempts: active,
        pending: [
          ...(state.pendingBatch
            ? ["Admitted batch has no accepted collective passage."]
            : []),
          ...(state.turns.some(
            (turn) => Array.from(turn.text).length > turn.consumed,
          )
            ? ["Saved participant text remains unconsumed."]
            : []),
          ...(active
            ? [`${active} recorded attempts have no finish event.`]
            : []),
          ...(!state.complete ? ["Run has no completion event."] : []),
        ],
      };
    }
    default:
      throw new Error("Unsupported run log opening event.");
  }
}

export function formatRunSummary(summary: RunSummary): string {
  const { progress, collective } = summary;
  const output = (value: SavedText) =>
    `${value.text || "(no saved text)"}${value.truncated ? "\n[excerpt; use --full for complete writing]" : ""}`;
  return [
    `${summary.title} — ${summary.kind}${summary.mode ? ` / ${summary.mode}` : ""}`,
    `Run: ${summary.path}`,
    `ID: ${summary.runId}`,
    `Recorded status: ${summary.recordedStatus}; last event: ${summary.updatedAt}`,
    `Models: collective ${summary.models.composer}${summary.models.participants ? `; participants ${summary.models.participants}` : ""}`,
    `Progress: ${progress.completed}${progress.total === null ? "" : `/${progress.total}`} ${progress.unit}`,
    ...(summary.timing
      ? [
          `Recorded active time: ${summary.timing.recordedActiveMs} ms; configured limit: ${summary.timing.limitMs} ms`,
        ]
      : []),
    `Failures/interruption records: ${summary.failures.total}; unfinished attempts: ${summary.outstandingAttempts}`,
    ...summary.pending.map((item) => `Pending: ${item}`),
    ...summary.failures.recent.map(
      (failure) =>
        `History: ${failure.at} ${failure.actor}: ${failure.reason}${failure.code ? ` (${failure.code})` : ""}${failure.httpStatus ? ` HTTP ${failure.httpStatus}` : ""}`,
    ),
    "",
    `COLLECTIVE — ${collective.basis}; ${collective.characters} characters${collective.publishedCharacters === null ? "" : `; ${collective.publishedCharacters} published`}`,
    output(collective),
    "",
    "PARTICIPANTS — saved/admitted text (not private starting context)",
    ...summary.participants.flatMap((writer) => [
      `${writer.name} (${writer.id}): ${writer.output.characters} characters`,
      output(writer.output),
      "",
    ]),
    ...summary.warnings.map((warning) => `Note: ${warning}`),
    "Counts use Unicode code points. Inspection success does not certify run completion or artistic quality.",
    "",
  ].join("\n");
}
