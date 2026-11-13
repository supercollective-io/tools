import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { LiveController } from "../live.ts";
import { LiveLog, readLiveRun } from "../live-runs.ts";
import { type LiveConfig, liveConfigSchema } from "../live-schema.ts";
import { type Generate, generate } from "../models.ts";
import { SessionError } from "./contracts.ts";
import type { SessionStore } from "./store.ts";

export class SessionVoice {
  private active?: {
    id: string;
    round: string;
    session: string;
    log: LiveLog;
    controller: LiveController;
  };
  private tick: ReturnType<typeof setInterval>;
  private admission: Promise<void> = Promise.resolve();
  private busy = false;
  private controls: Promise<unknown> = Promise.resolve();
  private saved = new Map<
    string,
    { id: string; roundId: string; status: string; text: string }
  >();
  private async finishRun(id: string) {
    const log = await LiveLog.resume(join(this.directory, `voice-${id}.jsonl`));
    const controller = new LiveController(log, this.model);
    try {
      await controller.end();
      return log.state;
    } finally {
      await controller.close();
      await log.close();
    }
  }
  async endSession(session: string) {
    const result = this.store.closeSession(session);
    for (const round of this.store.rounds(session))
      if (round.mode === "continuous")
        await this.control("end", session, round.id);
    return result;
  }
  async load() {
    for (const session of this.store.sessions())
      if (!session.open)
        for (const round of this.store.rounds(session.id))
          if (round.mode === "continuous" && round.open)
            this.store.freeze(round.id);
    for (const row of this.store.db
      .prepare("SELECT id,session,round FROM voice_runs ORDER BY rowid")
      .all()) {
      let { state } = await readLiveRun(
        join(this.directory, `voice-${row.id}.jsonl`),
      );
      // Closing the round is the durable intent. Complete an interrupted end
      // before accepting requests, without dispatching another model request.
      if (
        !this.store.round(row.round as string).open &&
        state.status !== "ended"
      ) {
        state = await this.finishRun(row.id as string);
      }
      this.saved.set(row.session as string, {
        id: row.id as string,
        roundId: row.round as string,
        status: state.status === "running" ? "paused" : state.status,
        text: state.composer.text.slice(0, state.publishedOffset),
      });
    }
  }
  private store: SessionStore;
  private directory: string;
  private model: Generate;
  constructor(
    store: SessionStore,
    directory: string,
    model: Generate = generate,
  ) {
    this.store = store;
    this.directory = directory;
    this.model = model;
    this.tick = setInterval(() => {
      if (
        this.busy ||
        !this.active ||
        this.active.log.state.status !== "running" ||
        !this.store.round(this.active.round).open ||
        !this.store.session(this.active.session).open
      )
        return;
      this.busy = true;
      this.admission = this.admit()
        .catch(async () => {
          await this.active?.controller.pause(
            "Admission failed. Saved revisions remain available.",
          );
        })
        .finally(() => {
          this.busy = false;
        });
    }, 250);
  }
  private async admit() {
    const active = this.active;
    if (!active) return;
    for (const p of this.store.participants(active.session))
      await active.controller.joinParticipant(p.id);
    const revisions = this.store.participants(active.session).flatMap((p) => {
      const c = this.store.current(p.id, active.round);
      return c
        ? [{ id: c.id, participantId: p.id, text: c.text, replace: true }]
        : [];
    });
    await active.controller.admitInputs(revisions);
  }
  control(
    action: "start" | "pause" | "end",
    session: string,
    round: string,
    config?: LiveConfig,
  ) {
    const task = this.controls.then(async () => {
      const r = this.store.round(round);
      if (r.sessionId !== session || r.mode !== "continuous")
        throw new SessionError("Select a continuous round.");
      if (action === "end") {
        // The closed round is durable intent, even if stopping the journal is interrupted.
        this.store.freeze(round);
        if (this.active?.round === round && this.active.session === session) {
          await this.admission;
          await this.active.controller.end();
          return this.state(session);
        }
        const prior = this.store.db
          .prepare(
            "SELECT id FROM voice_runs WHERE session=? AND round=? ORDER BY rowid DESC LIMIT 1",
          )
          .get(session, round);
        if (!prior) return { roundId: round, status: "ended", text: "" };
        let { state } = await readLiveRun(
          join(this.directory, `voice-${prior.id}.jsonl`),
        );
        if (state.status !== "ended")
          state = await this.finishRun(prior.id as string);
        const result = {
          id: prior.id as string,
          roundId: round,
          status: state.status,
          text: state.composer.text.slice(0, state.publishedOffset),
        };
        const latest = this.store.db
          .prepare(
            "SELECT id FROM voice_runs WHERE session=? ORDER BY rowid DESC LIMIT 1",
          )
          .get(session);
        if (latest?.id === prior.id) this.saved.set(session, result);
        return result;
      }
      if (action === "start" && (!r.open || !this.store.session(session).open))
        throw new SessionError("Collection closed.", 409);
      if (
        this.active &&
        (this.active.session !== session || this.active.round !== round)
      ) {
        if (this.active.log.state.status === "running")
          throw new SessionError("Pause or end the active voice first.", 409);
        await this.admission;
        await this.active.controller.close();
        await this.active.log.close();
        const previous = this.state(this.active.session);
        if (previous) this.saved.set(this.active.session, previous);
        this.active = undefined;
      }
      if (!this.active) {
        const prior = this.store.db
          .prepare(
            "SELECT id FROM voice_runs WHERE session=? AND round=? ORDER BY rowid DESC LIMIT 1",
          )
          .get(session, round) as { id: string } | undefined;
        let log: LiveLog;
        const id = prior?.id ?? randomUUID();
        if (prior)
          log = await LiveLog.resume(join(this.directory, `voice-${id}.jsonl`));
        else {
          if (action !== "start" || !config)
            throw new SessionError(
              "Choose explicit voice configuration before starting.",
            );
          const parsed = liveConfigSchema.parse({
            ...config,
            live: {
              ...config.live,
              maxParticipants: this.store.session(session).capacity,
              sourcePresentation: config.live.sourcePresentation ?? "complete",
              mode: "typed",
              score: undefined,
            },
          });
          log = await LiveLog.create(
            join(this.directory, `voice-${id}.jsonl`),
            {
              type: "live.created",
              config: parsed,
              scenario: {
                schemaVersion: 1,
                title: this.store.session(session).title,
                openingInvitation: r.prompt,
                voices: [],
              },
            },
          );
          this.store.db
            .prepare("INSERT INTO voice_runs VALUES (?,?,?)")
            .run(id, session, round);
        }
        if (log.state.status === "ended" && action === "start") {
          await log.close();
          throw new SessionError(
            "This voice ended. Open another round for a new run.",
            409,
          );
        }
        this.active = {
          id,
          round,
          session,
          log,
          controller: new LiveController(log, this.model),
        };
      }
      if (action === "start") {
        if (!r.open || !this.store.session(session).open)
          throw new SessionError("Collection closed.", 409);
        for (const p of this.store.participants(session))
          await this.active.controller.joinParticipant(p.id);
        await this.active.controller.start();
        await this.admit();
      } else await this.active.controller.pause();
      return this.state(session);
    });
    this.controls = task.catch(() => {});
    return task;
  }
  state(session: string) {
    if (!this.active || this.active.session !== session)
      return this.saved.get(session);
    const { id, round, log } = this.active;
    return {
      id,
      roundId: round,
      status: log.state.status,
      text: log.state.composer.text.slice(0, log.state.publishedOffset),
    };
  }
  async close() {
    clearInterval(this.tick);
    await this.controls;
    await this.admission;
    await this.active?.controller.close();
    await this.active?.log.close();
  }
}
