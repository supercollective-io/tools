import { randomUUID } from "node:crypto";
import {
  type FileHandle,
  mkdir,
  open,
  readFile,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import lockfile from "proper-lockfile";
import { z } from "zod";
import { parse } from "./schema.ts";

export type JournalEvent<Event> = {
  schemaVersion: 1;
  runId: string;
  sequence: number;
  at: string;
  event: Event;
};

export function journalFor<Event, State>(
  bodySchema: z.ZodType<Event>,
  rebuild: (records: JournalEvent<Event>[]) => State,
  recover: (state: State) => Event[],
  advance?: (state: State, record: JournalEvent<Event>) => State,
) {
  const eventSchema = z.strictObject({
    schemaVersion: z.literal(1),
    runId: z.uuid(),
    sequence: z.number().int().positive(),
    at: z.iso.datetime(),
    event: bodySchema,
  });

  function replay(records: JournalEvent<Event>[]): State {
    const state = rebuild(records);
    for (const [index, record] of records.entries()) {
      if (record.runId !== records[0]?.runId || record.sequence !== index + 1)
        throw new Error("Run log has inconsistent ordering or identity.");
    }
    return state;
  }

  return class Journal {
    readonly path: string;
    private handle: FileHandle;
    private release: () => Promise<void>;
    private isCompromised: () => boolean;
    private events: JournalEvent<Event>[];
    private current: State | undefined;
    private queue: Promise<void> = Promise.resolve();
    private failure: { error: unknown } | null = null;
    private closing: Promise<void> | null = null;

    private constructor(
      path: string,
      handle: FileHandle,
      release: () => Promise<void>,
      isCompromised: () => boolean,
      events: JournalEvent<Event>[],
    ) {
      this.path = path;
      this.handle = handle;
      this.release = release;
      this.isCompromised = isCompromised;
      this.events = events;
      if (advance && events.length) this.current = replay(events);
    }

    get state(): State {
      return advance && this.current !== undefined
        ? structuredClone(this.current)
        : replay(this.events);
    }

    private static async acquire(path: string) {
      let compromised = false;
      try {
        const release = await lockfile.lock(path, {
          stale: 10_000,
          update: 2_000,
          retries: 0,
          onCompromised: () => {
            compromised = true;
          },
        });
        return { release, isCompromised: () => compromised };
      } catch {
        throw new Error(
          "Run is locked by another process. After a crash, wait 10 seconds before resuming.",
        );
      }
    }

    static async read(path: string) {
      let data: Buffer;
      try {
        data = await readFile(path);
      } catch {
        throw new Error("Cannot read run log.");
      }
      const events: JournalEvent<Event>[] = [];
      let offset = 0;
      let validBytes = 0;
      let needsNewline = false;
      while (offset < data.length) {
        const newline = data.indexOf(10, offset);
        const end = newline === -1 ? data.length : newline;
        const line = data.subarray(offset, end).toString("utf8");
        let value: unknown;
        try {
          value = JSON.parse(line);
        } catch {
          if (newline === -1) break;
          throw new Error(
            `Run log contains invalid JSON on line ${events.length + 1}.`,
          );
        }
        events.push(
          parse(eventSchema, value, `Run log line ${events.length + 1}`),
        );
        validBytes = newline === -1 ? end : end + 1;
        needsNewline = newline === -1;
        offset = validBytes;
      }
      return {
        events,
        state: replay(events),
        validBytes,
        tail: data.subarray(validBytes),
        needsNewline,
      };
    }

    static async create(path: string, event: Event) {
      parse(bodySchema, event, "New run");
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      let handle: FileHandle;
      try {
        handle = await open(path, "ax", 0o600);
      } catch {
        throw new Error(
          "Cannot create run log; choose a new writable path. Existing files are never overwritten.",
        );
      }
      let log: Journal | undefined;
      try {
        const lease = await Journal.acquire(path);
        log = new Journal(path, handle, lease.release, lease.isCompromised, []);
        await log.append(event);
        return log;
      } catch (error) {
        if (log) await log.close();
        else await handle.close();
        throw error;
      }
    }

    static async resume(path: string) {
      const lease = await Journal.acquire(path);
      let handle: FileHandle | undefined;
      try {
        const read = await Journal.read(path);
        handle = await open(path, "a");
        if (read.tail.length) {
          await writeFile(`${path}.interrupted-${randomUUID()}`, read.tail, {
            flag: "wx",
            mode: 0o600,
          });
          await handle.truncate(read.validBytes);
        }
        if (read.needsNewline) await handle.write("\n");
        await handle.sync();
        const log = new Journal(
          path,
          handle,
          lease.release,
          lease.isCompromised,
          read.events,
        );
        for (const event of recover(read.state)) await log.append(event);
        return log;
      } catch (error) {
        await handle?.close();
        await lease.release();
        throw error;
      }
    }

    append(event: Event): Promise<void> {
      if (this.closing) return Promise.reject(new Error("Run log is closed."));
      const operation = this.queue.then(async () => {
        if (this.failure) throw this.failure.error;
        if (this.isCompromised()) {
          const error = new Error(
            "Run lock was lost; stop and resume this run in a single process.",
          );
          this.failure = { error };
          throw error;
        }
        const record = parse(
          eventSchema,
          {
            schemaVersion: 1,
            runId: this.events[0]?.runId ?? randomUUID(),
            sequence: this.events.length + 1,
            at: new Date().toISOString(),
            event,
          },
          "Run event",
        );
        // Validate against the state left by the preceding queued write.
        // Incremental reducers validate a private copy. Failed validation or I/O
        // cannot alter the last durable state. Offline reads still replay all records.
        const next =
          advance && this.current !== undefined
            ? advance(structuredClone(this.current), record)
            : replay([...this.events, record]);
        const line = `${JSON.stringify(record)}\n`;
        try {
          await this.handle.writeFile(line);
          await this.handle.sync();
        } catch (error) {
          // A rejected write may already have written a prefix. Only resume may
          // reconcile it; neither queued nor later appends may extend the tail.
          this.failure = { error };
          throw error;
        }
        this.events.push(record);
        if (advance) this.current = next;
      });
      // Validation errors before I/O leave the journal usable. Storage errors
      // remain sticky through failure, while every caller observes its rejection.
      this.queue = operation.catch(() => {});
      return operation;
    }

    close(): Promise<void> {
      if (!this.closing) {
        this.closing = (async () => {
          await this.queue;
          try {
            await this.handle.close();
          } finally {
            await this.release();
          }
        })();
      }
      return this.closing;
    }
  };
}
