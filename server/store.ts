import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { Option, Recording } from '../src/lib/core/engine.ts';
export type StoredRoom = { id: string; question: string; options: Option[]; createdAt: string };
export type Participant = {
  id: string;
  roomId: string;
  name: string;
  tokenHash: string;
  host: boolean;
};
export class Store {
  db: Database.Database;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, question TEXT NOT NULL, options TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, host INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS rounds (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), status TEXT NOT NULL, started_at TEXT NOT NULL, selected_label TEXT, recording TEXT);
      PRAGMA user_version = 1;`);
    this.db.prepare("UPDATE rounds SET status = 'interrupted' WHERE status = 'active'").run();
  }
  create(room: StoredRoom, participant: Participant) {
    this.db.transaction(() => {
      this.db
        .prepare('INSERT INTO rooms VALUES (?, ?, ?, ?)')
        .run(room.id, room.question, JSON.stringify(room.options), room.createdAt);
      this.addParticipant(participant);
    })();
  }
  room(id: string): StoredRoom | undefined {
    const row = this.db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as
      | { id: string; question: string; options: string; created_at: string }
      | undefined;
    return (
      row && {
        id: row.id,
        question: row.question,
        options: JSON.parse(row.options),
        createdAt: row.created_at,
      }
    );
  }
  addParticipant(p: Participant) {
    this.db
      .prepare('INSERT INTO participants VALUES (?, ?, ?, ?, ?)')
      .run(p.id, p.roomId, p.name, p.tokenHash, Number(p.host));
  }
  participants(roomId: string): Participant[] {
    return (
      this.db.prepare('SELECT * FROM participants WHERE room_id = ? ORDER BY id').all(roomId) as {
        id: string;
        room_id: string;
        name: string;
        token_hash: string;
        host: number;
      }[]
    ).map((r) => ({
      id: r.id,
      roomId: r.room_id,
      name: r.name,
      tokenHash: r.token_hash,
      host: Boolean(r.host),
    }));
  }
  start(id: string, roomId: string, at: string) {
    this.db
      .prepare("INSERT INTO rounds (id, room_id, status, started_at) VALUES (?, ?, 'active', ?)")
      .run(id, roomId, at);
  }
  finish(recording: Recording) {
    const label =
      recording.options.find((o) => o.id === recording.result.selectedId)?.label ?? null;
    this.db
      .prepare('UPDATE rounds SET status = ?, selected_label = ?, recording = ? WHERE id = ?')
      .run(recording.result.phase, label, JSON.stringify(recording), recording.id);
  }
  history(roomId: string) {
    return this.db
      .prepare(
        'SELECT id, status, started_at AS startedAt, selected_label AS selectedLabel FROM rounds WHERE room_id = ? ORDER BY started_at DESC LIMIT 20',
      )
      .all(roomId) as {
      id: string;
      status: string;
      startedAt: string;
      selectedLabel: string | null;
    }[];
  }
  roundRoom(id: string) {
    return (
      this.db.prepare('SELECT room_id FROM rounds WHERE id = ?').get(id) as
        | { room_id: string }
        | undefined
    )?.room_id;
  }
  recording(id: string): Recording | undefined {
    const row = this.db.prepare('SELECT recording FROM rounds WHERE id = ?').get(id) as
      | { recording: string | null }
      | undefined;
    return row?.recording ? JSON.parse(row.recording) : undefined;
  }
  close() {
    this.db.close();
  }
}
