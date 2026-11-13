import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { configuration, createHub } from '../server.mjs';

const password = 'synthetic-private-password-for-run-tests';
const token = 'synthetic-app-operator-token-with-more-than-32-characters';
const authorization = `Basic ${Buffer.from(`organiser:${password}`).toString('base64')}`;
const origin = 'https://we.supercollective.io';
const directories = new Set();

after(async () => Promise.all([...directories].map(path => rm(path, { recursive: true, force: true }))));

function settings(overrides = {}) {
  return {
    writingQuestion: 'What would you change together?',
    voiceQuestion: 'What would you change together?',
    model: { provider: 'ollama', model: 'local-test-model', maxInputCharacters: 12000, maxOutputTokens: 1000, timeoutMs: 30000 },
    puckQuestion: 'Which option would you choose?', puckOptions: [], flightUrl: '',
    ...overrides,
  };
}

function fakeUpstream({ failAfterCommitOnce = false, failPuckAfterCommitOnce = false } = {}) {
  const calls = [];
  const polymindSessions = new Map();
  const puckRooms = new Map();
  const idempotency = new Map();
  const puckIdempotency = new Map();
  let failNextCreate = failAfterCommitOnce;
  let failNextPuckCreate = failPuckAfterCommitOnce;
  const fetch = async (url, options) => {
    const parsed = new URL(url);
    const method = options.method;
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, method, headers: options.headers, body });
    if (parsed.hostname === 'polymind.supercollective.io') {
      if (method === 'POST' && parsed.pathname === '/api/operator/sessions') {
        const key = options.headers['idempotency-key'];
        let session = idempotency.get(key);
        if (!session) {
          const id = `synthetic-session-${idempotency.size + 1}`;
          session = { id, title: body.title, status: 'writing-closed',
            participantUrl: `https://polymind.supercollective.io/?session=${id}` };
          idempotency.set(key, session);
          polymindSessions.set(id, { ...session });
        }
        if (failNextCreate) {
          failNextCreate = false;
          return new Response('synthetic upstream failure', { status: 500 });
        }
        return json(session, 201);
      }
      const preparation = /^\/api\/operator\/sessions\/([^/]+)\/preparation$/.exec(parsed.pathname);
      if (method === 'PUT' && preparation) {
        const session = polymindSessions.get(preparation[1]);
        if (!session) return json({ error: 'missing' }, 404);
        session.preparation = body;
        return json(body);
      }
      const selected = /^\/api\/operator\/sessions\/([^/]+)$/.exec(parsed.pathname);
      if (method === 'GET' && selected) {
        const session = polymindSessions.get(selected[1]);
        return session ? json(session) : json({ error: 'missing' }, 404);
      }
    }
    if (parsed.hostname === 'puck.supercollective.io') {
      if (method === 'POST' && parsed.pathname === '/api/rooms') {
        const key = options.headers['idempotency-key'];
        let room = puckIdempotency.get(key);
        if (!room) {
          const id = `synthetic-room-${puckIdempotency.size + 1}`;
          room = { id, question: body.question, status: 'waiting' };
          puckIdempotency.set(key, room);
          puckRooms.set(id, room);
        }
        if (failNextPuckCreate) {
          failNextPuckCreate = false;
          return new Response('synthetic upstream failure', { status: 500 });
        }
        return json(room, 201);
      }
      const selected = /^\/api\/rooms\/([^/]+)$/.exec(parsed.pathname);
      if (method === 'GET' && selected) {
        const room = puckRooms.get(selected[1]);
        return room ? json(room) : json({ error: 'missing' }, 404);
      }
    }
    return json({ error: 'unexpected upstream route' }, 404);
  };
  return { calls, polymindSessions, puckRooms, idempotency, puckIdempotency, fetch };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

async function start({ dataDir, upstream = fakeUpstream(), configured = true } = {}) {
  if (!dataDir) {
    dataDir = await mkdtemp(join(tmpdir(), 'hub-run-profiles-'));
    directories.add(dataDir);
  }
  const env = {
    HUB_OPERATOR_PASSWORD: password,
    HUB_DATA_DIR: dataDir,
    HUB_ALLOWED_ORIGINS: 'https://polymind.supercollective.io,https://puck.supercollective.io',
  };
  const config = configuration(env);
  const server = await createHub({ ...config,
    appTokens: configured ? { polymind: token, puck: token } : {}, fetch: upstream.fetch });
  return { server, dataDir, upstream, close: async () => {} };
}

