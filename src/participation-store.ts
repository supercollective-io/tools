import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class ParticipationStore {
  readonly db: DatabaseSync;
  readonly joinToken: string;
  constructor(path: string, runId: string) {
    this.db = new DatabaseSync(path);
    const version = this.db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    if (
      version.user_version !== 0 &&
      version.user_version !== 1 &&
      version.user_version !== 2
    ) {
      this.db.close();
      throw new Error("Unsupported participation database version.");
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS participants (position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, credential TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS submissions (position INTEGER PRIMARY KEY AUTOINCREMENT, participant TEXT NOT NULL REFERENCES participants(id), id TEXT NOT NULL, text TEXT NOT NULL, context_offset INTEGER NOT NULL, saved_at TEXT NOT NULL, UNIQUE(participant,id));
      CREATE TABLE IF NOT EXISTS chunks (position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, participant TEXT NOT NULL REFERENCES participants(id), submission TEXT NOT NULL, text TEXT NOT NULL, admitted INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS revisions (participant TEXT NOT NULL REFERENCES participants(id), revision INTEGER NOT NULL, text TEXT NOT NULL, saved_at TEXT NOT NULL, PRIMARY KEY(participant,revision));
      CREATE TABLE IF NOT EXISTS revision_heads (participant TEXT PRIMARY KEY REFERENCES participants(id), revision INTEGER NOT NULL, admitted INTEGER NOT NULL DEFAULT 0);
      PRAGMA user_version=2;`);
    const stored = this.meta("run");
    if (stored && stored !== runId) {
      this.db.close();
      throw new Error("Participation database belongs to a different run.");
    }
    if (!stored) {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.setMeta("run", runId);
        this.setMeta("join", randomBytes(32).toString("hex"));
        this.setMeta("cursor", "0");
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        this.db.close();
        throw error;
      }
    }
    this.joinToken = this.meta("join") ?? "";
    if (!/^[a-f0-9]{64}$/.test(this.joinToken)) {
      this.db.close();
      throw new Error("Invalid session join credential.");
    }
  }
  private meta(key: string) {
    return (
      this.db.prepare("SELECT value FROM metadata WHERE key=?").get(key) as
        | { value: string }
        | undefined
    )?.value;
  }
  private setMeta(key: string, value: string) {
    this.db
      .prepare("INSERT OR REPLACE INTO metadata VALUES (?,?)")
      .run(key, value);
  }
  participants() {
    return this.db
      .prepare("SELECT id,position FROM participants ORDER BY position")
      .all() as { id: string; position: number }[];
  }
  identify(credential: string) {
    return (
      this.db
        .prepare("SELECT id FROM participants WHERE credential=?")
        .get(digest(credential)) as { id: string } | undefined
    )?.id;
  }
  join() {
    if (this.participants().length >= 100)
      throw new Error("This session is full.");
    const id = randomUUID(),
      credential = randomBytes(32).toString("hex");
    this.db
      .prepare("INSERT INTO participants (id,credential) VALUES (?,?)")
      .run(id, digest(credential));
    return { id, credential };
  }
  submit(
    participant: string,
    id: string,
    text: string,
    contextOffset: number,
    acceptNew = true,
  ) {
    const existing = this.db
      .prepare(
        "SELECT text,context_offset,saved_at FROM submissions WHERE participant=? AND id=?",
      )
      .get(participant, id) as
      | { text: string; context_offset: number; saved_at: string }
      | undefined;
    if (existing) {
      if (existing.text !== text || existing.context_offset !== contextOffset)
        throw new Error("Submission ID already has different content.");
      return { id, savedAt: existing.saved_at, duplicate: true };
    }
    if (!acceptNew) throw new Error("This session has ended.");
    const total = this.db
      .prepare(
        "SELECT COALESCE(SUM(length(text)),0) AS size FROM submissions WHERE participant=?",
      )
      .get(participant) as { size: number };
    if (total.size + text.length > 50000)
      throw new Error("This participant has reached the session text limit.");
    const savedAt = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT INTO submissions (participant,id,text,context_offset,saved_at) VALUES (?,?,?,?,?)",
        )
        .run(participant, id, text, contextOffset, savedAt);
      const chars = Array.from(text);
      for (let offset = 0; offset < chars.length; offset += 500)
        this.db
          .prepare(
            "INSERT INTO chunks (id,participant,submission,text) VALUES (?,?,?,?)",
          )
          .run(
            `${participant}:${id}:${offset}`,
            participant,
            id,
            (offset === 0 ? "\n" : "") +
              chars.slice(offset, offset + 500).join(""),
          );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { id, savedAt, duplicate: false };
  }
  current(participant: string) {
    return (
      (this.db
        .prepare(
          "SELECT revision,text FROM revisions WHERE participant=? ORDER BY revision DESC LIMIT 1",
        )
        .get(participant) as
        | { revision: number; text: string }
        | undefined) ?? { revision: 0, text: "" }
    );
  }
  revise(
    participant: string,
    revision: number,
    text: string,
    acceptNew = true,
  ) {
    const existing = this.db
      .prepare(
        "SELECT text,saved_at FROM revisions WHERE participant=? AND revision=?",
      )
      .get(participant, revision) as
      | { text: string; saved_at: string }
      | undefined;
    if (existing) {
      if (existing.text !== text) throw new Error("Revision conflict.");
      return { revision, savedAt: existing.saved_at, duplicate: true };
    }
    if (!acceptNew) throw new Error("This session has ended.");
    if (revision !== this.current(participant).revision + 1)
      throw new Error("Revision conflict.");
    const savedAt = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT INTO revisions VALUES (?,?,?,?)")
        .run(participant, revision, text, savedAt);
      this.db
        .prepare(
          "INSERT INTO revision_heads (participant,revision) VALUES (?,?) ON CONFLICT(participant) DO UPDATE SET revision=excluded.revision",
        )
        .run(participant, revision);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { revision, savedAt, duplicate: false };
  }
  /** At most four people and 2,004 characters per tick, preserving each person's order. */
  batch() {
    const cursor = Number(this.meta("cursor") ?? 0);
    const people = this.participants();
    const ordered = [
      ...people.filter((p) => p.position > cursor),
      ...people.filter((p) => p.position <= cursor),
    ];
    const result: {
      id: string;
      participant: string;
      text: string;
      position: number;
      revision?: number;
    }[] = [];
    for (const p of ordered) {
      const head = this.db
        .prepare(
          "SELECT r.revision,r.text FROM revision_heads h JOIN revisions r ON r.participant=h.participant AND r.revision=h.revision WHERE h.participant=? AND h.revision>h.admitted",
        )
        .get(p.id) as { revision: number; text: string } | undefined;
      const chunk = this.db
        .prepare(
          "SELECT id,participant,text FROM chunks WHERE participant=? AND admitted=0 ORDER BY position LIMIT 1",
        )
        .get(p.id) as
        | { id: string; participant: string; text: string }
        | undefined;
      if (chunk) result.push({ ...chunk, position: p.position });
      else if (head)
        result.push({
          id: `${p.id}:revision:${head.revision}`,
          participant: p.id,
          text: head.text,
          revision: head.revision,
          position: p.position,
        });
      if (result.length === 4) break;
    }
    return result;
  }
  admitted(
    id: string,
    position: number,
    revision?: number,
    participant?: string,
  ) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (revision !== undefined)
        this.db
          .prepare(
            "UPDATE revision_heads SET admitted=MAX(admitted,?) WHERE participant=?",
          )
          .run(revision, participant ?? "");
      else this.db.prepare("UPDATE chunks SET admitted=1 WHERE id=?").run(id);
      this.setMeta("cursor", String(position));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
