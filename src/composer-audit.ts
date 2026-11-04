import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { isLiveRun, readLiveRun } from "./live-runs.ts";

type Publication = { at: string; version: number; offset: number };
type SourceAudit = {
  id: string;
  name: string;
  offset: number;
  previousOffset: number;
  prefix: string;
  newlyAvailable: string;
  verified: boolean;
};
export type ComposerAuditRequest = {
  attemptId: string;
  sequence: number;
  startedAt: string;
  finishedAt: string | null;
  finishReason: string | null;
  code: string | null;
  firstTextAt: string | null;
  timeToFirstTextMs: number | null;
  collectiveBefore: string;
  appended: string;
  inputCharacters: number;
  outputCharacters: number;
  sources: SourceAudit[];
  inputVerified: boolean;
  collectiveWords: number;
  averageParticipantWords: number;
  ratio: number | null;
  publications: Publication[];
};
export type ComposerAudit = {
  schemaVersion: 1;
  path: string;
  runId: string;
  mode: string;
  status: string;
  inputFingerprint: string | null;
  configFingerprint: string;
  promptFingerprint: string;
  model: { provider: string; name: string };
  speakingSpace: {
    collectiveWords: number;
    averageParticipantWords: number;
    ratio: number | null;
  };
  requests: ComposerAuditRequest[];
  published: { version: number; offset: number };
  incompleteTailBytes: number;
  warnings: string[];
};

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const words = (value: string) => value.match(/\S+/gu)?.length ?? 0;
const sliceUtf16 = (value: string, offset: number) => value.slice(0, offset);

function userSnapshot(messages: unknown): Record<string, unknown> | null {
  if (!Array.isArray(messages)) return null;
  const user = messages.find(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      "role" in message &&
      message.role === "user" &&
      "content" in message &&
      typeof message.content === "string",
  );
  if (!user) return null;
  try {
    const parsed: unknown = JSON.parse(user.content);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function promptFingerprint(messages: unknown): string {
  if (!Array.isArray(messages)) return hash(null);
  const stable = messages.flatMap((message) => {
    if (
      typeof message !== "object" ||
      message === null ||
      !("role" in message) ||
      !("content" in message)
    )
      return [];
    if (message.role === "assistant") return [];
    if (message.role === "system" && typeof message.content === "string") {
      const dynamic = message.content.search(
        /\n\n(?:Continue YOUR OWN saved contribution|Begin your own contribution now\.)/u,
      );
      return [
        {
          role: message.role,
          content:
            dynamic < 0 ? message.content : message.content.slice(0, dynamic),
        },
      ];
    }
    if (message.role === "user" && typeof message.content === "string") {
      try {
        const value: unknown = JSON.parse(message.content);
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value)
        ) {
          const copy = { ...value } as Record<string, unknown>;
          delete copy.existingText;
          delete copy.continuationInstruction;
          if (typeof copy.task === "string")
            copy.task = copy.task.replace(/^(?:Begin|Continue)\b/u, "Start");
          if (
            typeof copy.speakingSpace === "object" &&
            copy.speakingSpace !== null &&
            !Array.isArray(copy.speakingSpace)
          ) {
            const space = { ...copy.speakingSpace } as Record<string, unknown>;
            delete space.collectiveWordsSoFar;
            copy.speakingSpace = space;
          }
          return [{ role: message.role, content: copy }];
        }
      } catch {
        // Keep unrecognised user content hash-only, without interpreting it.
      }
    }
    return [{ role: message.role, content: message.content }];
  });
  return hash(stable);
}