async function call(app, path, { method = 'GET', body, headers = {} } = {}) {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(request, { url: path, method, headers: {
    host: 'we.supercollective.io', authorization,
    ...(body === undefined ? {} : { origin, 'content-type': 'application/json' }),
    ...headers,
  } });
  return new Promise(resolve => {
    let status;
    app.server.emit('request', request, {
      writeHead(code) { status = code; },
      end(value) { resolve({ status, body: JSON.parse(value) }); },
    });
  });
}

async function createRun(app, { mode = 'rehearsal', requestId = `request-${randomUUID()}`, runSettings = settings() } = {}) {
  return call(app, '/api/operator/runs', { method: 'POST', body: {
    requestId, profileId: 'zkm-production-show-14-11-2026', mode, settings: runSettings,
  } });
}

test('profile catalog and run creation are private preparation and do not call apps or change the live activity', async () => {
  const upstream = fakeUpstream();
  const app = await start({ upstream });
  try {
    const profiles = await call(app, '/api/operator/profiles');
    assert.equal(profiles.status, 200);
    assert.equal(profiles.body[0].id, 'zkm-production-show-14-11-2026');
    const before = await call(app, '/api/current', { headers: {} });
    const created = await createRun(app);
    assert.equal(created.status, 201);
    assert.deepEqual(upstream.calls, []);
    const stored = await call(app, `/api/operator/runs/${created.body.id}`);
    assert.deepEqual(stored.body.bindings, {});
    assert.equal((await call(app, '/api/operator/runs')).body.some(run => run.id === created.body.id), true);
    assert.equal(stored.body.activities.find(item => item.id === 'polymind').status, 'unavailable');
    const after = await call(app, '/api/current');
    assert.equal(after.body.revision, before.body.revision);
    assert.deepEqual(after.body.current, before.body.current);
    assert.equal(after.body.current.id, 'arrival');
    assert.equal(JSON.stringify(after.body).includes('local-test-model'), false);
  } finally { await app.close(); }
});

test('Polymind prepare configures only a draft, retries the bound resource, and survives Hub restart', async () => {
  const upstream = fakeUpstream();
  const app = await start({ upstream });
  let runId;
  try {
    const created = await createRun(app);
    runId = created.body.id;
    const prepared = await call(app, `/api/operator/runs/${runId}/prepare`, { method: 'POST', body: { activityId: 'polymind' } });
    assert.equal(prepared.status, 200);
    assert.equal(prepared.body.resumed, false);
    assert.equal(prepared.body.activity.url, `https://polymind.supercollective.io/?session=${prepared.body.activity.id}`);
    assert.deepEqual(upstream.calls.map(item => item.method), ['POST', 'GET', 'PUT']);
    assert.deepEqual(upstream.calls.map(item => new URL(item.url).pathname), [
      '/api/operator/sessions',
      `/api/operator/sessions/${prepared.body.activity.id}`,
      `/api/operator/sessions/${prepared.body.activity.id}/preparation`,
    ]);
    assert.deepEqual(upstream.calls[2].body, {
      mode: 'bounded', prompt: 'What would you change together?', model: settings().model,
    });
    const publicCurrent = await call(app, '/api/current');
    assert.equal(publicCurrent.body.current.id, 'arrival');
    assert.equal(JSON.stringify(publicCurrent.body).includes('profileId'), false);
    assert.equal(JSON.stringify(publicCurrent.body).includes('local-test-model'), false);
    assert.equal(JSON.stringify(publicCurrent.body).includes(token), false);

    const retried = await call(app, `/api/operator/runs/${runId}/prepare`, { method: 'POST', body: { activityId: 'polymind' } });
    assert.equal(retried.status, 200);
    assert.equal(retried.body.resumed, true);
    assert.equal(upstream.calls.length, 4);
    assert.equal(upstream.calls[3].method, 'GET');
  } finally { await app.close(); }

  const restarted = await start({ dataDir: app.dataDir, upstream });
  try {
    const recovered = await call(restarted, `/api/operator/runs/${runId}`);
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.bindings.polymind.id, 'synthetic-session-1');
    const resumed = await call(restarted, `/api/operator/runs/${runId}/prepare`, { method: 'POST', body: { activityId: 'polymind' } });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.resumed, true);
    assert.equal(upstream.calls.at(-1).method, 'GET');
    assert.equal(upstream.calls.filter(item => item.method === 'POST').length, 1);
  } finally { await restarted.close(); }
});

