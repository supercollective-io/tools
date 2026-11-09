import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { createRequest, joinRequest } from '../src/lib/core/protocol.ts';
import { localNetworkOrigins } from './network.ts';
import { ClientError, SessionService } from './service.ts';
import { Store } from './store.ts';

const dev = process.argv.includes('--dev');
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? (dev ? '0.0.0.0' : '127.0.0.1');
const networkOrigins = dev && host === '0.0.0.0' ? localNetworkOrigins(port) : [];
const origin = process.env.PUBLIC_ORIGIN ?? `http://localhost:${port}`;
const inviteOrigin = process.env.PUBLIC_ORIGIN ?? networkOrigins[0] ?? origin;
const allowedOrigins = new Set([origin, ...(dev ? networkOrigins : [])]);
const store = new Store(process.env.DATABASE_PATH ?? 'data/puck.sqlite');
const service = new SessionService(store);
const sockets = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
let stopping = false;
let webHandler: (req: IncomingMessage, res: ServerResponse) => void;
const rates = new Map<string, { count: number; since: number }>();
const cookieName = (id: string) => `puck_${id}`;
function token(req: IncomingMessage, roomId: string) {
  return (req.headers.cookie ?? '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${cookieName(roomId)}=`))
    ?.slice(cookieName(roomId).length + 1);
}
function setCookie(res: ServerResponse, roomId: string, value: string) {
  res.setHeader(
    'Set-Cookie',
    `${cookieName(roomId)}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${origin.startsWith('https:') ? '; Secure' : ''}`,
  );
}
function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}
async function body(req: IncomingMessage) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new ClientError('Use application/json.', 415);
  let text = '';
  for await (const chunk of req) {
    text += chunk.toString();
    if (Buffer.byteLength(text) > 8192) throw new ClientError('Request is too large.', 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ClientError('Invalid JSON.');
  }
}
function rateLimit(req: IncomingMessage) {
  const key = req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  for (const [key, rate] of rates) if (now - rate.since > 60000) rates.delete(key);
  const rate = rates.get(key) ?? { count: 0, since: now };
  rate.count++;
  rates.set(key, rate);
  if (rate.count > 60 || rates.size > 10000)
    throw new ClientError('Too many requests. Try again in a minute.', 429);
}
async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (stopping) throw new ClientError('Server is restarting.', 503);
  if (url.pathname === '/api/invite-origin' && req.method === 'GET') {
    json(res, { origin: inviteOrigin });
    return;
  }
  if (req.method === 'POST') {
    if (!allowedOrigins.has(req.headers.origin ?? ''))
      throw new ClientError('Unrecognised request origin.', 403);
    rateLimit(req);
  }
  if (url.pathname === '/api/rooms' && req.method === 'POST') {
    const parsed = createRequest.safeParse(await body(req));
    if (!parsed.success)
      throw new ClientError(parsed.error.issues[0]?.message ?? 'Check the question and options.');
    const created = service.create(parsed.data.question, parsed.data.options, parsed.data.mode);
    setCookie(res, created.roomId, created.token);
    json(res, { id: created.roomId }, 201);
    return;
  }
  const roomMatch = /^\/api\/rooms\/([\w-]+)(?:\/(join|start|cancel))?$/.exec(url.pathname);
  if (roomMatch) {
    const [, roomId, action] = roomMatch;
    const credential = token(req, roomId);
    const participant = service.authenticate(roomId, credential);
    if (req.method === 'GET' && !action) {
      json(res, service.view(roomId, participant));
      return;
    }
    if (req.method === 'POST' && action === 'join') {
      const parsed = joinRequest.safeParse(await body(req));
      if (!parsed.success) throw new ClientError('Enter a name of 1–32 characters.');
      const joined = service.join(roomId, parsed.data.name, credential);
      setCookie(res, roomId, joined.token);
      json(res, { ok: true });
      return;
    }
    if (req.method === 'POST' && (action === 'start' || action === 'cancel')) {
      if (!participant) throw new ClientError('Join the room first.', 401);
      if (action === 'start') service.start(roomId, participant);
      else service.cancel(roomId, participant);
      json(res, service.view(roomId, participant));
      return;
    }
  }
  const recordingMatch = /^\/api\/recordings\/([\w-]+)$/.exec(url.pathname);
  if (recordingMatch && req.method === 'GET') {
    const roomId = store.roundRoom(recordingMatch[1]);
    if (!roomId || !service.authenticate(roomId, token(req, roomId)))
      throw new ClientError('This recording is available to room participants.', 403);
    const recording = store.recording(recordingMatch[1]);
    if (!recording)
      throw new ClientError('No complete recording is available for this round.', 404);
    if (url.searchParams.has('download'))
      res.setHeader('Content-Disposition', `attachment; filename="puck-${recording.id}.json"`);
    json(res, recording);
    return;
  }
  throw new ClientError('Not found.', 404);
}
const server = createServer((req, res) => {
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const url = new URL(req.url ?? '/', origin);
  if (url.pathname === '/healthz') {
    json(res, { status: stopping ? 'stopping' : 'ok' }, stopping ? 503 : 200);
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    void api(req, res, url).catch((error: unknown) => {
      if (!(error instanceof ClientError)) console.error(error);
      json(
        res,
        {
          error:
            error instanceof ClientError ? error.message : 'Something went wrong on the server.',
        },
        error instanceof ClientError ? error.status : 500,
      );
    });
  } else webHandler(req, res);
});
server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url ?? '/', origin).pathname;
  if (!path.startsWith('/ws/')) return; // Leave Vite HMR to Vite's handler.
  try {
    const roomId = /^\/ws\/rooms\/([\w-]+)$/.exec(path)?.[1];
    if (stopping || !roomId || !allowedOrigins.has(req.headers.origin ?? ''))
      throw new ClientError('Forbidden', 403);
    const participant = service.authenticate(roomId, token(req, roomId));
    if (!participant) throw new ClientError('Unauthorised', 401);
    sockets.handleUpgrade(req, socket, head, (ws) => service.connect(roomId, participant, ws));
  } catch {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
  }
});
let closeVite: (() => Promise<void>) | undefined;
if (dev) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: 'custom',
  });
  webHandler = (req, res) =>
    vite.middlewares(req, res, () => {
      res.writeHead(404);
      res.end('Not found');
    });
  closeVite = () => vite.close();
} else {
  const built = await import(pathToFileURL(resolve('build/handler.js')).href);
  webHandler = built.handler;
}
server.listen(port, host, () => {
  console.info(`Puck is listening at ${origin}`);
  if (inviteOrigin !== origin) console.info(`Phone invites: ${inviteOrigin}`);
});
async function shutdown() {
  if (stopping) return;
  stopping = true;
  service.shutdown();
  const force = setTimeout(() => {
    for (const client of sockets.clients) client.terminate();
    server.closeAllConnections();
  }, 1500);
  force.unref();
  await closeVite?.();
  server.close(() => {
    clearTimeout(force);
    store.close();
    process.exit(0);
  });
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
