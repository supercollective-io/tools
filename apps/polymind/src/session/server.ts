import { createHmac, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { z } from "zod";
import { liveConfigSchema } from "../live-schema.ts";
import { publicAnalysis } from "./analysis.ts";
import {
  analysisV2Schema,
  id,
  operationConfigSchema,
  revisionSchema,
  SessionError,
} from "./contracts.ts";
import { type Executor, JobRunner, modelExecutor } from "./jobs.ts";
import { RecordingQueue, type Transcribe } from "./recordings.ts";
import { SessionStore } from "./store.ts";
import { SessionVoice } from "./voice.ts";

const same = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
async function body(req: IncomingMessage, limit = 50000) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new SessionError("Request too large.", 413);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
const cookie = (req: IncomingMessage, name: string) =>
  req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? "";
export async function startSessionServer(options: {
  directory: string;
  origin: string;
  operatorToken: string;
  port?: number;
  host?: string;
  hubUrl?: string;
  executor?: Executor;
  transcribe?: Transcribe;
  transcriptionModel?: string;
}) {
  const origin = new URL(options.origin);
  if (
    origin.origin !== options.origin ||
    !["https:", "http:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    (origin.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
  )
    throw new Error("Use an HTTPS origin or loopback HTTP origin.");
  if (options.operatorToken.length < 32)
    throw new Error("OPERATOR_TOKEN must contain at least 32 characters.");
  const hubUrl = new URL(options.hubUrl ?? "https://we.supercollective.io");
  if (
    !["https:", "http:"].includes(hubUrl.protocol) ||
    hubUrl.username ||
    hubUrl.password
  )
    throw new Error("Invalid hub URL.");
  await mkdir(options.directory, { recursive: true, mode: 0o700 });
  const unlock = await lockfile.lock(options.directory, {
    retries: 0,
    stale: 30000,
  });
  let store: SessionStore;
  try {
    store = new SessionStore(join(options.directory, "sessions.sqlite"));
  } catch (error) {
    await unlock();
    throw error;
  }
  await chmod(join(options.directory, "sessions.sqlite"), 0o600);
  const runner = new JobRunner(
    store,
    options.executor ?? modelExecutor(options.directory),
  );
  const voice = new SessionVoice(store, options.directory);
  try {
    await voice.load();
  } catch (error) {
    await voice.close();
    store.close();
    await unlock();
    throw error;
  }
  const recordings = new RecordingQueue(
    store,
    options.directory,
    options.transcribe,
  );
  const operatorCookie = createHmac("sha256", options.operatorToken)
    .update("polymind-operator-v1")
    .digest("hex");
  const secure = origin.protocol === "https:" ? "; Secure" : "";
  const setCookie = (res: ServerResponse, name: string, value: string) =>
    res.setHeader(
      "Set-Cookie",
      `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`,
    );
  const json = (res: ServerResponse, value: unknown, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(value));
  };
  const assets = new Map([
    ["/", "session.html"],
    ["/operator", "session-operator.html"],
    ["/projection", "session-projection.html"],
    ["/session.js", "session.js"],
    ["/session-operator.js", "session-operator.js"],
    ["/session-projection.js", "session-projection.js"],
    ["/session.css", "session.css"],
    ["/show.css", "show.css"],
    ["/session-atlas.js", "session-atlas.js"],
    ["/session-atlas.css", "session-atlas.css"],
  ]);
  const limits = new Map<string, { count: number; expires: number }>();
  let closing = false;
  const server = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const handle = async () => {
      if (closing) throw new SessionError("Server is stopping.", 503);
      const url = new URL(req.url ?? "/", origin);
      if (url.pathname === "/healthz" && req.method === "GET") {
        store.db.prepare("SELECT 1").get();
        return json(res, { status: "ok" });
      }
      if (req.headers.host !== origin.host)
        throw new SessionError("Wrong host.", 403);
      if (req.headers.origin && req.headers.origin !== origin.origin)
        throw new SessionError("Wrong origin.", 403);
      const mutating = req.method === "POST";
      if (req.method !== "GET" && !mutating)
        throw new SessionError("Method not allowed.", 405);
      if (mutating && req.headers.origin !== origin.origin)
        throw new SessionError("Use this application's own page.", 403);
      const privileged =
        same(cookie(req, "pm_operator"), operatorCookie) ||
        same(
          req.headers.authorization ?? "",
          `Bearer ${options.operatorToken}`,
        );
      if (url.pathname.startsWith("/api/operator/") && !privileged)
        throw new SessionError("Operator sign-in required.", 401);
      if (mutating) {
        const time = Date.now();
        for (const [key, value] of limits)
          if (value.expires < time) limits.delete(key);
        const key = privileged
          ? "operator"
          : `${req.socket.remoteAddress}:${url.pathname === "/api/login" ? "login" : "participant"}`;
        const count = limits.get(key) ?? { count: 0, expires: time + 60000 };
        if (++count.count > (url.pathname === "/api/login" ? 10 : 15000))
          throw new SessionError("Too many requests; wait a minute.", 429);
        limits.set(key, count);
      }
      const asset = assets.get(url.pathname);
      if (asset && req.method === "GET") {
        const value = await readFile(
          new URL(`../web/${asset}`, import.meta.url),
        );
        res.writeHead(200, {
          "Content-Type": asset.endsWith(".js")
            ? "text/javascript; charset=utf-8"
            : asset.endsWith(".css")
              ? "text/css; charset=utf-8"
              : "text/html; charset=utf-8",
        });
        res.end(value);
        return;
      }
      const audio = /^\/api\/recordings\/([a-f0-9-]{36})$/.exec(url.pathname);
      let data: unknown = {};
      if (mutating && !audio) {
        if (req.headers["content-type"]?.split(";")[0] !== "application/json")
          throw new SessionError("Send JSON.", 415);
        try {
          data = JSON.parse((await body(req)).toString("utf8"));
        } catch (error) {
          if (error instanceof SessionError) throw error;
          throw new SessionError("Invalid JSON.");
        }
      }
      if (url.pathname === "/api/login" && mutating) {
        const { token } = z.object({ token: z.string() }).parse(data);
        if (!same(token, options.operatorToken))
          throw new SessionError("Sign-in failed.", 401);
        setCookie(res, "pm_operator", operatorCookie);
        return json(res, { ok: true });
      }
      if (url.pathname === "/api/logout" && mutating) {
        setCookie(res, "pm_operator", "");
        return json(res, { ok: true });
      }
      if (url.pathname === "/api/operator/sessions") {
        if (mutating) {
          const d = z
            .object({
              title: z.string(),
              capacity: z.number().int().default(140),
            })
            .parse(data);
          return json(res, store.createSession(d.title, d.capacity), 201);
        }
        return json(res, store.sessions());
      }
      const sessionId = id.parse(url.searchParams.get("session"));
      const session = store.session(sessionId);
      const participant = store.identify(
        sessionId,
        cookie(req, `pm_${sessionId}`),
      );
      const own = () => {
        if (!participant)
          throw new SessionError("Join or recover your place first.", 401);
        return participant;
      };
      if (url.pathname === "/api/state" && req.method === "GET") {
        const rounds = store.rounds(sessionId);
        const current = rounds.at(-1);
        return json(res, {
          session: {
            id: session.id,
            title: session.title,
            capacity: session.capacity,
            open: session.open,
            createdAt: session.createdAt,
          },
          round: current,
          show: store.show(sessionId),
          personalAnalysis: participant
            ? store.perspective(sessionId, participant.id)
            : undefined,
          hubUrl: hubUrl.href,
          participant,
          contribution:
            participant && current
              ? store.current(participant.id, current.id)
              : undefined,
          encounters: participant
            ? store.encounters(sessionId, participant.id)
            : [],
          voice: voice.state(sessionId),
          capture: {
            enabled: !!options.transcribe,
            provider: options.transcriptionModel ? "OpenAI" : undefined,
            model: options.transcriptionModel,
            maxSeconds: 60,
            retention:
              "Audio is deleted after successful transcription; failed audio expires after 24 hours. Text is kept privately for this event until the organiser deletes the session. In continuous rounds, saved text goes to the selected model while the voice is running and may inform the public voice, without confirmation. In bounded rounds, saved non-empty writing is included in analysis and matching. Closing writing freezes saved text; completed collective analysis is then shown publicly. Personal perspectives are released separately by the organiser. The organiser may separately publish the original writing in an atlas on the public projection after review. Matching shares a short excerpt with your allocated partners.",
          },
        });
      }
      if (url.pathname === "/api/projection" && req.method === "GET") {
        const operations = store
          .operations(sessionId)
          .filter(
            (op) =>
              op.published && op.kind !== "matching" && op.kind !== "atlas",
          );
        return json(res, {
          title: session.title,
          voice: voice.state(sessionId),
          presentation:
            store.projection(sessionId)?.kind === "voice"
              ? { kind: "voice", text: voice.state(sessionId)?.text ?? "" }
              : store.projection(sessionId),
          results: operations.map((op) => ({
            id: op.id,
            kind: op.kind,
            result:
              op.config.promptVersion === "analysis-v2" &&
              op.kind === "analysis"
                ? publicAnalysis(analysisV2Schema.parse(op.result))
                : op.result,
          })),
        });
      }
      if (url.pathname === "/api/join" && mutating) {
        if (participant) return json(res, { participant });
        const d = z
          .object({ name: z.string(), seated: z.boolean().default(false) })
          .parse(data);
        const joined = store.join(sessionId, d.name, d.seated);
        setCookie(res, `pm_${sessionId}`, joined.credential);
        return json(
          res,
          { participant: joined.participant, recovery: joined.recovery },
          201,
        );
      }
      if (url.pathname === "/api/recover" && mutating) {
        const d = z.object({ recovery: z.string().length(64) }).parse(data);
        const recovered = store.recover(sessionId, d.recovery);
        setCookie(res, `pm_${sessionId}`, recovered.credential);
        return json(res, { participant: recovered.participant });
      }
      if (url.pathname === "/api/contribution" && mutating)
        return json(
          res,
          store.revise(sessionId, own().id, revisionSchema.parse(data)),
        );
      if (url.pathname === "/api/help" && mutating)
        return json(
          res,
          store.requestHelp(
            own().id,
            z.object({ reason: z.string() }).parse(data).reason,
          ),
        );
      if (audio) {
        const recordingId = id.parse(audio[1]),
          p = own();
        if (mutating) {
          const round = id.parse(url.searchParams.get("round"));
          const mime = req.headers["content-type"]?.split(";")[0] ?? "";
          return json(
            res,
            await recordings.upload(
              sessionId,
              p.id,
              round,
              recordingId,
              mime,
              await body(req, 8 * 1024 * 1024),
            ),
            202,
          );
        }
        const recording = store.recording(p.id, recordingId);
        if (!recording) throw new SessionError("Recording not found.", 404);
        return json(res, recording);
      }
      if (url.pathname === "/api/recording-retry" && mutating) {
        recordings.retry(own().id, z.object({ id }).parse(data).id);
        return json(res, { ok: true });
      }
      if (!url.pathname.startsWith("/api/operator/"))
        throw new SessionError("Not found.", 404);
      const belongs = (opId: string) => {
        const op = store.operation(opId);
        if (store.snapshot(op.snapshotId).snapshot.sessionId !== sessionId)
          throw new SessionError("Wrong session.", 403);
        return op;
      };
      if (url.pathname === "/api/operator/state" && req.method === "GET") {
        const rounds = store.rounds(sessionId);
        const currentRound = rounds.at(-1);
        const participants = store.participants(sessionId);
        return json(res, {
          session,
          show: store.show(sessionId),
          contributionCount: currentRound
            ? participants.filter((p) =>
                store.current(p.id, currentRound.id)?.text.trim(),
              ).length
            : 0,
          participants,
          rounds,
          snapshots: store.snapshots(sessionId),
          operations: store
            .operations(sessionId)
            .map((op) =>
              op.kind === "matching" && op.published
                ? { ...op, encounter: store.releasedEncounter(op.id) }
                : op,
            ),
          help: store.help(sessionId),
          voice: voice.state(sessionId),
        });
      }
      if (!mutating) throw new SessionError("Not found.", 404);
      if (url.pathname === "/api/operator/analyse") {
        const d = z
          .object({ roundId: id, config: operationConfigSchema })
          .parse(data);
        if (store.round(d.roundId).sessionId !== sessionId)
          throw new SessionError("Wrong session.", 403);
        const op = store.analyse(d.roundId, d.config);
        // Closure is durable even if another operation currently occupies a slot.
        // A queued operation remains visible and explicitly startable.
        try {
          runner.start(op.id);
        } catch (error) {
          if (!(error instanceof SessionError) || error.status !== 409)
            throw error;
        }
        return json(res, store.operation(op.id), 202);
      }
      if (url.pathname === "/api/operator/personal-release") {
        const d = z.object({ id }).parse(data);
        belongs(d.id);
        return json(res, store.releasePersonal(d.id));
      }
      if (url.pathname === "/api/operator/skip-analysis") {
        const d = z.object({ roundId: id }).parse(data);
        if (store.round(d.roundId).sessionId !== sessionId)
          throw new SessionError("Wrong session.", 403);
        return json(res, store.skipAnalysis(d.roundId));
      }
      if (url.pathname === "/api/operator/atlas-publish") {
        const d = z.object({ id, reviewed: z.boolean() }).parse(data);
        belongs(d.id);
        return json(res, store.publishAtlas(d.id, d.reviewed));
      }
      if (url.pathname === "/api/operator/presentation") {
        const d = z
          .discriminatedUnion("kind", [
            z.object({
              kind: z.literal("analysis"),
              operationId: id,
              atlasOperationId: id.optional(),
              atlasView: z
                .object({
                  mode: z.enum(["overview", "atlas"]),
                  findingId: z.string().min(1).max(80).optional(),
                  page: z.number().int().min(0).max(10000).optional(),
                })
                .optional(),
            }),
            z.object({ kind: z.literal("voice") }),
          ])
          .parse(data);
        store.selectPresentation(sessionId, d);
        return json(res, store.show(sessionId));
      }
      if (url.pathname === "/api/operator/close")
        return json(res, store.closeSession(sessionId));
      if (url.pathname === "/api/operator/rounds") {
        const d = z
          .object({
            prompt: z.string(),
            mode: z.enum(["bounded", "continuous"]),
          })
          .parse(data);
        return json(res, store.createRound(sessionId, d.prompt, d.mode), 201);
      }
      if (url.pathname === "/api/operator/freeze") {
        const d = z.object({ roundId: id }).parse(data);
        if (store.round(d.roundId).sessionId !== sessionId)
          throw new SessionError("Wrong session.", 403);
        return json(res, store.freeze(d.roundId));
      }
      if (url.pathname === "/api/operator/jobs") {
        const d = z
          .object({
            snapshotId: id,
            kind: z.enum(["analysis", "voice", "matching", "atlas"]),
            config: operationConfigSchema,
          })
          .parse(data);
        if (store.snapshot(d.snapshotId).snapshot.sessionId !== sessionId)
          throw new SessionError("Wrong session.", 403);
        const op = store.enqueue(d.snapshotId, d.kind, d.config);
        runner.start(op.id);
        return json(res, store.operation(op.id), 202);
      }
      if (url.pathname === "/api/operator/job") {
        const d = z
          .object({
            id,
            action: z.enum(["start", "cancel", "retry", "publish"]),
          })
          .parse(data);
        belongs(d.id);
        if (d.action === "cancel") runner.cancel(d.id);
        else if (d.action === "publish") store.publish(d.id);
        else {
          if (d.action === "retry") store.retry(d.id);
          runner.start(d.id);
        }
        return json(res, store.operation(d.id));
      }
      if (url.pathname === "/api/operator/release") {
        const d = z
          .object({ id, locations: z.array(z.string()), reviewed: z.boolean() })
          .parse(data);
        belongs(d.id);
        return json(res, store.release(d.id, d.locations, d.reviewed));
      }
      if (url.pathname === "/api/operator/help") {
        store.resolveHelp(z.object({ id }).parse(data).id);
        return json(res, { ok: true });
      }
      if (url.pathname === "/api/operator/voice") {
        const d = z
          .object({
            roundId: id,
            action: z.enum(["start", "pause", "end"]),
            config: liveConfigSchema.optional(),
          })
          .parse(data);
        const result = await voice.control(
          d.action,
          sessionId,
          d.roundId,
          d.config,
        );
        if (d.action === "start")
          store.selectPresentation(sessionId, { kind: "voice" });
        return json(res, result);
      }
      throw new SessionError("Not found.", 404);
    };
    void handle().catch((error: unknown) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const status =
        error instanceof SessionError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 500;
      json(
        res,
        {
          error:
            error instanceof SessionError
              ? error.message
              : status === 400
                ? "Invalid request fields."
                : "Request failed. Saved inputs are retained.",
        },
        status,
      );
    });
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port ?? 3000, options.host ?? "127.0.0.1", resolve);
    });
  } catch (error) {
    await runner.close();
    await recordings.close();
    await voice.close();
    store.close();
    await unlock();
    throw error;
  }
  // Resolve an explicitly requested ephemeral loopback origin only after binding.
  // Fixed public origins (including reverse proxies) remain authoritative.
  const address = server.address();
  if (
    options.port === 0 &&
    origin.protocol === "http:" &&
    origin.port === "0" &&
    address &&
    typeof address !== "string"
  )
    origin.port = String(address.port);
  return {
    origin: origin.origin,
    server,
    store,
    runner,
    voice,
    async close() {
      closing = true;
      const stopped = new Promise<void>((resolve) =>
        server.close(() => resolve()),
      );
      server.closeIdleConnections();
      await runner.close();
      await recordings.close();
      await voice.close();
      await stopped;
      store.close();
      await unlock();
    },
  };
}