test('Collective Voice selects continuous preparation and Puck prepares a room through its fixed API', async () => {
  const upstream = fakeUpstream();
  const app = await start({ upstream });
  try {
    const created = await createRun(app);
    const voice = await call(app, `/api/operator/runs/${created.body.id}/prepare`, { method: 'POST', body: { activityId: 'collective-voice' } });
    assert.equal(voice.status, 200);
    const draft = upstream.calls.find(item => item.method === 'PUT').body;
    assert.equal(draft.mode, 'continuous');
    assert.equal(draft.prompt, 'What would you change together?');
    const submitted = await call(app, `/api/operator/runs/${created.body.id}/puck-options`, { method: 'POST', body: { options: ['A', 'B'], expectedRevision: voice.body.run.revision } });
    assert.equal(submitted.status, 200);
    const puck = await call(app, `/api/operator/runs/${created.body.id}/prepare`, { method: 'POST', body: { activityId: 'puck' } });
    assert.equal(puck.status, 200);
    assert.equal(puck.body.activity.url, `https://puck.supercollective.io/room/${puck.body.activity.id}`);
    const puckCreate = upstream.calls.find(item => item.method === 'POST' && new URL(item.url).hostname === 'puck.supercollective.io');
    assert.deepEqual(puckCreate.body, { question: 'Which option would you choose?', options: ['A', 'B'], mode: 'baseline' });
    assert.equal(upstream.calls.some(item => new URL(item.url).pathname.endsWith('/operations')), false);
  } finally { await app.close(); }
});

test('rehearsals get distinct resources and each profile permits only one production run', async () => {
  const upstream = fakeUpstream();
  const app = await start({ upstream });
  try {
    const first = await createRun(app, { requestId: 'rehearsal-request-0001' });
    const second = await createRun(app, { requestId: 'rehearsal-request-0002' });
    const firstPrepared = await call(app, `/api/operator/runs/${first.body.id}/prepare`, { method: 'POST', body: { activityId: 'polymind' } });
    const secondPrepared = await call(app, `/api/operator/runs/${second.body.id}/prepare`, { method: 'POST', body: { activityId: 'polymind' } });
    assert.notEqual(firstPrepared.body.activity.id, secondPrepared.body.activity.id);
    assert.equal(upstream.calls.filter(item => item.method === 'POST').length, 2);

    const production = await createRun(app, { mode: 'production', requestId: 'production-request-0001' });
    const replay = await createRun(app, { mode: 'production', requestId: 'production-request-0001' });
    assert.equal(production.status, 201);
    assert.equal(replay.body.id, production.body.id);
    const duplicateProduction = await createRun(app, { mode: 'production', requestId: 'production-request-0002' });
    assert.equal(duplicateProduction.status, 409);
  } finally { await app.close(); }
});

