import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { LiveController } from "./live.ts";
import type { LiveLog } from "./live-runs.ts";

export type LiveServerOptions = {
  log: LiveLog;
  controller: LiveController;
  port?: number;
  beforeStart?: () => void;
};

/** Only deliberately public control failures cross the local HTTP boundary. */
export class LocalControlError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

type LocalServerOptions<Snapshot> = {
  port?: number;
  snapshot: () => Snapshot;
  subscribe: (listener: () => void) => () => void;
  paths: string[];
  validate: (path: string, body: Record<string, unknown>) => void;
  control: (path: string, body: Record<string, unknown>) => Promise<void>;
  close: () => Promise<void>;
};

/** Shared loopback transport; controls and shutdown are always serialised. */
export async function startLocalRehearsalServer<Snapshot>(
  options: LocalServerOptions<Snapshot>,
) {
  const port = options.port ?? 3000;
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Port must be an integer between 0 and 65535.");
  const clients = new Set<ServerResponse>();
  const projectionClients = new Set<ServerResponse>();
  let changing: ReturnType<typeof setTimeout> | undefined;
  let closing = false;
  let controls: Promise<unknown> = Promise.resolve();
  const snapshot = options.snapshot;
  const writeEvent = (response: ServerResponse, event: string) => {
    // A browser can reconnect for a fresh snapshot. Never let a slow monitor
    // accumulate an unlimited queue or delay journalled model output.
    if (response.destroyed || response.writableLength > 1024 * 1024) {
      clients.delete(response);
      response.destroy();
      return;
    }
    response.write(event);
  };
  const sendState = (response: ServerResponse) => {
    writeEvent(
      response,
      `event: state\ndata: ${JSON.stringify(projectionClients.has(response) ? projectionState(snapshot()) : snapshot())}\n\n`,
    );
  };
  const notify = () => {
    if (changing || closing) return;
    changing = setTimeout(() => {
      changing = undefined;
      for (const client of clients) sendState(client);
    }, 60);
  };
  const unsubscribe = options.subscribe(notify);
  const heartbeat = setInterval(() => {
    for (const client of clients) writeEvent(client, ": keep-alive\n\n");
  }, 15000);
  heartbeat.unref();
  const json = (response: ServerResponse, status: number, body: unknown) => {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(body));
  };
  const assets: Record<string, { file: string; type: string }> = {
    "/projection": {
      file: "projection.html",
      type: "text/html; charset=utf-8",
    },
    "/projection.js": {
      file: "projection.js",
      type: "text/javascript; charset=utf-8",
    },
    "/projection-state.js": {
      file: "projection-state.js",
      type: "text/javascript; charset=utf-8",
    },
    "/projection.css": {
      file: "projection.css",
      type: "text/css; charset=utf-8",
    },
    "/": { file: "index.html", type: "text/html; charset=utf-8" },
    "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
    "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
    "/style.css": { file: "style.css", type: "text/css; charset=utf-8" },
  };
  let actualPort = port;
  const validHost = (request: IncomingMessage) =>
    request.headers.host === `127.0.0.1:${actualPort}` ||
    request.headers.host === `localhost:${actualPort}` ||
    (actualPort === 80 &&
      ["127.0.0.1", "localhost"].includes(request.headers.host ?? ""));
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    try {
      if (!validHost(request)) {
        json(response, 403, {
          error: "This rehearsal accepts local requests only.",
        });
        return;
      }
      if (closing) {
        json(response, 503, { error: "The rehearsal is closing." });
        return;
      }
      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
      if (
        request.method === "GET" &&
        ["/api/state", "/api/projection/state"].includes(url.pathname)
      ) {
        json(
          response,
          200,
          url.pathname === "/api/projection/state"
            ? projectionState(snapshot())
            : snapshot(),
        );
        return;
      }
      if (
        request.method === "GET" &&
        ["/api/events", "/api/projection/events"].includes(url.pathname)
      ) {
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        clients.add(response);
        if (url.pathname === "/api/projection/events")
          projectionClients.add(response);
        response.on("close", () => {
          clients.delete(response);
          projectionClients.delete(response);
        });
        sendState(response);
        return;
      }
      if (request.method === "POST" && options.paths.includes(url.pathname)) {
        if (
          request.headers.origin !== undefined &&
          request.headers.origin !==
            new URL(`http://${request.headers.host}`).origin
        ) {
          json(response, 403, {
            error: "Controls require the rehearsal's own origin.",
          });
          return;
        }
        if (
          request.headers["content-type"]
            ?.split(";", 1)[0]
            ?.trim()
            .toLowerCase() !== "application/json"
        ) {
          json(response, 415, {
            error: "Controls require an application/json body.",
          });
          return;
        }
        let body = "";
        for await (const chunk of request) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 1024) {
            json(response, 413, { error: "The control body is too large." });
            return;
          }
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          json(response, 400, { error: "Send a JSON object: {}." });
          return;
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          json(response, 400, {
            error: "Controls require a JSON object.",
          });
          return;
        }
        try {
          options.validate(url.pathname, parsed as Record<string, unknown>);
        } catch (error) {
          json(response, 400, {
            error:
              error instanceof LocalControlError
                ? error.message
                : "Invalid control settings.",
          });
          return;
        }
        const action = async () => {
          if (closing) throw new Error("Closing");
          await options.control(
            url.pathname,
            parsed as Record<string, unknown>,
          );
          notify();
        };
        const operation = controls.then(action);
        controls = operation.catch(() => {});
        try {
          await operation;
          json(
            response,
            200,
            url.pathname === "/api/projection/state"
              ? projectionState(snapshot())
              : snapshot(),
          );
        } catch (error) {
          notify();
          json(
            response,
            error instanceof LocalControlError ? error.status : 409,
            {
              error:
                error instanceof LocalControlError
                  ? error.message
                  : "The control could not be applied. Check the rehearsal status and model configuration.",
            },
          );
        }
        return;
      }
      if (request.method === "GET" && assets[url.pathname]) {
        const asset = assets[url.pathname];
        if (!asset) return;
        const content = await readFile(
          new URL(`./web/${asset.file}`, import.meta.url),
        );
        response.writeHead(200, { "Content-Type": asset.type });
        response.end(content);
        return;
      }
      json(response, 404, { error: "Unknown rehearsal route." });
    } catch {
      if (!response.headersSent)
        json(response, 500, { error: "The local rehearsal request failed." });
      else response.end();
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    unsubscribe();
    clearInterval(heartbeat);
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing local server address.");
  actualPort = address.port;
  let shutdown: Promise<void> | undefined;
  return {
    url: `http://127.0.0.1:${actualPort}`,
    server,
    snapshot,
    close(): Promise<void> {
      shutdown ??= (async () => {
        closing = true;
        unsubscribe();
        clearInterval(heartbeat);
        if (changing) clearTimeout(changing);
        await controls;
        try {
          await options.close();
        } finally {
          for (const client of clients) client.end();
          clients.clear();
          await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
            server.closeAllConnections();
          });
        }
      })();
      return shutdown;
    },
  };
}

