import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { digest, SessionError } from "./contracts.ts";
import type { SessionStore } from "./store.ts";

type Recording = {
  id: string;
  participant: string;
  round: string;
  hash: string;
  mime: string;
  state:
    | "uploaded"
    | "transcribing"
    | "succeeded"
    | "failed"
    | "interrupted"
    | "expired";
  createdAt: string;
  transcript?: string;
  audioDeleted?: boolean;
  error?: string;
};
export type Transcribe = (
  bytes: Buffer,
  mime: string,
  signal: AbortSignal,
) => Promise<string>;
export function openAITranscriber(model: string): Transcribe {
  return async (bytes, mime, signal) => {
    const form = new FormData();
    form.append("model", model);
    form.append(
      "file",
      new Blob([new Uint8Array(bytes)], { type: mime }),
      `contribution.${mime === "audio/mp4" ? "m4a" : mime === "audio/wav" ? "wav" : "webm"}`,
    );
    const result = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
        },
        body: form,
      },
    );
    if (!result.ok) throw new Error("Transcription provider failed.");
    const value = (await result.json()) as { text: unknown };
    if (
      typeof value.text !== "string" ||
      !value.text.trim() ||
      value.text.length > 12000
    )
      throw new Error("No usable transcript.");
    return value.text;
  };
}
export class RecordingQueue {
  private active = new Map<
    string,
    { controller: AbortController; task: Promise<void> }
  >();
  private timer: ReturnType<typeof setInterval>;
  private stopped = false;
  private scan?: Promise<void>;
  private uploading = new Map<string, number>();
  private store: SessionStore;
  private directory: string;
  private transcribe?: Transcribe;
  constructor(store: SessionStore, directory: string, transcribe?: Transcribe) {
    this.store = store;
    this.directory = directory;
    this.transcribe = transcribe;
    for (const row of store.db.prepare("SELECT body FROM recordings").all()) {
      const r = JSON.parse(row.body as string) as Recording;
      if (["uploaded", "transcribing"].includes(r.state))
        this.save({
          ...r,
          state: "interrupted",
          error:
            "Server restarted. Retry explicitly or type your contribution.",
        });
    }
    this.timer = setInterval(() => {
      void this.pump();
    }, 1000);
  }
  private save(r: Recording) {
    this.store.saveRecording(r.id, r.participant, r.round, r);
  }
  async upload(
    session: string,
    participant: string,
    round: string,
    id: string,
    mime: string,
    bytes: Buffer,
  ) {
    if (!this.transcribe)
      throw new SessionError(
        "Recording is not configured; please type your contribution.",
        503,
      );
    const r = this.store.round(round);
    if (
      r.sessionId !== session ||
      !this.store.participants(session).some((p) => p.id === participant)
    )
      throw new SessionError("Wrong session.", 403);
    const hash = digest(bytes.toString("base64"));
    const existing = this.store.db
      .prepare("SELECT body FROM recordings WHERE id=?")
      .get(id);
    if (existing) {
      const saved = JSON.parse(existing.body as string) as Recording;
      if (
        saved.participant !== participant ||
        saved.round !== round ||
        saved.hash !== hash ||
        saved.mime !== mime
      )
        throw new SessionError("Upload ID conflict.", 409);
      return saved;
    }
    if (!r.open || !this.store.session(session).open)
      throw new SessionError("Collection closed.", 409);
    const count = this.store.db
      .prepare(
        "SELECT COUNT(*) AS n FROM recordings WHERE participant=? AND round=?",
      )
      .get(participant, round)?.n as number;
    const quotaKey = `${participant}:${round}`;
    if (count + (this.uploading.get(quotaKey) ?? 0) >= 5)
      throw new SessionError(
        "Recording limit reached for this round. Use typed input.",
        429,
      );
    if (bytes.length < 100 || bytes.length > 8 * 1024 * 1024)
      throw new SessionError(
        "Recording must be between 100 bytes and 8 MiB.",
        413,
      );
    const valid =
      mime === "audio/webm"
        ? bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
        : mime === "audio/mp4"
          ? bytes.subarray(4, 8).toString() === "ftyp"
          : mime === "audio/wav" &&
            bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WAVE";
    if (!valid)
      throw new SessionError("Unsupported or invalid recording.", 415);
    const record: Recording = {
      id,
      participant,
      round,
      hash,
      mime,
      state: "uploaded",
      createdAt: new Date().toISOString(),
    };
    this.uploading.set(quotaKey, (this.uploading.get(quotaKey) ?? 0) + 1);
    try {
      try {
        await writeFile(join(this.directory, `${id}.audio`), bytes, {
          mode: 0o600,
          flag: "wx",
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const stored = await readFile(join(this.directory, `${id}.audio`));
        if (!stored.equals(bytes))
          throw new SessionError("Upload ID conflict.", 409);
      }
      const concurrent = this.store.db
        .prepare("SELECT body FROM recordings WHERE id=?")
        .get(id);
      if (concurrent) {
        const saved = JSON.parse(concurrent.body as string) as Recording;
        if (
          saved.participant !== participant ||
          saved.round !== round ||
          saved.hash !== hash ||
          saved.mime !== mime
        )
          throw new SessionError("Upload ID conflict.", 409);
        return saved;
      }
      this.save(record);
      void this.pump();
      return record;
    } finally {
      const pending = (this.uploading.get(quotaKey) ?? 1) - 1;
      if (pending) this.uploading.set(quotaKey, pending);
      else this.uploading.delete(quotaKey);
    }
  }
  retry(participant: string, id: string) {
    const r = this.store.recording(participant, id) as Recording | undefined;
    if (!r || !["failed", "interrupted"].includes(r.state))
      throw new SessionError("Recording cannot be retried.", 409);
    this.save({ ...r, state: "uploaded", error: undefined });
    void this.pump();
  }
  private async removeAudio(record: Recording) {
    try {
      await rm(join(this.directory, `${record.id}.audio`), { force: true });
      this.save({ ...record, audioDeleted: true });
    } catch {
      this.save({ ...record, audioDeleted: false });
    }
  }
  private pump() {
    if (this.stopped || this.scan) return;
    this.scan = this.scanRecords()
      .catch(() => {
        console.error(
          "Recording queue scan failed; pending recordings remain private.",
        );
      })
      .finally(() => {
        this.scan = undefined;
      });
  }
  private async scanRecords() {
    for (const row of this.store.db
      .prepare("SELECT body FROM recordings")
      .all()) {
      if (this.stopped) return;
      const r = JSON.parse(row.body as string) as Recording;
      if (this.active.has(r.id)) continue;
      if (["succeeded", "expired"].includes(r.state)) {
        if (!r.audioDeleted) await this.removeAudio(r);
        continue;
      }
      if (
        ["uploaded", "failed", "interrupted"].includes(r.state) &&
        Date.now() - Date.parse(r.createdAt) > 86400000
      ) {
        const expired = {
          ...r,
          state: "expired" as const,
          error: "Recording expired. Please type or record again.",
        };
        this.save(expired);
        await this.removeAudio(expired);
        continue;
      }
      if (!this.transcribe || r.state !== "uploaded" || this.active.size >= 4)
        continue;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      this.save({ ...r, state: "transcribing" });
      const task = Promise.resolve()
        .then(async () => {
          try {
            const bytes = await readFile(join(this.directory, `${r.id}.audio`));
            if (digest(bytes.toString("base64")) !== r.hash)
              throw new Error("Recording integrity failure.");
            const transcript = await (this.transcribe as Transcribe)(
              bytes,
              r.mime,
              controller.signal,
            );
            if (
              controller.signal.aborted ||
              !transcript.trim() ||
              transcript.length > 12000
            )
              throw new Error("Invalid transcript.");
            const complete = { ...r, state: "succeeded" as const, transcript };
            this.save(complete);
            await this.removeAudio(complete);
          } catch {
            this.save({
              ...r,
              state: this.stopped ? "interrupted" : "failed",
              error:
                "Transcription did not complete. Retry or type; no contribution was submitted.",
            });
          } finally {
            clearTimeout(timeout);
            this.active.delete(r.id);
          }
        })
        .catch(() => {
          console.error(
            "Recording queue task failed; check storage before retrying.",
          );
        });
      this.active.set(r.id, { controller, task });
    }
  }
  async close() {
    this.stopped = true;
    clearInterval(this.timer);
    for (const a of this.active.values()) a.controller.abort();
    await this.scan;
    await Promise.all([...this.active.values()].map((a) => a.task));
  }
}