test('Puck waits for room options, freezes them before an uncertain create, and retries the original run request', async () => {
  const upstream = fakeUpstream({ failPuckAfterCommitOnce: true });
  const app = await start({ upstream });
  try {
    const requestId = 'deferred-puck-request-0001';
    const created = await createRun(app, { requestId });
    const early = await call(app, `/api/operator/runs/${created.body.id}/prepare`, { method: 'POST', body: { activityId: 'puck' } });
    assert.equal(early.status, 409);
    assert.equal(upstream.calls.length, 0);
    assert.equal((await call(app, `/api/operator/runs/${created.body.id}`)).body.settings.puckOptions.length, 0);

    const options = ['Room proposal one', 'Room proposal two'];
    const updated = await call(app, `/api/operator/runs/${created.body.id}/puck-options`, { method: 'POST', body: { options, expectedRevision: created.body.revision } });
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body.settings.puckOptions, options);
    const stale = await call(app, `/api/operator/runs/${created.body.id}/puck-options`, { method: 'POST', body: { options: ['Stale one', 'Stale two'], expectedRevision: created.body.revision } });
    assert.equal(stale.status, 409);
    assert.deepEqual((await call(app, `/api/operator/runs/${created.body.id}`)).body.settings.puckOptions, options);

    // Retrying the original create request uses its original fingerprint even
    // though the room options have since been collected and saved.
    const replay = await createRun(app, { requestId, runSettings: settings() });
    assert.equal(replay.status, 201);
    assert.equal(replay.body.id, created.body.id);
    assert.deepEqual(replay.body.settings.puckOptions, options);

    const uncertain = await call(app, `/api/operator/runs/${created.body.id}/prepare`, { method: 'POST', body: { activityId: 'puck' } });
    assert.equal(uncertain.status, 502);
    assert.equal(upstream.puckRooms.size, 1);
    assert.deepEqual(upstream.calls.at(-1).body.options, options);
    const currentRun = await call(app, `/api/operator/runs/${created.body.id}`);
    const changed = await call(app, `/api/operator/runs/${created.body.id}/puck-options`, { method: 'POST', body: { options: ['Changed one', 'Changed two'], expectedRevision: currentRun.body.revision } });
    assert.equal(changed.status, 409);

    const recovered = await call(app, `/api/operator/runs/${created.body.id}/prepare`, { method: 'POST', body: { activityId: 'puck' } });
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.activity.id, 'synthetic-room-1');
    const creates = upstream.calls.filter(item => item.method === 'POST' && new URL(item.url).hostname === 'puck.supercollective.io');
    assert.equal(creates.length, 2);
    assert.equal(creates[0].headers['idempotency-key'], `${created.body.id}-puck`);
    assert.equal(creates[1].headers['idempotency-key'], creates[0].headers['idempotency-key']);
    assert.deepEqual(creates[1].body.options, options);
    assert.equal(upstream.puckIdempotency.size, 1);
  } finally { await app.close(); }
});

test('missing Puck configuration does not freeze proposed options', async () => {
  const upstream = fakeUpstream();
  const app = await start({ upstream, configured: false });
  try {
    const choices = ['Room proposal one', 'Room proposal two'];
    const created = await createRun(app, { requestId: 'puck-unconfigured-request-01', runSettings: settings({ puckOptions: choices }) });
    const failed = await call(app, `/api/operator/runs/${created.body.id}/prepare`, { method: 'POST', body: { activityId: 'puck' } });
    assert.equal(failed.status, 503);
    const saved = await call(app, `/api/operator/runs/${created.body.id}`);
    assert.equal(saved.body.preparationStarted, undefined);
    assert.equal(saved.body.puckPreparationStarted, undefined);
    assert.equal(saved.body.revision, created.body.revision);
    const corrected = await call(app, `/api/operator/runs/${created.body.id}/puck-options`, {
      method: 'POST', body: { options: ['Corrected one', 'Corrected two'], expectedRevision: saved.body.revision },
    });
    assert.equal(corrected.status, 200);
    assert.deepEqual(corrected.body.settings.puckOptions, ['Corrected one', 'Corrected two']);
    assert.equal(upstream.calls.length, 0);
  } finally { await app.close(); }
});

