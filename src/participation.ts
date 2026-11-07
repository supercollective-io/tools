import { access, chmod, mkdir, readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { join } from "node:path";
import QRCode from "qrcode";
import { z } from "zod";
import { LiveController } from "./live.ts";
import { LiveLog } from "./live-runs.ts";
import { type LiveConfig, liveConfigSchema } from "./live-schema.ts";
import { startLiveServer } from "./live-server.ts";
import { type Generate, generate } from "./models.ts";
import { ParticipationStore } from "./participation-store.ts";

class InputError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
const submission = z.strictObject({
  id: z.uuid(),
  text: z
    .string()
    .min(1)
    .max(4000)
    .refine((s) => s.trim().length > 0)
    .refine((s) => !/[\uD800-\uDFFF]/u.test(s)),
  contextOffset: z.number().int().nonnegative(),
});
export async function startParticipation(options: {
  directory: string;
  invitation: string;
  config: LiveConfig;
  origin: string;
  operatorPort?: number;
  generate?: Generate;
  intervalMs?: number;
}) {
  const invitation = z
    .string()
    .trim()
    .min(1)
    .max(12000)
    .parse(options.invitation);
  const origin = new URL(options.origin);
  if (
    origin.protocol !== "http:" ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password ||
    !origin.port
  )
    throw new Error(
      "Use an explicit http://LAN-IP:port origin for this local rehearsal.",
    );
  await mkdir(options.directory, { recursive: true, mode: 0o700 });
  const runPath = join(options.directory, "live.jsonl");
  const exists = await readFile(runPath).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
  const databaseExists = await access(
    join(options.directory, "participation.sqlite"),
  ).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
  if (exists !== databaseExists)
    throw new Error(
      "Session is incomplete: retain both live.jsonl and participation.sqlite. Restore the complete session folder before reopening.",
    );
  const config = liveConfigSchema.parse({
    ...options.config,
    live: { ...options.config.live, mode: "typed", score: undefined },
  });
  const log = exists
    ? await LiveLog.resume(runPath)
    : await LiveLog.create(runPath, {
        type: "live.created",
        config,
        scenario: {
          schemaVersion: 1,
          title: invitation.slice(0, 200),
          openingInvitation: invitation,
          voices: [],
        },
      });
  if (log.state.config.live.mode !== "typed") {
    await log.close();
    throw new Error("This is not a typed session.");
  }
  const controller = new LiveController(log, options.generate ?? generate);
  let store: ParticipationStore;
  try {
    store = new ParticipationStore(
      join(options.directory, "participation.sqlite"),
      log.state.runId,
    );
    await chmod(join(options.directory, "participation.sqlite"), 0o600);
  } catch (error) {
    await log.close();
    throw error;
  }
  for (const p of store.participants())
    if (log.state.status !== "ended") await controller.joinParticipant(p.id);
  const cookieName = `collective_${log.state.runId.slice(0, 8)}`;
  const joinUrl = `${origin.origin}/#${store.joinToken}`;
  const svg = await QRCode.toString(joinUrl, { type: "svg", margin: 2 });
  let busy = false,
    closing = false;
  let admission: Promise<void> = Promise.resolve();
  const tick = () => {
    if (busy || closing || log.state.status !== "running") return;
    busy = true;
    admission = (async () => {
      for (const chunk of store.batch()) {
        if (log.state.status !== "running") break;
        if (
          !(await controller.admitInput(
            chunk.id,
            chunk.participant,
            chunk.text,
            chunk.revision !== undefined,
          ))
        )
          break;
        store.admitted(
          chunk.id,
          chunk.position,
          chunk.revision,
          chunk.participant,
        );
      }
    })()
      .catch(async () => {
        try {
          await controller.pause(
            "Incoming contributions could not be admitted. Saved submissions remain queued; check storage before resuming.",
          );
        } catch {
          /* The controller exposes a fatal journal failure; keep saved inputs available. */
        }
      })
      .finally(() => {
        busy = false;
      });
  };
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(value));
  };
  const credential = (req: IncomingMessage) =>
    req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) ?? "";
  async function body(req: IncomingMessage) {
    if (req.headers.origin !== origin.origin)
      throw new InputError("Use the session's own page.", 403);
    if (req.headers["content-type"]?.split(";")[0] !== "application/json")
      throw new InputError("Send JSON.", 415);
    const parts: Buffer[] = [];
    let size = 0;
    for await (const part of req) {
      size += part.length;
      if (size > 20000) throw new InputError("Submission too large.", 413);
      parts.push(Buffer.from(part));
    }
    const raw = Buffer.concat(parts).toString("utf8");
    try {
      return JSON.parse(raw);
    } catch {
      throw new InputError("Invalid JSON.");
    }
  }
  // All participant writes are serialised with one another. The controller owns
  // journal mutations; admission is idempotent across the SQLite/journal boundary.
  let requests: Promise<unknown> = Promise.resolve();
  const server = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    const handle = async () => {
      if (closing) throw new InputError("Session closing.", 503);
      if (req.headers.host !== origin.host)
        throw new InputError("Wrong session address.", 403);
      const url = new URL(req.url ?? "/", origin);
      const participant = store.identify(credential(req));
      if (req.method === "POST" && url.pathname === "/api/join") {
        const data = await body(req);
        if (log.state.status === "ended" && !participant)
          throw new InputError("This session has ended.", 410);
        if (data?.token !== store.joinToken)
          throw new InputError("Use the session's join link.", 403);
        if (!participant) {
          const joined = store.join();
          if (!(await controller.joinParticipant(joined.id)))
            throw new InputError("This session has ended.", 410);
          res.setHeader(
            "Set-Cookie",
            `${cookieName}=${joined.credential}; HttpOnly; SameSite=Strict; Path=/`,
          );
        }
        json(res, 200, { joined: true });
        return;
      }
      if (url.pathname.startsWith("/api/") && !participant)
        throw new InputError("Join this session first.", 401);
      if (req.method === "GET" && url.pathname === "/api/state") {
        const state = log.state;
        json(res, 200, {
          runId: state.runId,
          status: state.status,
          invitation: state.scenario.openingInvitation,
          contribution: store.current(participant ?? ""),
        });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/contribution") {
        const parsed = z
          .strictObject({
            revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
            text: z
              .string()
              .max(4000)
              .refine((s) => !/[\uD800-\uDFFF]/u.test(s)),
          })
          .safeParse(await body(req));
        if (!parsed.success)
          throw new InputError("Use up to 4,000 characters of text.");
        try {
          json(
            res,
            200,
            store.revise(
              participant ?? "",
              parsed.data.revision,
              parsed.data.text,
              log.state.status !== "ended",
            ),
          );
        } catch (error) {
          if (error instanceof Error && error.message === "Revision conflict.")
            throw new InputError(
              "This contribution changed in another tab. Your local writing is retained. Close the other tab, then edit here to continue.",
              409,
            );
          if (
            error instanceof Error &&
            error.message === "This session has ended."
          )
            throw new InputError(error.message, 410);
          throw new InputError("Could not save. Retrying automatically.", 503);
        }
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/submit") {
        const parsed = submission.safeParse(await body(req));
        if (!parsed.success)
          throw new InputError("Enter 1–4,000 characters of text.");

        if (parsed.data.contextOffset > log.state.publishedOffset)
          throw new InputError("Unknown collective context.");
        const { id, text, contextOffset } = parsed.data;
        try {
          json(
            res,
            200,
            store.submit(
              participant ?? "",
              id,
              text,
              contextOffset,
              log.state.status !== "ended",
            ),
          );
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "This session has ended."
          )
            throw new InputError(error.message, 410);
          throw new InputError(
            error instanceof Error &&
              [
                "Submission ID already has different content.",
                "This participant has reached the session text limit.",
              ].includes(error.message)
              ? error.message
              : "Could not save; retry the same submission.",
            409,
          );
        }
        return;
      }
      const assets: Record<string, [string, string]> = {
        "/": ["participant.html", "text/html"],
        "/participant.js": ["participant.js", "text/javascript"],
        "/participant.css": ["participant.css", "text/css"],
      };
      const asset = assets[url.pathname];
      if (req.method === "GET" && asset) {
        res.writeHead(200, { "Content-Type": `${asset[1]}; charset=utf-8` });
        res.end(await readFile(new URL(`./web/${asset[0]}`, import.meta.url)));
        return;
      }
      throw new InputError("Not found.", 404);
    };
    const operation = requests.then(handle);
    requests = operation.catch(() => {});
    void operation.catch((error) =>
      json(res, error instanceof InputError ? error.status : 503, {
        error:
          error instanceof InputError
            ? error.message
            : "Unable to save right now. Retry with the same submission.",
      }),
    );
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  let operator: Awaited<ReturnType<typeof startLiveServer>> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(Number(origin.port), "0.0.0.0", () => {
        server.off("error", reject);
        resolve();
      });
    });
    operator = await startLiveServer({
      log,
      controller,
      port: options.operatorPort ?? 3100,
      join: { url: joinUrl, svg },
    });
    timer = setInterval(tick, options.intervalMs ?? 2000);
  } catch (error) {
    server.close();
    await controller.close();
    await log.close();
    store.close();
    throw error;
  }
  return {
    operatorUrl: operator.url,
    joinUrl,
    runPath,
    log,
    controller,
    store,
    async close() {
      closing = true;
      if (timer) clearInterval(timer);
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      await requests;
      await admission;
      await operator?.close();
      store.close();
    },
  };
}