/** Public browser state excludes prompts, participant backgrounds and endpoints. */
export function publicLiveState(state: import("./live-runs.ts").LiveState) {
  return {
    ...state,
    participants: state.participants.map((writer, index) => ({
      ...writer,
      ...(state.config.live.mode === "fixed"
        ? { sourceText: state.config.live.score?.voices[index]?.text }
        : {}),
    })),
    scenario: {
      schemaVersion: state.scenario.schemaVersion,
      title: state.scenario.title,
      openingInvitation: state.scenario.openingInvitation,
      voices: state.scenario.voices.map(({ id, name }) => ({ id, name })),
    },
    config: {
      schemaVersion: state.config.schemaVersion,
      composer: {
        provider: state.config.composer.provider,
        model: state.config.composer.model,
      },
      live: {
        mode: state.config.live.mode ?? "continuous",
        participants: {
          provider: state.config.live.participants.provider,
          model: state.config.live.participants.model,
        },
        maxDurationMs: state.config.live.maxDurationMs,
        feedbackIntervalMs: state.config.live.feedbackIntervalMs,
        refreshIntervalMs: state.config.live.refreshIntervalMs,
        maxContextCharacters: state.config.live.maxContextCharacters,
      },
    },
  };
}

/** A single local rehearsal. The server owns the controller and its journal. */
export async function startLiveServer(options: LiveServerOptions) {
  const { log, controller } = options;
  return startLocalRehearsalServer({
    port: options.port,
    snapshot: () => ({
      path: log.path,
      state: publicLiveState(log.state),
      runtime: controller.snapshot(),
    }),
    subscribe: (listener) => controller.onChange(listener),
    paths: ["/api/start", "/api/pause", "/api/end"],
    validate: (_path, body) => {
      if (Object.keys(body).length)
        throw new LocalControlError(
          "Controls accept only an empty JSON object: {}.",
          400,
        );
    },
    control: async (path) => {
      if (path === "/api/start") {
        options.beforeStart?.();
        await controller.start();
      } else if (path === "/api/pause") await controller.pause();
      else await controller.end();
    },
    close: async () => {
      try {
        await controller.close();
      } finally {
        await log.close();
      }
    },
  });
}

/** Audience transport contains only published collective writing and lifecycle. */
export function projectionState(snapshot: unknown) {
  const { state } = snapshot as {
    state?: {
      runId: string;
      status: string;
      composer: { text: string };
      publishedOffset: number;
    } | null;
  };
  return state
    ? {
        runId: state.runId,
        status: state.status,
        text: state.composer.text.slice(0, state.publishedOffset),
      }
    : null;
}