test('unprepared production settings support revision-checked edits and original create replay', async () => {
  const app = await start({ upstream: fakeUpstream() });
  try {
    const requestId = 'editable-production-request-01';
    const original = settings();
    const created = await createRun(app, { mode: 'production', requestId, runSettings: original });
    const changed = settings({ writingQuestion: 'Corrected question before preparation.' });
    const edited = await call(app, `/api/operator/runs/${created.body.id}/settings`, {
      method: 'POST', body: { settings: changed, expectedRevision: created.body.revision },
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.settings.writingQuestion, changed.writingQuestion);
    assert.equal(edited.body.revision, created.body.revision + 1);

    const stale = await call(app, `/api/operator/runs/${created.body.id}/settings`, {
      method: 'POST', body: { settings: original, expectedRevision: created.body.revision },
    });
    assert.equal(stale.status, 409);
    const replay = await createRun(app, { mode: 'production', requestId, runSettings: original });
    assert.equal(replay.status, 201);
    assert.equal(replay.body.id, created.body.id);
    assert.equal(replay.body.settings.writingQuestion, changed.writingQuestion);
  } finally { await app.close(); }
});

test('run settings cannot change after an outbound preparation becomes uncertain', async () => {
  const upstream = fakeUpstream({ failAfterCommitOnce: true });
  const app = await start({ upstream });
  try {
    const created = await createRun(app, { requestId: 'settings-frozen-request-0001' });
    const failed = await call(app, `/api/operator/runs/${created.body.id}/prepare`, { method: 'POST', body: { activityId: 'polymind' } });
    assert.equal(failed.status, 502);
    const saved = await call(app, `/api/operator/runs/${created.body.id}`);
    assert.equal(saved.body.preparationStarted, true);
    const attempt = await call(app, `/api/operator/runs/${created.body.id}/settings`, {
      method: 'POST', body: { settings: settings({ writingQuestion: 'Different after request.' }), expectedRevision: saved.body.revision },
    });
    assert.equal(attempt.status, 409);
    assert.equal((await call(app, `/api/operator/runs/${created.body.id}`)).body.settings.writingQuestion, settings().writingQuestion);
  } finally { await app.close(); }
});

test('an installed run connects later Puck preparation without replacing the current non-Puck cue', async () => {
  const app = await start({ upstream: fakeUpstream() });
  try {
    const created = await createRun(app, { requestId: 'late-puck-request-0001' });
    const polymind = await call(app, `/api/operator/runs/${created.body.id}/prepare`, { method: 'POST', body: { activityId: 'polymind' } });
    const installed = await call(app, `/api/operator/runs/${created.body.id}/use`, { method: 'POST', body: { expectedRevision: 1 } });
    assert.equal(installed.status, 200);

    const currentState = await call(app, '/api/operator/state');
    const state = currentState.body;
    state.activeId = 'analogue';
    state.activities.find(item => item.id === 'analogue').instruction = 'Keep the current spoken cue.';
    const cueSaved = await call(app, '/api/operator/state', { method: 'PUT', body: {
      expectedRevision: state.revision, activeId: state.activeId, activities: state.activities,
    } });
    assert.equal(cueSaved.status, 200);
    const cueBeforePreparation = (await call(app, '/api/current')).body.current;
    assert.equal(cueBeforePreparation.id, 'analogue');

    const choices = ['A room choice', 'Another room choice'];
    assert.equal((await call(app, `/api/operator/runs/${created.body.id}/puck-options`, { method: 'POST', body: { options: choices, expectedRevision: polymind.body.run.revision } })).status, 200);
    const puck = await call(app, `/api/operator/runs/${created.body.id}/prepare`, { method: 'POST', body: { activityId: 'puck' } });
    assert.equal(puck.status, 200);
    const connected = await call(app, `/api/operator/runs/${created.body.id}/use`, { method: 'POST', body: { expectedRevision: cueSaved.body.revision } });
    assert.equal(connected.status, 200);
    assert.equal(connected.body.activeId, 'analogue');
    assert.deepEqual((await call(app, '/api/current')).body.current, cueBeforePreparation);
    assert.equal(connected.body.activities.find(item => item.id === 'puck').status, 'ready');
    assert.equal(connected.body.activities.find(item => item.id === 'polymind').url, polymind.body.activity.url);
  } finally { await app.close(); }
});

test('operator authentication and same-origin checks cover profile and run routes', async () => {
  const app = await start();
  try {
    assert.equal((await call(app, '/api/operator/profiles', { headers: { authorization: '' } })).status, 401);
    assert.equal((await call(app, '/api/operator/runs', { headers: { authorization: '' } })).status, 401);
    const body = { requestId: 'auth-test-request-0001', profileId: 'zkm-production-show-14-11-2026', mode: 'rehearsal', settings: settings() };
    assert.equal((await call(app, '/api/operator/runs', { method: 'POST', body, headers: { origin: 'https://foreign.example' } })).status, 403);
    assert.equal((await call(app, '/api/operator/runs', { method: 'POST', body, headers: { authorization: '' } })).status, 401);
  } finally { await app.close(); }
});

test('stale programme use and use over a live activity are refused while waiting is retained exactly', async () => {
  const app = await start({ upstream: fakeUpstream() });
  try {
    const waitingBefore = (await call(app, '/api/operator/state')).body.activities.find(item => item.id === 'arrival');
    const first = await createRun(app, { requestId: 'use-test-request-000001' });
    const prepared = await call(app, `/api/operator/runs/${first.body.id}/prepare`, { method: 'POST', body: { activityId: 'polymind' } });
    const stale = await call(app, `/api/operator/runs/${first.body.id}/use`, { method: 'POST', body: { expectedRevision: 0 } });
    assert.equal(stale.status, 409);
    const installed = await call(app, `/api/operator/runs/${first.body.id}/use`, { method: 'POST', body: { expectedRevision: 1 } });
    assert.equal(installed.status, 200);
    assert.equal(installed.body.activeId, 'arrival');
    assert.deepEqual(installed.body.activities.find(item => item.id === 'arrival'), waitingBefore);
    assert.equal(installed.body.activities.find(item => item.id === 'polymind').url, prepared.body.activity.url);
    const publicWaiting = await call(app, '/api/current');
    assert.deepEqual(publicWaiting.body.current, waitingBefore);
    for (const key of ['profileId', 'model', 'token', 'credential', 'bindings']) assert.equal(JSON.stringify(publicWaiting.body).includes(key), false);

    const liveState = (await call(app, '/api/operator/state')).body;
    liveState.activeId = 'polymind';
    assert.equal((await call(app, '/api/operator/state', { method: 'PUT', body: {
      expectedRevision: liveState.revision, activeId: liveState.activeId, activities: liveState.activities,
    } })).status, 200);
    const second = await createRun(app, { requestId: 'use-test-request-000002' });
    const refused = await call(app, `/api/operator/runs/${second.body.id}/use`, { method: 'POST', body: { expectedRevision: 3 } });
    assert.equal(refused.status, 409);
  } finally { await app.close(); }
});

test('missing provider configuration and an ambiguous upstream failure preserve the run and reuse its stable key', async () => {
  const upstream = fakeUpstream({ failAfterCommitOnce: true });
  const unconfigured = await start({ upstream, configured: false });
  let runId;
  try {
    const created = await createRun(unconfigured, { requestId: 'stable-retry-request-0001' });
    runId = created.body.id;
    const missing = await call(unconfigured, `/api/operator/runs/${runId}/prepare`, { method: 'POST', body: { activityId: 'polymind' } });
    assert.equal(missing.status, 503);
    assert.equal((await call(unconfigured, `/api/operator/runs/${runId}`)).body.id, runId);
    assert.equal(upstream.calls.length, 0);
  } finally { await unconfigured.close(); }

  const configured = await start({ dataDir: unconfigured.dataDir, upstream });
  try {
    const failed = await call(configured, `/api/operator/runs/${runId}/prepare`, { method: 'POST', body: { activityId: 'polymind' } });
    assert.equal(failed.status, 502);
    const retry = await call(configured, `/api/operator/runs/${runId}/prepare`, { method: 'POST', body: { activityId: 'polymind' } });
    assert.equal(retry.status, 200);
    const creates = upstream.calls.filter(item => item.method === 'POST');
    assert.equal(creates.length, 2);
    assert.equal(creates[0].headers['idempotency-key'], `${runId}-polymind`);
    assert.equal(creates[1].headers['idempotency-key'], creates[0].headers['idempotency-key']);
    assert.equal(upstream.idempotency.size, 1);
    assert.equal((await call(configured, `/api/operator/runs/${runId}`)).body.bindings.polymind.id, 'synthetic-session-1');
  } finally { await configured.close(); }
});

test('1–2–4–All keeps one Polymind session, private cues and the programme order across restart', async () => {
  const upstream = fakeUpstream();
  const app = await start({ upstream });
  let runId;
  let expectedInvitation;
  const expectedOrder = ['arrival', 'polymind', 'analogue', 'four', 'polymind-all', 'collective-voice', 'puck', 'flight'];
  try {
    const created = await createRun(app, { requestId: 'one-two-four-all-request-0001' });
    runId = created.body.id;
    assert.deepEqual(created.body.activities.map(item => item.id), expectedOrder);
    assert.equal(created.body.activities.some(item => item.id === 'closing'), false);
    assert.equal(created.body.activityBindings.polymind.includes('polymind-all'), true);
    assert.equal(typeof created.body.operatorNotes.polymind, 'string');
    assert.equal(typeof created.body.operatorNotes['polymind-all'], 'string');

    const individual = await call(app, `/api/operator/runs/${runId}/prepare`, { method: 'POST', body: { activityId: 'polymind' } });
    assert.equal(individual.status, 200);
    expectedInvitation = individual.body.activity.url;
    const individualStep = individual.body.run.activities.find(item => item.id === 'polymind');
    const allStep = individual.body.run.activities.find(item => item.id === 'polymind-all');
    assert.equal(individualStep.url, expectedInvitation);
    assert.equal(allStep.url, expectedInvitation);
    assert.equal(individualStep.status, 'ready');
    assert.equal(allStep.status, 'ready');
    assert.equal(individual.body.run.bindings.polymind.id, individual.body.activity.id);

    const createCalls = upstream.calls.filter(item => item.method === 'POST' && item.headers['idempotency-key'] === `${runId}-polymind`);
    const draftCalls = upstream.calls.filter(item => item.method === 'PUT' && new URL(item.url).pathname === `/api/operator/sessions/${individual.body.activity.id}/preparation`);
    assert.equal(createCalls.length, 1);
    assert.equal(draftCalls.length, 1);

    // Collective Voice has its own session. Cue changes must not make
    // additional resources as the room moves through 1, 2, 4 and All.
    const voice = await call(app, `/api/operator/runs/${runId}/prepare`, { method: 'POST', body: { activityId: 'collective-voice' } });
    assert.equal(voice.status, 200);
    const used = await call(app, `/api/operator/runs/${runId}/use`, { method: 'POST', body: { expectedRevision: 1 } });
    assert.equal(used.status, 200);
    assert.deepEqual(used.body.activities.map(item => item.id), expectedOrder);
    assert.equal(used.body.operatorNotes.four, created.body.operatorNotes.four);
    assert.equal(used.body.activities.find(item => item.id === 'polymind-all').url, expectedInvitation);
  } finally { await app.close(); }

  const restarted = await start({ dataDir: app.dataDir, upstream });
  try {
    const savedRun = await call(restarted, `/api/operator/runs/${runId}`);
    assert.equal(savedRun.status, 200);
    assert.deepEqual(savedRun.body.activities.map(item => item.id), expectedOrder);
    assert.equal(savedRun.body.operatorNotes.polymind, (await call(restarted, '/api/operator/profiles')).body[0].operatorNotes.polymind);
    assert.deepEqual(savedRun.body.activityBindings, { polymind: ['polymind', 'polymind-all'] });

    const privateState = await call(restarted, '/api/operator/state');
    assert.deepEqual(privateState.body.activities.map(item => item.id), expectedOrder);
    assert.deepEqual(privateState.body.operatorNotes, savedRun.body.operatorNotes);

    const resumed = await call(restarted, `/api/operator/runs/${runId}/prepare`, { method: 'POST', body: { activityId: 'polymind' } });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.resumed, true);
    assert.equal(resumed.body.activity.url, expectedInvitation);
    assert.deepEqual(resumed.body.run.activities.map(item => item.id), expectedOrder);
    assert.equal(upstream.calls.filter(item => item.method === 'POST' && item.headers['idempotency-key'] === `${runId}-polymind`).length, 1);
    assert.equal(upstream.calls.filter(item => item.method === 'PUT' && new URL(item.url).pathname === `/api/operator/sessions/${resumed.body.activity.id}/preparation`).length, 1);

    const upstreamCallsBeforeCues = upstream.calls.length;
    for (const id of ['polymind', 'analogue', 'four', 'polymind-all']) {
      const currentState = await call(restarted, '/api/operator/state');
      const changed = await call(restarted, '/api/operator/state', { method: 'PUT', body: {
        expectedRevision: currentState.body.revision,
        activeId: id,
        activities: currentState.body.activities,
      } });
      assert.equal(changed.status, 200);
      assert.equal(changed.body.activeId, id);
      assert.equal(changed.body.activities.find(item => item.id === 'polymind-all').url, expectedInvitation);
      assert.equal(changed.body.operatorNotes['polymind-all'], savedRun.body.operatorNotes['polymind-all']);

      const current = await call(restarted, '/api/current');
      assert.equal(current.body.current.id, id);
      assert.equal(current.body.current.url, id === 'polymind' || id === 'polymind-all' ? expectedInvitation : undefined);
      assert.equal(JSON.stringify(current.body).includes('operatorNotes'), false);
      assert.equal(JSON.stringify(current.body).includes('activityBindings'), false);
      assert.equal(JSON.stringify(current.body).includes('Keep the frozen Polymind round from 1 intact.'), false);
    }
    assert.equal(upstream.calls.length, upstreamCallsBeforeCues);
  } finally { await restarted.close(); }
});