/** Read a live journal and audit the exact source prefixes recorded for composer requests. */
export async function inspectComposer(path: string): Promise<ComposerAudit> {
  if (!(await isLiveRun(path)))
    throw new Error("Composer audit supports live run logs only.");
  const { state, events, tail } = await readLiveRun(path);
  const mode = state.config.live.mode ?? "continuous";
  const composerStarts = events.filter(
    (record) =>
      record.event.type === "generation.started" &&
      record.event.actorId === "collective",
  );
  const participantText = new Map(
    state.scenario.voices.map((voice, index) => [
      voice.id,
      state.participants[index]?.text ?? "",
    ]),
  );
  const priorOffsets = new Map(
    state.scenario.voices.map((voice) => [voice.id, 0]),
  );
  const outputs = new Map<string, string>();
  const firstText = new Map<string, string>();
  const finishes = new Map<
    string,
    { at: string; reason: string; code: string | null }
  >();
  const publications: (Publication & { sequence: number })[] = [];
  let activeCollectiveAttempt: string | null = null;
  for (const record of events) {
    const event = record.event;
    if (event.type === "generation.started" && event.actorId === "collective")
      activeCollectiveAttempt = event.attemptId;
    if (event.type === "text.appended" && event.actorId === "collective") {
      firstText.set(
        event.attemptId,
        firstText.get(event.attemptId) ?? record.at,
      );
      outputs.set(
        event.attemptId,
        `${outputs.get(event.attemptId) ?? ""}${event.text}`,
      );
    }
    if (
      event.type === "generation.finished" &&
      event.actorId === "collective"
    ) {
      finishes.set(event.attemptId, {
        at: record.at,
        reason: event.reason,
        code: event.code ?? null,
      });
      if (activeCollectiveAttempt === event.attemptId)
        activeCollectiveAttempt = null;
    }
    if (event.type === "session.recovered" && activeCollectiveAttempt) {
      finishes.set(activeCollectiveAttempt, {
        at: record.at,
        reason: "interrupted",
        code: null,
      });
      activeCollectiveAttempt = null;
    }
    if (event.type === "collective.published")
      publications.push({
        at: record.at,
        version: event.version,
        offset: event.offset,
        sequence: record.sequence,
      });
  }

  let collective = "";
  const requests: ComposerAuditRequest[] = [];
  const orderedInputs: unknown[] = [];
  const promptFingerprints: string[] = [];
  for (const [index, record] of composerStarts.entries()) {
    if (record.event.type !== "generation.started") continue;
    const event = record.event;
    const snapshot = userSnapshot(event.messages);
    const rawParticipants = snapshot?.participants;
    const parsedSources = Array.isArray(rawParticipants)
      ? rawParticipants.filter(
          (
            value,
          ): value is {
            id: string;
            text: string;
            newFrom: number;
            newText: string;
          } =>
            typeof value === "object" &&
            value !== null &&
            "id" in value &&
            typeof value.id === "string" &&
            "text" in value &&
            typeof value.text === "string" &&
            "newFrom" in value &&
            Number.isSafeInteger(value.newFrom) &&
            value.newFrom >= 0 &&
            "newText" in value &&
            typeof value.newText === "string",
        )
      : [];
    const sources: SourceAudit[] = state.scenario.voices.map((voice) => {
      const offset = event.sourceOffsets[voice.id] ?? 0;
      const full = participantText.get(voice.id) ?? "";
      const prefix = sliceUtf16(full, offset);
      const previousOffset = priorOffsets.get(voice.id) ?? 0;
      const recorded = parsedSources.find((source) => source.id === voice.id);
      const verified = Boolean(
        recorded &&
          recorded.text === prefix &&
          recorded.newFrom === previousOffset &&
          recorded.newText === prefix.slice(previousOffset),
      );
      return {
        id: voice.id,
        name: voice.name,
        offset,
        previousOffset,
        prefix,
        newlyAvailable: prefix.slice(previousOffset),
        verified,
      };
    });
    const inputVerified =
      Array.isArray(rawParticipants) &&
      rawParticipants.length === state.scenario.voices.length &&
      sources.every((source) => source.verified) &&
      parsedSources.length === state.scenario.voices.length;
    orderedInputs.push(
      sources.map(({ id, offset, prefix, newlyAvailable }) => ({
        id,
        offset,
        prefix,
        newlyAvailable,
      })),
    );
    promptFingerprints.push(promptFingerprint(event.messages));

    const before = collective;
    const appended = outputs.get(event.attemptId) ?? "";
    collective += appended;
    const averageParticipantWords =
      sources.reduce((sum, source) => sum + words(source.prefix), 0) /
      (sources.length || 1);
    const collectiveWords = words(collective);
    const finished = finishes.get(event.attemptId);
    const priorStart = record.sequence;
    const nextStart = composerStarts[index + 1]?.sequence;
    const requestPublications = publications.filter(
      (publication) =>
        publication.sequence >= priorStart &&
        (!nextStart || publication.sequence < nextStart),
    );
    const firstTextAt = firstText.get(event.attemptId) ?? null;
    requests.push({
      attemptId: event.attemptId,
      sequence: index + 1,
      startedAt: record.at,
      finishedAt: finished?.at ?? null,
      finishReason: finished?.reason ?? null,
      code: finished?.code ?? null,
      firstTextAt,
      timeToFirstTextMs: firstTextAt
        ? Math.max(0, Date.parse(firstTextAt) - Date.parse(record.at))
        : null,
      collectiveBefore: before,
      appended,
      inputCharacters: event.messages.reduce(
        (sum, message) => sum + Array.from(message.content).length,
        0,
      ),
      outputCharacters: Array.from(appended).length,
      sources,
      inputVerified,
      collectiveWords,
      averageParticipantWords,
      ratio:
        averageParticipantWords === 0
          ? null
          : collectiveWords / averageParticipantWords,
      publications: requestPublications,
    });
    for (const source of sources) priorOffsets.set(source.id, source.offset);
  }
  const admittedParticipantTexts = state.participants.map(
    (participant) => participant.text,
  );
  const averageParticipantWords =
    admittedParticipantTexts.reduce((sum, text) => sum + words(text), 0) /
    (admittedParticipantTexts.length || 1);
  const collectiveWords = words(state.composer.text);
  const lastPublication = publications.at(-1);
  const inputsVerified =
    requests.length > 0 && requests.every((request) => request.inputVerified);
  return {
    schemaVersion: 1,
    path: resolve(path),
    runId: state.runId,
    mode,
    status: state.status,
    inputFingerprint: inputsVerified ? hash(orderedInputs) : null,
    configFingerprint: hash(state.config),
    promptFingerprint: hash(promptFingerprints),
    model: {
      provider: state.config.composer.provider,
      name: state.config.composer.model,
    },
    speakingSpace: {
      collectiveWords,
      averageParticipantWords,
      ratio:
        averageParticipantWords === 0
          ? null
          : collectiveWords / averageParticipantWords,
    },
    requests,
    published: {
      version: state.collectiveVersion,
      offset: state.publishedOffset ?? lastPublication?.offset ?? 0,
    },
    incompleteTailBytes: tail.length,
    warnings: [
      ...(requests.length === 0
        ? ["Input fingerprint unavailable: no composer requests were recorded."]
        : []),
      ...(tail.length
        ? [
            `Incomplete final JSONL fragment of ${tail.length} bytes was ignored.`,
          ]
        : []),
      ...(requests.some((request) => request.finishReason === null)
        ? [
            "One or more composer attempts have no finish event; saved prefixes remain included.",
          ]
        : []),
      ...(!inputsVerified && requests.length
        ? [
            "Input fingerprint unavailable: one or more stored participant snapshots could not be verified against recorded source offsets.",
          ]
        : []),
      "This offline audit reports recorded inputs, text counts and journal timing; it does not certify composition quality.",
      "Time to first text uses journal timestamps and includes time spent saving streamed text; it is not a network latency measurement.",
    ],
  };
}

