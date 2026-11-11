import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { access, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const kinds = new Set(['activity', 'analogue', 'waiting', 'closed']);
const privateSegments = /(^|\/)(operator|admin|host|control|controls|projection|projector|presenter)(\/|$)/i;
const forbiddenQuery = /(token|password|secret|credential|auth|operator|admin|api[_-]?key)|^key$/i;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) {
    throw new HttpError(400, `Invalid ${label} fields`);
  }
}

function text(value, label, maximum = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new HttpError(400, `Invalid ${label}`);
  }
  return value.trim();
}

function origin(value, allowLoopback = false) {
  const url = new URL(value);
  const local = allowLoopback && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.pathname !== '/' ||
      url.search || url.hash || (!local && url.port && url.port !== '443')) {
    throw new Error('Origins must be HTTPS origins without credentials, paths or query parameters');
  }
  return url.origin;
}

export function configuration(env = process.env) {
  const password = env.HUB_OPERATOR_PASSWORD;
  if (!password || password.length < 24 || password.startsWith('replace-')) {
    throw new Error('Set HUB_OPERATOR_PASSWORD to a private random password of at least 24 characters');
  }
  const publicOrigin = origin(env.HUB_PUBLIC_ORIGIN ?? 'https://we.supercollective.io', true);
  const allowedOrigins = new Set((env.HUB_ALLOWED_ORIGINS ?? 'https://polymind.supercollective.io')
    .split(',').map(value => origin(value.trim())));
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
  return { publicOrigin, allowedOrigins, password, username: env.HUB_OPERATOR_USER ?? 'organiser',
    dataDir: resolve(env.HUB_DATA_DIR ?? join(root, 'data')), host: env.HOST ?? '0.0.0.0', port };
}

