import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { access, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isPolymindInvitation } from './invitations.mjs';
import { newPairing, newFours, validatePairing, participantKey, joinPairing, pairingResult, changePairPrompt } from './pairing.mjs';
import { openRuns, profiles, programme } from './run-profiles.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const kinds = new Set(['activity', 'analogue', 'pairs', 'fours', 'waiting', 'closed']);
const privateSegments = /(^|\/)(operator|admin|host|control|controls|projection|projector|presenter)(\/|$)/i;
const forbiddenQuery = /(token|password|secret|credential|auth|operator|admin|api[_-]?key)|^key$/i;
const flightAudienceOrigin = 'https://fly.supercollective.io';
const flightAudienceSearch = /^\?key=[A-Za-z0-9_-]{24,128}$/;

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
  const appOrigins = {
    polymind: origin(env.HUB_POLYMIND_ORIGIN ?? 'https://polymind.supercollective.io'),
    puck: origin(env.HUB_PUCK_ORIGIN ?? 'https://puck.supercollective.io'),
    flight: origin(env.HUB_FLIGHT_ORIGIN ?? 'https://fly.supercollective.io'),
  };
  const appTokens = { polymind: env.HUB_POLYMIND_TOKEN, puck: env.HUB_PUCK_TOKEN, flight: env.HUB_FLIGHT_TOKEN };
  for (const token of Object.values(appTokens)) {
    if (token !== undefined && (token.length < 32 || token.startsWith('replace-')))
      throw new Error('App access tokens must contain at least 32 characters.');
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
  return { publicOrigin, allowedOrigins, appOrigins, appTokens, password, username: env.HUB_OPERATOR_USER ?? 'organiser',
    dataDir: resolve(env.HUB_DATA_DIR ?? join(root, 'data')), host: env.HOST ?? '0.0.0.0', port };
}

