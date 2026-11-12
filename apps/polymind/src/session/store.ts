import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  analysisV2Messages,
  personalAnalysis,
  publicAnalysis,
} from "./analysis.ts";
import {
  analysisV2Schema,
  digest,
  type Operation,
  type OperationConfig,
  type OperationKind,
  operationConfigSchema,
  type RevisionInput,
  revisionSchema,
  SessionError,
  type Snapshot,
  snapshotSchema,
} from "./contracts.ts";

const now = () => new Date().toISOString();
const secret = () => randomBytes(32).toString("hex");
type Session = {
  id: string;
  title: string;
  capacity: number;
  open: boolean;
  createdAt: string;
  presentation?:
    | { kind: "analysis"; operationId: string }
    | { kind: "voice" }
    | { kind: "writing"; roundId: string };
};
type Participant = { id: string; name: string; badge: string; seated: boolean };
type Round = {
  id: string;
  sessionId: string;
  prompt: string;
  mode: "bounded" | "continuous";
  open: boolean;
  createdAt: string;
  analysisId?: string;
  analysisSkipped?: boolean;
};
type Row = { body: string };
const decode = <T>(row: unknown): T | undefined =>
  row ? (JSON.parse((row as Row).body) as T) : undefined;

/** One process owns this database. All compound mutations use immediate transactions. */
export class SessionStore {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    const version = this.db.prepare("PRAGMA user_version").get()?.user_version;
    if (version !== 0 && version !== 1) {
      this.db.close();
      throw new Error("Unsupported session database version.");
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id), credential TEXT UNIQUE NOT NULL, recovery TEXT UNIQUE NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rounds (id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions (participant TEXT NOT NULL REFERENCES participants(id), round TEXT NOT NULL REFERENCES rounds(id), revision INTEGER NOT NULL, request TEXT NOT NULL, fingerprint TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(participant,round,revision), UNIQUE(participant,request));
      CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, round TEXT UNIQUE NOT NULL REFERENCES rounds(id), hash TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL REFERENCES snapshots(id), dedupe TEXT UNIQUE NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS encounters (operation TEXT PRIMARY KEY REFERENCES operations(id), session TEXT NOT NULL REFERENCES sessions(id), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS help (id TEXT PRIMARY KEY, participant TEXT NOT NULL REFERENCES participants(id), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS voice_runs (id TEXT PRIMARY KEY, session TEXT NOT NULL REFERENCES sessions(id), round TEXT NOT NULL REFERENCES rounds(id));
      CREATE TABLE IF NOT EXISTS recordings (id TEXT PRIMARY KEY, participant TEXT NOT NULL REFERENCES participants(id), round TEXT NOT NULL REFERENCES rounds(id), body TEXT NOT NULL);
      PRAGMA user_version=1;`);
    for (const row of this.db.prepare("SELECT body FROM operations").all()) {
      const op = decode<Operation>(row);
      if (op && ["queued", "running"].includes(op.state))
        this.saveOperation({
          ...op,
          state: "interrupted",
          endedAt: now(),
          error: "Server restarted. Review and explicitly retry.",
        });
    }
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  session(id: string) {
    const value = decode<Session>(
      this.db.prepare("SELECT body FROM sessions WHERE id=?").get(id),
    );
    if (!value) throw new SessionError("Session not found.", 404);
    return value;
  }
  sessions() {
    return this.db
      .prepare("SELECT body FROM sessions ORDER BY rowid DESC")
      .all()
      .map((r) => decode<Session>(r) as Session);
  }
  createSession(title: string, capacity: number) {
    if (
      !title.trim() ||
      title.length > 200 ||
      !Number.isInteger(capacity) ||
      capacity < 2 ||
      capacity > 180
    )
      throw new SessionError("Use a title and capacity between 2 and 180.");
    const session: Session = {
      id: randomUUID(),
      title: title.trim(),
      capacity,
      open: true,
      createdAt: now(),
    };
    this.db
      .prepare("INSERT INTO sessions VALUES (?,?)")
      .run(session.id, JSON.stringify(session));
    return session;
  }
  closeSession(id: string) {
    const session = { ...this.session(id), open: false };
    this.db
      .prepare("UPDATE sessions SET body=? WHERE id=?")
      .run(JSON.stringify(session), id);
    return session;
  }
  participants(session: string) {
    return this.db
      .prepare("SELECT body FROM participants WHERE session=? ORDER BY rowid")
      .all(session)
      .map((r) => decode<Participant>(r) as Participant);
  }
  participant(id: string) {
    const p = decode<Participant>(
      this.db.prepare("SELECT body FROM participants WHERE id=?").get(id),
    );
    if (!p) throw new SessionError("Participant not found.", 401);
    return p;
  }
  identify(session: string, credential: string) {
    return decode<Participant>(
      this.db
        .prepare(
          "SELECT body FROM participants WHERE session=? AND credential=?",
        )
        .get(session, digest(credential)),
    );
  }
  join(sessionId: string, name: string, seated = false) {
    return this.transaction(() => {
      const session = this.session(sessionId),
        count = this.participants(sessionId).length;
      if (!session.open) throw new SessionError("Joining has closed.", 409);
      if (count >= session.capacity)
        throw new SessionError("This session is full.", 409);
      if (!name.trim() || name.length > 80)
        throw new SessionError("Use a name of 1–80 characters.");
      const p: Participant = {
        id: randomUUID(),
        name: name.trim(),
        badge: String(count + 1).padStart(3, "0"),
        seated,
      };
      const credential = secret(),
        recovery = secret();
      this.db
        .prepare("INSERT INTO participants VALUES (?,?,?,?,?)")
        .run(
          p.id,
          sessionId,
          digest(credential),
          digest(recovery),
          JSON.stringify(p),
        );
      return { participant: p, credential, recovery };
    });
  }
  recover(session: string, recovery: string) {
    const p = decode<Participant>(
      this.db
        .prepare("SELECT body FROM participants WHERE session=? AND recovery=?")
        .get(session, digest(recovery)),
    );
    if (!p) throw new SessionError("Recovery code not recognised.", 401);
    const credential = secret();
    this.db
      .prepare("UPDATE participants SET credential=? WHERE id=?")
      .run(digest(credential), p.id);
    return { participant: p, credential };
  }
  round(id: string) {
    const r = decode<Round>(
      this.db.prepare("SELECT body FROM rounds WHERE id=?").get(id),
    );
    if (!r) throw new SessionError("Round not found.", 404);
    return r;
  }
  rounds(session: string) {
    return this.db
      .prepare("SELECT body FROM rounds WHERE session=? ORDER BY rowid")
      .all(session)
      .map((r) => decode<Round>(r) as Round);
  }
  createRound(session: string, prompt: string, mode: Round["mode"]) {
    if (!this.session(session).open)
      throw new SessionError("Session closed.", 409);
    if (!prompt.trim() || prompt.length > 2000)
      throw new SessionError("Use a prompt of 1–2000 characters.");
    if (this.rounds(session).some((r) => r.open))
      throw new SessionError(
        "Close the current round before opening another.",
        409,
      );
    const r: Round = {
      id: randomUUID(),
      sessionId: session,
      prompt,
      mode,
      open: true,
      createdAt: now(),
    };
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO rounds VALUES (?,?,?)")
        .run(r.id, session, JSON.stringify(r));
      if (mode === "bounded")
        this.selectPresentation(session, { kind: "writing", roundId: r.id });
    });
    return r;
  }
  current(participant: string, round: string) {
    return decode<Snapshot["contributions"][number]>(
      this.db
        .prepare(
          "SELECT body FROM revisions WHERE participant=? AND round=? ORDER BY revision DESC LIMIT 1",
        )
        .get(participant, round),
    );
  }
  revise(session: string, participant: string, input: RevisionInput) {
    const data = revisionSchema.parse(input);
    return this.transaction(() => {
      const r = this.round(data.roundId);
      if (
        r.sessionId !== session ||
        !this.participants(session).some((p) => p.id === participant)
      )
        throw new SessionError("Wrong session.", 403);
      const previous = this.db
        .prepare(
          "SELECT body,fingerprint FROM revisions WHERE participant=? AND request=?",
        )
        .get(participant, data.requestId) as
        | { body: string; fingerprint: string }
        | undefined;
      const fingerprint = digest(JSON.stringify(data));
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new SessionError(
            "Request ID reused with different input.",
            409,
          );
        return JSON.parse(previous.body) as Snapshot["contributions"][number];
      }
      if (!r.open || !this.session(session).open)
        throw new SessionError(
          "Collection has closed. Saved input is retained.",
          409,
        );
      const head = this.current(participant, r.id);
      if ((head?.revision ?? 0) !== data.expectedRevision)
        throw new SessionError(
          "This contribution changed in another window. Reload before editing.",
          409,
        );
      if (data.confirmed && !data.text.trim())
        throw new SessionError("Write something before confirming.");
      if (data.matching && !data.confirmed)
        throw new SessionError("Confirm text before opting into matching.");
      const recording = data.recordingId
        ? this.recording(participant, data.recordingId)
        : undefined;
      if (
        data.source === "transcript" &&
        (!recording ||
          recording.round !== r.id ||
          recording.state !== "succeeded")
      )
        throw new SessionError("Recording not found.");
      const revision = data.expectedRevision + 1;
      const value = {
        id: `${participant}:${r.id}:${revision}`,
        participantId: participant,
        roundId: r.id,
        prompt: r.prompt,
        revision,
        text: data.text,
        confirmed: data.confirmed,
        matching: data.matching,
        source: data.source,
        ...(data.recordingId ? { recordingId: data.recordingId } : {}),
        savedAt: now(),
      };
      this.db
        .prepare("INSERT INTO revisions VALUES (?,?,?,?,?,?)")
        .run(
          participant,
          r.id,
          revision,
          data.requestId,
          fingerprint,
          JSON.stringify(value),
        );
      return value;
    });
  }
  freeze(roundId: string) {
    return this.transaction(() => this.freezeRound(roundId));
  }
  private freezeRound(roundId: string) {
    const existing = decode<Snapshot>(
      this.db.prepare("SELECT body FROM snapshots WHERE round=?").get(roundId),
    );
    if (existing) return existing;
    const r = this.round(roundId);
    const contributions = this.participants(r.sessionId).flatMap((p) => {
      const c = this.current(p.id, r.id);
      return c?.confirmed && c.text.trim() ? [c] : [];
    });
    const snapshot = snapshotSchema.parse({
      schemaVersion: 1,
      id: randomUUID(),
      sessionId: r.sessionId,
      roundId,
      createdAt: now(),
      contributions,
      eligible: contributions
        .filter((c) => c.matching)
        .map((c) => c.participantId),
    });
    this.db
      .prepare("INSERT INTO snapshots VALUES (?,?,?,?)")
      .run(
        snapshot.id,
        roundId,
        digest(JSON.stringify(snapshot)),
        JSON.stringify(snapshot),
      );
    this.db
      .prepare("UPDATE rounds SET body=? WHERE id=?")
      .run(JSON.stringify({ ...r, open: false }), roundId);
    return snapshot;
  }
  analyse(roundId: string, config: OperationConfig) {
    return this.transaction(() => {
      const round = this.round(roundId);
      if (round.mode !== "bounded")
        throw new SessionError("Choose a bounded writing round.");
      // An uncertain response or a repeated click must not buy another analysis.
      if (round.analysisId) return this.operation(round.analysisId);
      const parsed = operationConfigSchema.parse({
        ...config,
        promptVersion: "analysis-v2",
        autoPublish: true,
      });
      // freezeRound and enqueue are synchronous inside this transaction: validation
      // failure rolls back closure as well as the snapshot.
      const snapshot = this.freezeRound(roundId);
      const op = this.enqueue(snapshot.id, "analysis", parsed);
      this.db.prepare("UPDATE rounds SET body=? WHERE id=?").run(
        JSON.stringify({
          ...this.round(roundId),
          analysisId: op.id,
          analysisSkipped: false,
        }),
        roundId,
      );
      this.selectPresentation(round.sessionId, {
        kind: "analysis",
        operationId: op.id,
      });
      return op;
    });
  }
  show(sessionId: string) {
    const round = this.rounds(sessionId).at(-1);
    const op = round?.analysisId ? this.operation(round.analysisId) : undefined;
    return {
      roundId: round?.id,
      analysisId: op?.id,
      analysisState: op?.state,
      personalReleased: !!op?.personalReleased,
      analysisSkipped: !!round?.analysisSkipped,
      presentation: this.session(sessionId).presentation?.kind ?? null,
    };
  }
  selectPresentation(
    sessionId: string,
    presentation: NonNullable<Session["presentation"]>,
  ) {
    if (presentation.kind === "analysis") {
      const op = this.operation(presentation.operationId);
      if (
        op.kind !== "analysis" ||
        op.config.promptVersion !== "analysis-v2" ||
        this.snapshot(op.snapshotId).snapshot.sessionId !== sessionId
      )
        throw new SessionError("Choose an analysis from this session.");
    }
    this.db
      .prepare("UPDATE sessions SET body=? WHERE id=?")
      .run(
        JSON.stringify({ ...this.session(sessionId), presentation }),
        sessionId,
      );
  }
  projection(sessionId: string) {
    const selected = this.session(sessionId).presentation;
    if (!selected || selected.kind === "voice") return selected ?? null;
    if (selected.kind === "writing") {
      const round = this.round(selected.roundId);
      return {
        kind: "writing" as const,
        question: round.prompt,
        count: this.participants(sessionId).filter((p) =>
          this.current(p.id, round.id)?.text.trim(),
        ).length,
      };
    }
    const op = this.operation(selected.operationId);
    const { snapshot } = this.snapshot(op.snapshotId);
    return {
      kind: "analysis" as const,
      state: op.state,
      count: snapshot.contributions.length,
      result:
        op.published && op.state === "succeeded"
          ? publicAnalysis(analysisV2Schema.parse(op.result))
          : undefined,
    };
  }
  releasePersonal(id: string) {
    const op = this.operation(id);
    if (
      op.kind !== "analysis" ||
      op.config.promptVersion !== "analysis-v2" ||
      op.state !== "succeeded" ||
      !op.published
    )
      throw new SessionError(
        "Complete the collective analysis before releasing personal perspectives.",
        409,
      );
    this.saveOperation({ ...op, personalReleased: true });
    return this.operation(id);
  }
  perspective(sessionId: string, participantId: string) {
    const round = this.rounds(sessionId).at(-1);
    if (!round?.analysisId) return undefined;
    const op = this.operation(round.analysisId);
    if (!op.personalReleased || !op.published || op.state !== "succeeded")
      return undefined;
    const contribution = this.snapshot(
      op.snapshotId,
    ).snapshot.contributions.find((c) => c.participantId === participantId);
    if (!contribution) return { analysis: null, contribution: null };
    return {
      analysis: personalAnalysis(
        analysisV2Schema.parse(op.result),
        contribution,
      ),
      contribution,
    };
  }
  skipAnalysis(roundId: string) {
    const round = this.round(roundId);
    if (
      !round.analysisId ||
      !["failed", "cancelled", "interrupted"].includes(
        this.operation(round.analysisId).state,
      )
    )
      throw new SessionError(
        "Only an unsuccessful analysis can be skipped.",
        409,
      );
    this.db
      .prepare("UPDATE rounds SET body=? WHERE id=?")
      .run(JSON.stringify({ ...round, analysisSkipped: true }), roundId);
    return this.show(round.sessionId);
  }
  completeOperation(id: string, result: unknown) {
    const op = this.operation(id);
    this.saveOperation({
      ...op,
      state: "succeeded",
      endedAt: now(),
      result,
      published:
        op.published ||
        (op.kind === "analysis" &&
          op.config.promptVersion === "analysis-v2" &&
          op.config.autoPublish === true),
    });
  }
  snapshot(id: string) {
    const row = this.db
      .prepare("SELECT body,hash FROM snapshots WHERE id=?")
      .get(id) as { body: string; hash: string } | undefined;
    if (!row) throw new SessionError("Snapshot not found.", 404);
    const snapshot = snapshotSchema.parse(JSON.parse(row.body));
    if (digest(row.body) !== row.hash)
      throw new Error("Snapshot integrity failure.");
    return { snapshot, hash: row.hash };
  }
  snapshots(session: string) {
    return this.db
      .prepare(
        "SELECT s.body FROM snapshots s JOIN rounds r ON r.id=s.round WHERE r.session=? ORDER BY s.rowid",
      )
      .all(session)
      .map((r) => decode<Snapshot>(r) as Snapshot);
  }
  enqueue(snapshotId: string, kind: OperationKind, config: OperationConfig) {
    const { snapshot, hash } = this.snapshot(snapshotId);
    const parsed = operationConfigSchema.parse(config);
    if (
      parsed.autoPublish &&
      (kind !== "analysis" || parsed.promptVersion !== "analysis-v2")
    )
      throw new SessionError(
        "Automatic publication is only available for bounded analysis.",
      );
    if (kind === "matching") {
      if (!parsed.mode || !parsed.oddPolicy || parsed.maxCalls === undefined)
        throw new SessionError(
          "Choose the matching objective, odd-roster policy and call budget.",
        );
      const round = this.round(snapshot.roundId);
      if (
        round.analysisId &&
        !round.analysisSkipped &&
        this.operation(round.analysisId).state !== "succeeded"
      )
        throw new SessionError(
          "Complete analysis or explicitly continue without it before matching.",
          409,
        );
      const roster = snapshot.eligible.length;
      if (roster < 2 || (roster % 2 && parsed.oddPolicy === "reject"))
        throw new SessionError("Review the roster and odd-count policy.");
      const minimumCalls =
        parsed.mode === "collaboration" ? (roster * (roster - 1)) / 2 : 1;
      if (parsed.maxCalls < minimumCalls)
        throw new SessionError(
          `The chosen objective needs at least ${minimumCalls} provider calls.`,
        );
    }
    if (kind === "matching" && parsed.avoidPrevious) {
      const pairs = new Map<string, [string, string]>();
      for (const row of this.db
        .prepare("SELECT body FROM encounters WHERE session=?")
        .all(snapshot.sessionId)) {
        const release = JSON.parse(row.body as string) as {
          groups: { participantIds: string[] }[];
        };
        for (const group of release.groups)
          for (const a of group.participantIds)
            for (const b of group.participantIds)
              if (
                a < b &&
                snapshot.eligible.includes(a) &&
                snapshot.eligible.includes(b)
              )
                pairs.set(`${a}:${b}`, [a, b]);
      }
      parsed.forbiddenPairs = [...pairs.values()];
    }
    if (!snapshot.contributions.length)
      throw new SessionError("Snapshot has no confirmed contributions.");
    if (
      (parsed.promptVersion === "analysis-v2"
        ? analysisV2Messages(snapshot).reduce(
            (size, message) => size + message.content.length,
            0,
          )
        : snapshot.contributions.reduce((n, c) => n + c.text.length, 0)) >
      parsed.maxInputCharacters
    )
      throw new SessionError("Snapshot exceeds the configured input budget.");
    // Preserve pre-v2 deduplication keys: an absent autoPublish flag meant false.
    const { autoPublish, ...manualConfig } = parsed;
    const keyConfig = autoPublish ? parsed : manualConfig;
    const key = digest(JSON.stringify({ hash, kind, config: keyConfig }));
    const existing = decode<Operation>(
      this.db.prepare("SELECT body FROM operations WHERE dedupe=?").get(key),
    );
    if (existing) return existing;
    const op: Operation = {
      id: randomUUID(),
      snapshotId,
      snapshotHash: hash,
      kind,
      config: parsed,
      state: "queued",
      createdAt: now(),
      published: false,
    };
    this.db
      .prepare("INSERT INTO operations VALUES (?,?,?,?)")
      .run(op.id, snapshotId, key, JSON.stringify(op));
    return op;
  }
  operation(id: string) {
    const op = decode<Operation>(
      this.db.prepare("SELECT body FROM operations WHERE id=?").get(id),
    );
    if (!op) throw new SessionError("Operation not found.", 404);
    return op;
  }
  operations(session: string) {
    return this.db
      .prepare(
        "SELECT o.body FROM operations o JOIN snapshots s ON s.id=o.snapshot JOIN rounds r ON r.id=s.round WHERE r.session=? ORDER BY o.rowid",
      )
      .all(session)
      .map((r) => decode<Operation>(r) as Operation);
  }
  saveOperation(op: Operation) {
    this.db
      .prepare("UPDATE operations SET body=? WHERE id=?")
      .run(JSON.stringify(op), op.id);
  }
  retry(id: string) {
    const op = this.operation(id);
    if (
      !["failed", "interrupted", "cancelled"].includes(op.state) ||
      op.published
    )
      throw new SessionError("This operation cannot be retried.", 409);
    const next = {
      ...op,
      state: "queued" as const,
      error: undefined,
      endedAt: undefined,
      progress: undefined,
    };
    this.saveOperation(next);
    return next;
  }
  publish(id: string) {
    const op = this.operation(id);
    if (op.kind === "matching")
      throw new SessionError("Review and release encounters separately.");
    if (op.state !== "succeeded")
      throw new SessionError("Only successful results can be revealed.", 409);
    this.saveOperation({ ...op, published: true });
  }
  release(id: string, locations: string[], reviewed: boolean) {
    return this.transaction(() => {
      const op = this.operation(id);
      const previous = this.db
        .prepare("SELECT body FROM encounters WHERE operation=?")
        .get(id);
      if (previous) return JSON.parse((previous as Row).body);
      if (op.kind !== "matching" || op.state !== "succeeded" || !reviewed)
        throw new SessionError(
          "Review a completed allocation before releasing it.",
        );
      const { snapshot } = this.snapshot(op.snapshotId);
      const groups = (
        op.result as { groups: { id: string; participantIds: string[] }[] }
      ).groups;
      if (
        locations.length !== groups.length ||
        locations.some((l) => !l.trim() || l.length > 160)
      )
        throw new SessionError(
          "Assign one clear meeting location per group, including seated arrangements.",
        );
      const result = {
        operationId: id,
        releasedAt: now(),
        groups: groups.map((g, i) => ({
          ...g,
          location: locations[i],
          invitation: `Compare these starting points: ${g.participantIds
            .map((person) => {
              const contribution = snapshot.contributions.find(
                (c) => c.participantId === person,
              );
              const excerpt = contribution?.text.slice(0, 140) ?? "";
              return `“${excerpt}${(contribution?.text.length ?? 0) > 140 ? "…" : ""}”`;
            })
            .join(
              " / ",
            )}. What would you like to understand or develop together?`,
        })),
      };
      this.db
        .prepare("INSERT INTO encounters VALUES (?,?,?)")
        .run(id, snapshot.sessionId, JSON.stringify(result));
      this.saveOperation({ ...op, published: true });
      return result;
    });
  }
  releasedEncounter(operationId: string) {
    return decode<{ groups: { id: string; location: string }[] }>(
      this.db
        .prepare("SELECT body FROM encounters WHERE operation=?")
        .get(operationId),
    );
  }
  encounters(session: string, participant: string) {
    return this.db
      .prepare(
        "SELECT body FROM encounters WHERE session=? ORDER BY rowid DESC",
      )
      .all(session)
      .flatMap((row) => {
        const result = JSON.parse((row as Row).body) as {
          operationId: string;
          releasedAt: string;
          groups: {
            id: string;
            participantIds: string[];
            location: string;
            invitation: string;
          }[];
        };
        return result.groups
          .filter((g) => g.participantIds.includes(participant))
          .map((g) => ({
            operationId: result.operationId,
            roundId: this.snapshot(
              this.operation(result.operationId).snapshotId,
            ).snapshot.roundId,
            releasedAt: result.releasedAt,
            groupId: g.id,
            location: g.location,
            invitation: g.invitation,
            partners: g.participantIds
              .filter((id) => id !== participant)
              .map((id) => {
                const { name, badge } = this.participant(id);
                return { name, badge };
              }),
          }));
      });
  }
  requestHelp(participant: string, reason: string) {
    if (!["absent", "decline", "seated", "late"].includes(reason))
      throw new SessionError("Choose a supported request.");
    const item = {
      id: randomUUID(),
      reason,
      createdAt: now(),
      resolved: false,
    };
    this.db
      .prepare("INSERT INTO help VALUES (?,?,?)")
      .run(item.id, participant, JSON.stringify(item));
    return item;
  }
  help(session: string) {
    return this.db
      .prepare(
        "SELECT h.body,p.body AS participant FROM help h JOIN participants p ON p.id=h.participant WHERE p.session=?",
      )
      .all(session)
      .map((r) => ({
        ...JSON.parse(r.body as string),
        participant: JSON.parse(r.participant as string),
      }));
  }
  resolveHelp(id: string) {
    const row = this.db.prepare("SELECT body FROM help WHERE id=?").get(id);
    if (!row) throw new SessionError("Request not found.", 404);
    this.db
      .prepare("UPDATE help SET body=? WHERE id=?")
      .run(
        JSON.stringify({ ...JSON.parse((row as Row).body), resolved: true }),
        id,
      );
  }
  recording(
    participant: string,
    id: string,
  ): Record<string, unknown> | undefined {
    return decode(
      this.db
        .prepare("SELECT body FROM recordings WHERE id=? AND participant=?")
        .get(id, participant),
    );
  }
  saveRecording(
    id: string,
    participant: string,
    round: string,
    body: Record<string, unknown>,
  ) {
    const existing = this.db
      .prepare("SELECT participant,round,body FROM recordings WHERE id=?")
      .get(id);
    if (
      existing &&
      (existing.participant !== participant ||
        existing.round !== round ||
        JSON.parse(existing.body as string).hash !== body.hash ||
        JSON.parse(existing.body as string).mime !== body.mime)
    )
      throw new SessionError("Upload ID conflict.", 409);
    this.db
      .prepare(
        "INSERT INTO recordings VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      )
      .run(id, participant, round, JSON.stringify(body));
  }
  close() {
    this.db.close();
  }
}