export function participantUrl(value, config) {
  let url;
  try { url = new URL(text(value, 'participant URL', 2048)); }
  catch { throw new HttpError(400, 'Invalid participant URL'); }
  let path;
  try { path = decodeURIComponent(url.pathname); }
  catch { throw new HttpError(400, 'Invalid participant URL path'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      !config.allowedOrigins.has(url.origin) || path.includes('%') || privateSegments.test(path) ||
      [...url.searchParams].some(([key, value]) => forbiddenQuery.test(key) ||
        /^(operator|admin|control|projection)$/i.test(value))) {
    throw new HttpError(400, 'Use an allowed HTTPS participant destination without operator credentials');
  }
  return url.href;
}

export function validateSelection(value, config) {
  exactKeys(value, ['activeId', 'activities'], 'selection');
  const activeId = text(value.activeId, 'active activity', 80);
  if (!Array.isArray(value.activities) || value.activities.length < 1 || value.activities.length > 20) {
    throw new HttpError(400, 'Provide between one and twenty activities');
  }
  const activities = value.activities.map(activity => {
    exactKeys(activity, ['id', 'label', 'kind', 'status', 'instruction', 'url'], 'activity');
    const id = text(activity.id, 'activity ID', 80);
    if (!/^[a-z0-9-]+$/.test(id)) throw new HttpError(400, 'Activity IDs use lowercase letters, digits and hyphens');
    const label = text(activity.label, 'activity label', 100);
    const instruction = text(activity.instruction, 'instruction');
    if (!kinds.has(activity.kind) || !['ready', 'unavailable'].includes(activity.status)) {
      throw new HttpError(400, 'Invalid activity kind or status');
    }
    const result = { id, label, kind: activity.kind, status: activity.status, instruction };
    if (activity.kind === 'activity' && activity.status === 'ready') {
      result.url = participantUrl(activity.url, config);
    } else if (activity.url !== undefined && activity.url !== '') {
      throw new HttpError(400, 'Only a ready digital activity can have a destination');
    }
    return result;
  });
  if (new Set(activities.map(activity => activity.id)).size !== activities.length ||
      !activities.some(activity => activity.id === activeId)) {
    throw new HttpError(400, 'Activity IDs must be unique and include the selected activity');
  }
  return { activeId, activities };
}

function seed() {
  return { activeId: 'arrival', activities: [
    { id: 'arrival', label: 'Welcome to Rehearsing We', kind: 'waiting', status: 'ready',
      instruction: 'You are in the right place. Keep this page open and listen for the invitation.' },
    { id: 'polymind', label: 'Our temporary collective mind', kind: 'activity', status: 'unavailable',
      instruction: 'We are preparing the next invitation. Please wait for the cue.' },
    { id: 'analogue', label: 'Look up, meet the room', kind: 'analogue', status: 'ready',
      instruction: 'Put your phone away for a moment. Listen to the invitation and make space for one another.' },
    { id: 'puck', label: 'Move something together', kind: 'activity', status: 'unavailable',
      instruction: 'We are preparing this experiment. Stay with the room.' },
    { id: 'flight', label: 'Steer together', kind: 'activity', status: 'unavailable',
      instruction: 'We are preparing this experiment. Stay with the room.' },
    { id: 'closing', label: 'Take the rehearsal with you', kind: 'closed', status: 'ready',
      instruction: 'The shared experiment has ended. Put your phone away and join the closing conversation.' },
  ] };
}

async function atomicSave(path, state) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`);
    await handle.sync();
    await handle.close(); handle = undefined;
    await rename(temporary, path);
    const directory = await open(dirname(path), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally {
    await handle?.close();
    await rm(temporary, { force: true });
  }
}

export async function createHub(config) {
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  await access(config.dataDir, constants.W_OK);
  const statePath = join(config.dataDir, 'state.json');
  let state;
  try {
    state = JSON.parse(await readFile(statePath, 'utf8'));
    exactKeys(state, ['schemaVersion', 'revision', 'updatedAt', 'activeId', 'activities'], 'saved state');
    if (state.schemaVersion !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 1 ||
        !Number.isFinite(Date.parse(state.updatedAt))) throw new Error('Invalid saved state version');
    validateSelection({ activeId: state.activeId, activities: state.activities }, config);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = { schemaVersion: 1, revision: 1, updatedAt: new Date().toISOString(), ...seed() };
    await atomicSave(statePath, state);
  }
  let writes = Promise.resolve();
  const credentialHash = createHash('sha256').update(`${config.username}:${config.password}`).digest();
  function authenticated(req) {
    const header = req.headers.authorization ?? '';
    const supplied = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64') : Buffer.alloc(0);
    return timingSafeEqual(credentialHash, createHash('sha256').update(supplied).digest());
  }
  const securityHeaders = {
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  };
  const assets = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']], ['/hub.js', ['hub.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']], ['/operator', ['operator.html', 'text/html; charset=utf-8']],
    ['/operator.js', ['operator.js', 'text/javascript; charset=utf-8']],
    ['/print', ['print.html', 'text/html; charset=utf-8']], ['/qr.svg', ['qr.svg', 'image/svg+xml']],
  ]);
  const server = createServer(async (req, res) => {
    function reply(status, value, extra = {}) {
      res.writeHead(status, { ...securityHeaders, 'content-type': 'application/json; charset=utf-8', ...extra });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(value));
    }
    try {
      const host = req.headers.host ?? '';
      if (host !== new URL(config.publicOrigin).host && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
        throw new HttpError(403, 'Unrecognised host');
      }
      const path = new URL(req.url, config.publicOrigin).pathname;
      if (path.startsWith('/operator') || path.startsWith('/api/operator/')) {
        if (!authenticated(req)) {
          reply(401, { error: 'Operator authentication required' }, { 'www-authenticate': 'Basic realm="Rehearsing We operator", charset="UTF-8"' });
          return;
        }
      }
      if (path === '/healthz' && ['GET', 'HEAD'].includes(req.method)) {
        await access(config.dataDir, constants.W_OK);
        reply(200, { ok: true, revision: state.revision }); return;
      }
      if (path === '/api/current' && req.method === 'GET') {
        reply(200, { schemaVersion: 1, revision: state.revision, updatedAt: state.updatedAt,
          current: state.activities.find(activity => activity.id === state.activeId) }); return;
      }
      if (path === '/api/operator/state' && req.method === 'GET') { reply(200, state); return; }
      if (path === '/api/operator/state' && req.method === 'PUT') {
        if (req.headers.origin !== config.publicOrigin) throw new HttpError(403, 'Same-origin update required');
        if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError(415, 'Use application/json');
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 65536) throw new HttpError(413, 'Manifest too large');
          chunks.push(chunk);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { throw new HttpError(400, 'Invalid JSON'); }
        exactKeys(body, ['expectedRevision', 'activeId', 'activities'], 'update');
        if (!Number.isSafeInteger(body.expectedRevision)) throw new HttpError(400, 'Provide expectedRevision');
        const selection = validateSelection({ activeId: body.activeId, activities: body.activities }, config);
        const write = writes.then(async () => {
          if (body.expectedRevision !== state.revision) throw new HttpError(409, 'The manifest changed. Reload before saving.');
          const next = { schemaVersion: 1, revision: state.revision + 1,
            updatedAt: new Date().toISOString(), ...selection };
          await atomicSave(statePath, next);
          state = next;
          return next;
        });
        writes = write.catch(() => {});
        reply(200, await write); return;
      }
      if (assets.has(path) && ['GET', 'HEAD'].includes(req.method)) {
        const [file, type] = assets.get(path);
        const bytes = await readFile(join(root, 'public', file));
        res.writeHead(200, { ...securityHeaders, 'content-type': type });
        res.end(req.method === 'HEAD' ? undefined : bytes); return;
      }
      throw new HttpError(404, 'Page not found');
    } catch (error) {
      reply(error instanceof HttpError ? error.status : 500,
        { error: error instanceof HttpError ? error.message : 'Hub could not complete the request' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const config = configuration();
    const server = await createHub(config);
    server.listen(config.port, config.host, () => console.log('Rehearsing We hub is ready'));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    });
  } catch (error) {
    console.error(`Hub startup failed: ${error.message}`);
    process.exitCode = 1;
  }
}