export function participantUrl(value, config) {
  let url;
  try { url = new URL(text(value, 'participant URL', 2048)); }
  catch { throw new HttpError(400, 'Invalid participant URL'); }
  let path;
  try { path = decodeURIComponent(url.pathname); }
  catch { throw new HttpError(400, 'Invalid participant URL path'); }
  // Flight uses this exact public audience URL shape. The Hub validates its
  // destination and opaque-key format, not whether the key is the participant
  // key rather than another Flight secret. Automatic preparation retrieves
  // the invitation from Flight; manual overrides must use its audience link.
  const flightAudienceInvite = url.origin === (config.appOrigins?.flight ?? flightAudienceOrigin) && path === '/' &&
    flightAudienceSearch.test(url.search);
  if (url.origin === config.appOrigins.polymind && !isPolymindInvitation(value, config.appOrigins.polymind)) {
    throw new HttpError(400, 'Use the complete Participant entrance from Polymind session controls, or reconnect the session in Preparation.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      !config.allowedOrigins.has(url.origin) || path.includes('%') || privateSegments.test(path) ||
      [...url.searchParams].some(([key, value]) =>
        (forbiddenQuery.test(key) && !(flightAudienceInvite && key === 'key')) ||
        /^(operator|admin|control|projection)$/i.test(value))) {
    throw new HttpError(400, 'Use an allowed HTTPS participant destination without operator credentials');
  }
  return url.href;
}

export function supportsNameHandoff(current, config) {
  if (current.kind !== 'activity' || current.status !== 'ready' || !current.url) return false;
  const destination = new URL(current.url);
  return (destination.origin === config.appOrigins.polymind && destination.pathname === '/') ||
    (destination.origin === config.appOrigins.puck && /^\/room\/[a-zA-Z0-9_-]+$/.test(destination.pathname));
}

export function validateSelection(value, config) {
  exactKeys(value, ['activeId', 'activities'], 'selection');
  const activeId = text(value.activeId, 'active activity', 80);
  if (!Array.isArray(value.activities) || value.activities.length < 1 || value.activities.length > 20) {
    throw new HttpError(400, 'Provide between one and twenty activities');
  }
  const activities = value.activities.map(activity => {
    exactKeys(activity, ['id', 'label', 'kind', 'status', 'instruction', 'url', 'prompts'], 'activity');
    const id = text(activity.id, 'activity ID', 80);
    if (!/^[a-z0-9-]+$/.test(id)) throw new HttpError(400, 'Activity IDs use lowercase letters, digits and hyphens');
    const label = text(activity.label, 'activity label', 100);
    const instruction = activity.instruction === '' ? '' : text(activity.instruction, 'instruction');
    if (!kinds.has(activity.kind) || !['ready', 'unavailable'].includes(activity.status)) {
      throw new HttpError(400, 'Invalid activity kind or status');
    }
    const result = { id, label, kind: activity.kind, status: activity.status, instruction };
    if (activity.prompts !== undefined) {
      if (!['pairs', 'fours'].includes(activity.kind) || !Array.isArray(activity.prompts) || activity.prompts.length > 64)
        throw new HttpError(400, 'Provide up to 64 suggestions for a pairs or fours invitation');
      result.prompts = [...new Set(activity.prompts.map(item => text(item, 'suggestion', 300)))];
    }
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
  // A named show profile is installed explicitly. Keep the independent Hub's
  // initial programme stable when a particular show's recipe changes.
  return { activeId: 'arrival', activities: programme({ activities: [
    { id: 'arrival', label: 'Waiting to begin', kind: 'waiting', instruction: '' },
    { id: 'polymind', label: 'Polymind', kind: 'activity', instruction: 'Not available yet.' },
    { id: 'analogue', label: 'In-person activity', kind: 'analogue', instruction: 'Put your phone away. Leave this page open — we’ll return to it.' },
    { id: 'collective-voice', label: 'Collective Voice', kind: 'activity', instruction: 'Not available yet.' },
    { id: 'puck', label: 'Puck', kind: 'activity', instruction: 'Not available yet.' },
    { id: 'flight', label: 'Flight', kind: 'activity', instruction: 'Not available yet.' },
    { id: 'closing', label: 'Closing conversation', kind: 'closed', instruction: 'Put your phone away.' },
  ] }) };
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

async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError(415, 'Use application/json');
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new HttpError(413, 'Request too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid JSON'); }
}

// Only configured origins and fixed resource paths may receive app credentials.
export async function appRequest(config, app, id, data, key, preparation = false) {
  if (!['polymind', 'puck', 'flight'].includes(app)) throw new HttpError(404, 'Unknown app');
  const token = config.appTokens?.[app];
  if (!token) throw new HttpError(503, 'App connection is not configured. Ask the installation operator to enable it.');
  if (!config.allowedOrigins.has(config.appOrigins[app])) throw new HttpError(503, 'This app’s participant website is not enabled in Hub. Ask the installation operator to enable it.');
  if (id && !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new HttpError(400, 'Invalid session or room identifier');
  if (preparation && (app !== 'polymind' || !id || !data)) throw new HttpError(400, 'Invalid preparation target');
  if (data && !preparation && (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(key))) throw new HttpError(400, 'Provide a creation request key');
  if (app === 'flight' && (data || (id && id !== 'current'))) throw new HttpError(400, 'Connect the current flight; start the simulator locally.');
  const path = app === 'puck' ? '/api/rooms' : '/api/operator/sessions';
  let response;
  try {
    response = await (config.fetch ?? fetch)(`${config.appOrigins[app]}${path}${id ? `/${id}` : ''}${preparation ? '/preparation' : ''}`, {
      method: preparation ? 'PUT' : data ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { authorization: `Bearer ${token}`, origin: config.appOrigins[app],
        ...(data ? { 'content-type': 'application/json', ...(!preparation ? { 'idempotency-key': key } : {}) } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    if (!response.ok) {
      if (response.status === 409) throw new HttpError(409, preparation ? 'This session has already been used with different preparation. Resume it through its controls.' : 'These creation settings changed after a request was sent. Retry the original settings or start a new creation request.');
      if (response.status === 400) throw new HttpError(400, 'Check the activity name, capacity, question and distinct answer options.');
      if (response.status === 404) throw new HttpError(404, 'This session or room no longer exists. Choose another.');
      throw new HttpError(502, 'Could not access this app. Check its connection and operator credentials.');
    }
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2097152) throw new Error('Response too large');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'Could not confirm the app response. Retry with the same settings, or choose the session from the list.');
  }
}
function appSummary(config, app, value) {
  if (!value || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id))
    throw new HttpError(502, 'The app returned an invalid session or room');
  const title = value.title ?? value.question;
  if (typeof title !== 'string' || !title.trim() || title.length > 240) throw new HttpError(502, 'The app returned an invalid activity name');
  if (app === 'polymind' && !isPolymindInvitation(value.participantUrl, config.appOrigins.polymind, value.id)) {
    throw new HttpError(502, 'Polymind returned an incomplete participant invitation. Check that Hub and Polymind use compatible versions.');
  }
  if (app === 'flight') {
    let destination;
    try { destination = new URL(value.participantUrl); } catch { throw new HttpError(502, 'Flight returned an invalid invitation.'); }
    if (value.id !== 'current' || destination.origin !== config.appOrigins.flight || destination.pathname !== '/' || !flightAudienceSearch.test(destination.search) || destination.hash || destination.username || destination.password)
      throw new HttpError(502, 'Flight returned an invalid invitation.');
  }
  const url = app === 'polymind' || app === 'flight' ? value.participantUrl
    : `${config.appOrigins[app]}/room/${encodeURIComponent(value.id)}`;
  const rawStatus = value.status ?? value.round?.state?.phase ?? 'waiting';
  const statuses = new Set(['writing-open', 'writing-closed', 'microphone-open', 'closed', 'waiting', 'countdown', 'active', 'selected', 'timed-out', 'cancelled', 'interrupted', 'aircraft-ready', 'simulator-loading', 'simulator-disconnected']);
  return { id: value.id, title, url: participantUrl(url, config), status: statuses.has(rawStatus) ? rawStatus : 'unknown', checkedAt: new Date().toISOString() };
}

export async function createHub(config) {
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  await access(config.dataDir, constants.W_OK);
  const statePath = join(config.dataDir, 'state.json');
  let state;
  try {
    state = JSON.parse(await readFile(statePath, 'utf8'));
    exactKeys(state, ['schemaVersion', 'revision', 'updatedAt', 'activeId', 'activities', 'runId', 'pairing', 'fours'], 'saved state');
    if (state.schemaVersion !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 1 ||
        !Number.isFinite(Date.parse(state.updatedAt))) throw new Error('Invalid saved state version');
    // Old manual invitations may be incomplete. Preserve the programme and
    // fail closed for those invitations instead of stopping the whole Hub.
    let repaired = false;
    for (const activity of state.activities ?? []) {
      if (activity.kind === 'activity' && activity.status === 'ready' && typeof activity.url === 'string') {
        const url = new URL(activity.url);
        if (url.origin === config.appOrigins.polymind && !isPolymindInvitation(activity.url, config.appOrigins.polymind)) {
          delete activity.url; activity.status = 'unavailable';
          activity.instruction = 'Invitation needs preparation. Please wait for the organiser.'; repaired = true;
        }
      }
    }
    validateSelection({ activeId: state.activeId, activities: state.activities }, config);
    if (state.pairing !== undefined) {
      validatePairing(state.pairing);
      if (state.pairing.groupSize) throw new Error('Invalid pairs round');
    }
    if (state.fours !== undefined) {
      validatePairing(state.fours);
      if (state.fours.groupSize !== 4 || state.fours.sourceRound !== (state.pairing?.id ?? null)) throw new Error('Invalid fours source');
    }
    if (state.runId !== undefined && (typeof state.runId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(state.runId))) throw new Error('Invalid saved run ID');
    if (repaired) {
      state.revision += 1; state.updatedAt = new Date().toISOString(); await atomicSave(statePath, state);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = { schemaVersion: 1, revision: 1, updatedAt: new Date().toISOString(), ...seed() };
    await atomicSave(statePath, state);
  }
  let writes = Promise.resolve();
  const runs = await openRuns(config, { atomicSave, HttpError, appRequest, appSummary, participantUrl, validateSelection,
    configurePolymind: (id, draft) => appRequest(config, 'polymind', id, draft, undefined, true) });
  if (state.runId) runs.get(state.runId);
  const operatorState = value => {
    const { pairing, fours, ...publicProgramme } = value;
    return { ...publicProgramme, ...(value.runId ? { operatorNotes: runs.get(value.runId).operatorNotes ?? {} } : {}),
      ...(fours ? { foursSummary: { groups: fours.pairs.length, unmatchedPairs: fours.unmatched.length / 2 } } : {}),
      ...(pairing ? { pairingSummary: { pairs: pairing.pairs.length, waiting: pairing.waiting.length } } : {}) };
  };
  function preparePairing(next) {
    const current = next.activities.find(item => item.id === next.activeId);
    if (current.kind === 'pairs' && current.status === 'ready' && next.pairing?.activityId !== current.id) {
      next.pairing = newPairing(current.id);
      delete next.fours;
    }
    if (current.kind === 'fours' && current.status === 'ready' && next.fours?.activityId !== current.id)
      next.fours = newFours(current.id, next.pairing);
    return next;
  }
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
    ['/pairing.js', ['pairing.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']], ['/operator', ['operator.html', 'text/html; charset=utf-8']],
    ['/operator.js', ['operator.js', 'text/javascript; charset=utf-8']],
    ['/run-preparation.js', ['run-preparation.js', 'text/javascript; charset=utf-8']],
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
      if (path.startsWith('/operator') || path === '/run-preparation.js' || path.startsWith('/api/operator/')) {
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
        const current = state.activities.find(activity => activity.id === state.activeId);
        reply(200, { schemaVersion: 1, revision: state.revision, updatedAt: state.updatedAt,
          current: Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'prompts')), nameHandoff: supportsNameHandoff(current, config),
          ...(['pairs', 'fours'].includes(current.kind) && current.status === 'ready' && state[current.kind === 'fours' ? 'fours' : 'pairing'] ? { pairingRound: state[current.kind === 'fours' ? 'fours' : 'pairing'].id } : {}) }); return;
      }
      if (path === '/api/pairing' && req.method === 'POST') {
        if (req.headers.origin !== config.publicOrigin) throw new HttpError(403, 'Same-origin update required');
        const body = await readJson(req);
        exactKeys(body, ['roundId', 'token', 'action', 'expectedPromptRevision'], 'pairing');
        if (typeof body.token !== 'string' || !/^[a-f0-9-]{36}$/.test(body.token) ||
            typeof body.roundId !== 'string' || !['join', 'leave', 'next-prompt', 'skip-prompt'].includes(body.action))
          throw new HttpError(400, 'Invalid pairing request');
        const promptAction = ['next-prompt', 'skip-prompt'].includes(body.action);
        if (promptAction && (!Number.isSafeInteger(body.expectedPromptRevision) || body.expectedPromptRevision < 0 || body.expectedPromptRevision >= Number.MAX_SAFE_INTEGER))
          throw new HttpError(400, 'Provide expectedPromptRevision');
        const key = participantKey(body.token);
        const write = writes.then(async () => {
          const current = state.activities.find(item => item.id === state.activeId);
          const field = current.kind === 'fours' ? 'fours' : 'pairing';
          const saved = state[field];
          if (!['pairs', 'fours'].includes(current.kind) || current.status !== 'ready' || saved?.id !== body.roundId)
            throw new HttpError(409, 'The pairing invitation changed. Refresh this page.');
          let pairing;
          if (promptAction) {
            const number = saved.pairs.findIndex(pair => pair.includes(key)) + 1;
            if (!number) throw new HttpError(409, 'Find your pair or group before requesting a suggestion.');
            pairing = changePairPrompt(saved, number, current.prompts ?? [], body.action, body.expectedPromptRevision);
          } else if (current.kind === 'fours') pairing = saved;
          else if (body.action === 'leave') {
            pairing = structuredClone(saved);
            pairing.waiting = pairing.waiting.filter(item => item.key !== key);
            if (!pairing.waiting.length) pairing.nextBatchAt = null;
          } else pairing = joinPairing(saved, key);
          if (!pairing) throw new HttpError(409, 'Pairing is full. Ask the facilitator for a partner.');
          if (JSON.stringify(pairing) !== JSON.stringify(saved)) {
            const next = { ...state, [field]: pairing };
            await atomicSave(statePath, next); state = next;
          }
          const result = pairingResult(pairing, key, current.prompts ?? []);
          return body.action === 'leave' && result.status !== 'paired' ? { status: 'left' } : result;
        });
        writes = write.catch(() => {});
        reply(200, await write); return;
      }
      if (path === '/api/operator/state' && req.method === 'GET') { reply(200, operatorState(state)); return; }
      if (path === '/api/operator/group-defaults' && req.method === 'GET') { reply(200, programme().filter(item => ['pairs', 'fours'].includes(item.kind))); return; }
      if (path === '/api/operator/profiles' && req.method === 'GET') { reply(200, profiles); return; }
      const runRoute = /^\/api\/operator\/runs(?:\/([a-zA-Z0-9_-]+)(?:\/(prepare|use|puck-options|settings))?)?$/.exec(path);
      if (runRoute && ['GET', 'POST'].includes(req.method)) {
        const [, id, action] = runRoute;
        if (req.method === 'GET' && !action) { reply(200, id ? runs.get(id) : runs.list()); return; }
        if (req.method !== 'POST') throw new HttpError(405, 'Use POST for run actions');
        if (req.headers.origin !== config.publicOrigin) throw new HttpError(403, 'Same-origin update required');
        const body = await readJson(req);
        if (!id) { reply(201, await runs.create(body)); return; }
        if (action === 'puck-options') { reply(200, await runs.setPuckOptions(id, body)); return; }
        if (action === 'settings') { reply(200, await runs.updateSettings(id, body)); return; }
        if (action === 'prepare') {
          exactKeys(body, ['activityId'], 'run preparation');
          reply(200, await runs.prepare(id, body.activityId)); return;
        }
        if (action === 'use') {
          exactKeys(body, ['expectedRevision'], 'programme installation');
          if (!Number.isSafeInteger(body.expectedRevision)) throw new HttpError(400, 'Provide expectedRevision');
          const run = runs.get(id);
          const write = writes.then(async () => {
            if (body.expectedRevision !== state.revision) throw new HttpError(409, 'The programme changed. Refresh saved state before loading a run.');
            if (state.runId === id) {
              // Connect newly prepared resources (notably the room's Puck
              // answers) without replacing live or manually edited invitations.
              const activities = state.activities.map(item => {
                const prepared = run.activities.find(candidate => candidate.id === item.id);
                return item.id !== state.activeId && item.status === 'unavailable' && prepared?.status === 'ready' ? prepared : item;
              });
              if (JSON.stringify(activities) === JSON.stringify(state.activities)) return state;
              validateSelection({ activeId: state.activeId, activities }, config);
              const next = { ...state, revision: state.revision + 1, updatedAt: new Date().toISOString(), activities };
              await atomicSave(statePath, next); state = next; return next;
            }
            const current = state.activities.find(item => item.id === state.activeId);
            if (current.kind !== 'waiting') throw new HttpError(409, 'Return to waiting before using another programme.');
            // Retain the exact current invitation: installing a programme is
            // preparation, not a cue, even when its waiting copy differs.
            const activities = run.activities.filter(item => item.kind !== 'waiting' && item.id !== current.id);
            activities.unshift(current);
            const selection = validateSelection({ activeId: current.id, activities }, config);
            const next = { schemaVersion: 1, revision: state.revision + 1, updatedAt: new Date().toISOString(), ...selection, runId: id };
            await atomicSave(statePath, next); state = next; return next;
          });
          writes = write.catch(() => {});
          reply(200, operatorState(await write)); return;
        }
        throw new HttpError(405, 'Choose a run preparation action');
      }
      if (path === '/api/operator/config' && req.method === 'GET') {
        reply(200, { allowedOrigins: [...config.allowedOrigins], appOrigins: config.appOrigins, integrations: Object.fromEntries(['polymind', 'puck', 'flight'].map(app => [app, Boolean(config.appTokens?.[app]) && config.allowedOrigins.has(config.appOrigins[app])])) }); return;
      }
      const appRoute = /^\/api\/operator\/apps\/(polymind|puck|flight)\/sessions(?:\/([a-zA-Z0-9_-]+))?$/.exec(path);
      if (appRoute && ['GET', 'POST'].includes(req.method)) {
        const [, app, id] = appRoute;
        if (req.method === 'POST') {
          if (req.headers.origin !== config.publicOrigin) throw new HttpError(403, 'Same-origin update required');
          if (id) throw new HttpError(405, 'Create through the session collection');
          const body = await readJson(req);
          exactKeys(body, ['requestId', 'settings'], 'creation');
          exactKeys(body.settings, app === 'polymind' ? ['title', 'capacity'] : ['question', 'options', 'mode'], 'settings');
          const created = await appRequest(config, app, undefined, body.settings, body.requestId);
          if (!created || typeof created.id !== 'string') throw new HttpError(502, 'The app did not return a session identifier. Retry the same request.');
          // Read back using the same resource API used by the tool itself.
          const result = await appRequest(config, app, created.id);
          reply(201, appSummary(config, app, result)); return;
        }
        const result = await appRequest(config, app, id);
        if (id) reply(200, appSummary(config, app, result));
        else {
          if (!Array.isArray(result)) throw new HttpError(502, 'The app returned an invalid session list');
          reply(200, result.slice(0, 200).map(value => appSummary(config, app, value)));
        }
        return;
      }
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
            updatedAt: new Date().toISOString(), ...selection, ...(state.runId ? { runId: state.runId } : {}), ...(state.pairing ? { pairing: state.pairing } : {}), ...(state.fours ? { fours: state.fours } : {}) };
          preparePairing(next);
          await atomicSave(statePath, next);
          state = next;
          return next;
        });
        writes = write.catch(() => {});
        reply(200, operatorState(await write)); return;
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