export function formatComposerAudit(audit: ComposerAudit): string {
  const ratio = (value: number | null) =>
    value === null ? "n/a (zero participant words)" : `${value.toFixed(2)}×`;
  const lines = [
    `Run: ${audit.path}`,
    `ID: ${audit.runId}`,
    `Mode/status: ${audit.mode} / ${audit.status}`,
    `Composer: ${audit.model.provider}/${audit.model.name}`,
    `Input fingerprint: ${audit.inputFingerprint ?? "unavailable (source snapshot verification failed)"}`,
    `Config fingerprint: ${audit.configFingerprint}`,
    `Prompt fingerprint: ${audit.promptFingerprint}`,
    `Whole run: ${audit.speakingSpace.collectiveWords} collective words; ${audit.speakingSpace.averageParticipantWords} average participant words; ${ratio(audit.speakingSpace.ratio)}`,
    `Published: version ${audit.published.version}, ${audit.published.offset} UTF-16 characters`,
  ];
  for (const request of audit.requests) {
    lines.push(
      `\nRequest ${request.sequence} (${request.attemptId}) ${request.finishReason ?? "unfinished"}${request.code ? ` / ${request.code}` : ""}`,
    );
    lines.push(
      `Input ${request.inputVerified ? "verified" : "uncertain"}; cumulative ratio ${ratio(request.ratio)}; ${request.collectiveWords} collective words / ${request.averageParticipantWords} average admitted participant words`,
    );
    lines.push(
      `First text: ${request.timeToFirstTextMs === null ? "none saved" : `${request.timeToFirstTextMs} ms (${request.firstTextAt})`}; input ${request.inputCharacters} characters; output ${request.outputCharacters} characters`,
    );
    for (const source of request.sources)
      lines.push(
        `${source.name} [${source.previousOffset}–${source.offset}; ${source.verified ? "verified" : "uncertain"}] prefix: ${source.prefix}\nNew: ${source.newlyAvailable}`,
      );
    lines.push(`Collective before: ${request.collectiveBefore || "(empty)"}`);
    lines.push(`Appended: ${request.appended || "(no saved output)"}`);
    for (const publication of request.publications)
      lines.push(
        `Published ${publication.version} at ${publication.offset} characters (${publication.at})`,
      );
  }
  lines.push("\nWarnings:", ...audit.warnings.map((warning) => `- ${warning}`));
  return lines.join("\n");
}
