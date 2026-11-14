import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { configuration, createHub, participantUrl, supportsNameHandoff, validateSelection } from '../server.mjs';

let temporary;
let config;
const password = 'synthetic-private-password-for-tests';
const authorization = `Basic ${Buffer.from(`organiser:${password}`).toString('base64')}`;
const authenticated = { authorization };
const mutation = { authorization, origin: 'https://we.supercollective.io', 'content-type': 'application/json' };

before(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'rehearsing-we-hub-'));
  config = configuration({ HUB_OPERATOR_PASSWORD: password, HUB_DATA_DIR: temporary });
});
after(async () => { await rm(temporary, { recursive: true, force: true }); });

async function serve(directory = temporary) {
  const server = await createHub({ ...config, dataDir: directory });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { server, base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}
async function put(base, state, headers = mutation) {
  return fetch(`${base}/api/operator/state`, { method: 'PUT', headers,
    body: JSON.stringify({ expectedRevision: state.revision, activeId: state.activeId, activities: state.activities }) });
}

// One real HTTP transition sequence checks authentication, public boundaries,
// simultaneous operator changes, persistence and a late participant's view.
test('operator transitions survive restart and public output contains only the current invitation', async () => {
  const app = await serve();
  try {
    const initial = await (await fetch(`${app.base}/api/current`)).json();
    assert.equal(initial.current.kind, 'waiting');
    assert.equal(initial.revision, 1);
    assert.equal(initial.activities, undefined);
    assert.equal(JSON.stringify(initial).includes(password), false);
    assert.equal((await fetch(`${app.base}/operator`)).status, 401);
    assert.equal((await fetch(`${app.base}/operator.js`)).status, 401);
    assert.equal((await fetch(`${app.base}/api/operator/state`)).status, 401);
    assert.equal((await fetch(`${app.base}/api/operator/state`, { method: 'PUT' })).status, 401);
    const privateResponse = await fetch(`${app.base}/operator`, { headers: authenticated });
    assert.equal(privateResponse.status, 200);
    assert.match(await privateResponse.text(), /id="programme"/);
    const state = await (await fetch(`${app.base}/api/operator/state`, { headers: authenticated })).json();
    const digital = state.activities.find(activity => activity.id === 'polymind');
    digital.status = 'ready'; digital.url = 'https://polymind.supercollective.io/?session=synthetic';
    state.activeId = digital.id;
    assert.equal((await put(app.base, state, { ...mutation, origin: 'https://untrusted.example' })).status, 403);
    assert.equal((await put(app.base, state, { authorization, 'content-type': 'application/json' })).status, 403);
    assert.equal((await put(app.base, state)).status, 200);
    assert.equal((await put(app.base, state)).status, 409);
    const current = await (await fetch(`${app.base}/api/current`)).json();
    assert.equal(current.revision, 2);
    assert.equal(current.current.url, digital.url);
    assert.equal(current.current.id, 'polymind');
    assert.equal((await fetch(`${app.base}/healthz`)).status, 200);
    const invalidHost = await new Promise((resolve, reject) => {
      const probe = request(`${app.base}/`, { headers: { host: 'untrusted.example' } }, response => {
        response.resume(); resolve(response.statusCode);
      });
      probe.on('error', reject); probe.end();
    });
    assert.equal(invalidHost, 403);
    const page = await fetch(`${app.base}/`);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.equal((await page.text()).includes(password), false);
    state.revision = 2; state.activeId = 'analogue';
    const transitions = await Promise.all([put(app.base, state), put(app.base, state)]);
    assert.deepEqual(transitions.map(response => response.status).sort(), [200, 409]);
    const analogue = await (await fetch(`${app.base}/api/current`)).json();
    assert.equal(analogue.current.kind, 'analogue');
    assert.equal(analogue.current.url, undefined);
  } finally { await app.close(); }
  const restarted = await serve();
  try {
    const saved = await (await fetch(`${restarted.base}/api/operator/state`, { headers: authenticated })).json();
    assert.equal(saved.revision, 3);
    assert.equal(saved.activeId, 'analogue');
    saved.activeId = 'closing';
    assert.equal((await put(restarted.base, saved)).status, 200);
    const lateArrival = await (await fetch(`${restarted.base}/api/current`)).json();
    assert.equal(lateArrival.current.kind, 'closed');
    assert.equal(lateArrival.current.url, undefined);
    assert.equal(lateArrival.revision, 4);
    assert.equal(JSON.parse(await readFile(join(temporary, 'state.json'), 'utf8')).revision, 4);
  } finally { await restarted.close(); }
});

test('destination validation rejects operator links and credentials', () => {
  const bad = [
    'http://polymind.supercollective.io/join', 'https://untrusted.example/join',
    'https://user:password@polymind.supercollective.io/join',
    'https://polymind.supercollective.io/operator', 'https://polymind.supercollective.io/%61dmin',
    'https://polymind.supercollective.io/%2561dmin',
    'https://polymind.supercollective.io/join?operatorToken=private',
    'https://polymind.supercollective.io/join?api_key=private',
    'https://polymind.supercollective.io/join#private',
  ];
  for (const url of bad) assert.throws(() => participantUrl(url, config), { status: 400 }, url);
  assert.throws(() => participantUrl('https://polymind.supercollective.io/join?session=public', config), { status: 400 });
  assert.equal(participantUrl('https://polymind.supercollective.io/?session=public', config),
    'https://polymind.supercollective.io/?session=public');
});

test('upgrade keeps the programme but makes incomplete saved Polymind invitations unavailable', async () => {
  const directory = await mkdtemp(join(temporary, 'old-invitation-'));
  const original = await serve(directory);
  const saved = await (await fetch(`${original.base}/api/operator/state`, { headers: authenticated })).json();
  await original.close();
  saved.activeId = 'polymind';
  Object.assign(saved.activities.find(item => item.id === 'polymind'), {
    status: 'ready', url: 'https://polymind.supercollective.io/',
  });
  await writeFile(join(directory, 'state.json'), JSON.stringify(saved));
  const restarted = await serve(directory);
  try {
    const state = await (await fetch(`${restarted.base}/api/operator/state`, { headers: authenticated })).json();
    const current = await (await fetch(`${restarted.base}/api/current`)).json();
    assert.equal(state.revision, saved.revision + 1);
    assert.equal(state.activities.length, saved.activities.length);
    assert.equal(current.current.id, 'polymind');
    assert.equal(current.current.status, 'unavailable');
    assert.equal(current.current.url, undefined);
    assert.match(current.current.instruction, /preparation/);
  } finally { await restarted.close(); }
});

test('Flight audience invitations allow only the public root route and opaque audience key shape', () => {
  const flightConfig = configuration({
    HUB_OPERATOR_PASSWORD: password,
    HUB_DATA_DIR: temporary,
    HUB_ALLOWED_ORIGINS: 'https://polymind.supercollective.io,https://fly.supercollective.io',
  });
  const key = 'A'.repeat(32);
  const invitation = `https://fly.supercollective.io/?key=${key}`;
  assert.equal(participantUrl(invitation, flightConfig), invitation);

  const rejected = [
    `https://fly.supercollective.io/?key=${'A'.repeat(23)}`,
    `https://fly.supercollective.io/?key=${'A'.repeat(129)}`,
    `https://fly.supercollective.io/?key=${key}&key=${key}`,
    `https://fly.supercollective.io/?KEY=${key}`,
    `https://fly.supercollective.io/?%6Bey=${key}`,
    `https://fly.supercollective.io/?key=${key}&next=public`,
    `https://fly.supercollective.io/?key=${key}&bridge_key=private`,
    `https://fly.supercollective.io/?key=${key}%2Fsecret`,
    `https://fly.supercollective.io/projection?key=${key}`,
    `https://fly.supercollective.io/relay.js?key=${key}`,
    `https://fly.supercollective.io/operator?key=${key}`,
    `https://other.example/?key=${key}`,
  ];
  for (const url of rejected) {
    assert.throws(() => participantUrl(url, flightConfig), { status: 400 }, url);
  }
  assert.throws(() => participantUrl(`https://polymind.supercollective.io/?key=${key}`, flightConfig),
    { status: 400 }, 'The key parameter is Flight-audience-only');
  assert.throws(() => participantUrl(invitation, config), { status: 400 }, 'Flight origin is not allowlisted');
});

test('malformed saved state fails closed rather than replacing programme', async () => {
  const path = join(temporary, 'corrupt');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path);
  await writeFile(join(path, 'state.json'), '{broken');
  await assert.rejects(createHub({ ...config, dataDir: path }));
  assert.equal(await readFile(join(path, 'state.json'), 'utf8'), '{broken');
});

test('operator fields cannot be hidden in a public manifest', async () => {
  const { validateSelection } = await import('../server.mjs');
  const activity = { id: 'example', label: 'Example', kind: 'waiting', status: 'ready', instruction: 'Wait here' };
  assert.throws(() => validateSelection({ activeId: 'example', activities: [{ ...activity, operatorUrl: 'private' }] }, config), { status: 400 });
  assert.throws(() => validateSelection({ activeId: 'example', activities: [activity, activity] }, config), { status: 400 });
  assert.throws(() => validateSelection({ activeId: 'missing', activities: [activity] }, config), { status: 400 });
  assert.throws(() => configuration({ HUB_OPERATOR_PASSWORD: 'weak' }));
});

// Exercise private configuration through the request handler without binding a port.
test('website choices require authentication and never enter the public invitation', async () => {
  const directory = join(temporary, 'website-choices');
  const server = await createHub({ ...config, dataDir: directory });
  function get(url, headers = {}) {
    return new Promise(resolve => {
      let status;
      server.emit('request', { method: 'GET', url, headers: { host: 'we.supercollective.io', ...headers } }, {
        writeHead(code) { status = code; },
        end(body) { resolve({ status, body: JSON.parse(body) }); },
      });
    });
  }
  assert.equal((await get('/api/operator/config')).status, 401);
  const choices = await get('/api/operator/config', authenticated);
  assert.equal(choices.status, 200);
  assert.deepEqual(choices.body, { allowedOrigins: ['https://polymind.supercollective.io'],
    appOrigins: { polymind: 'https://polymind.supercollective.io', puck: 'https://puck.supercollective.io', flight: 'https://fly.supercollective.io' }, integrations: { polymind: false, puck: false, flight: false } });
  const current = await get('/api/current');
  assert.equal(current.status, 200);
  assert.equal(current.body.allowedOrigins, undefined);
  assert.equal(current.body.activities, undefined);
  assert.equal(current.body.appOrigins, undefined);
});

test('app-control origins are configurable without widening participant permissions', () => {
  const custom = configuration({ HUB_OPERATOR_PASSWORD: password,
    HUB_POLYMIND_ORIGIN: 'https://writing.example', HUB_PUCK_ORIGIN: 'https://decision.example' });
  assert.deepEqual(custom.appOrigins, { polymind: 'https://writing.example', puck: 'https://decision.example', flight: 'https://fly.supercollective.io' });
  assert.equal(custom.allowedOrigins.has('https://decision.example'), false);
  for (const value of ['http://writing.example', 'https://writing.example/operator', 'https://user:secret@writing.example']) {
    assert.throws(() => configuration({ HUB_OPERATOR_PASSWORD: password, HUB_POLYMIND_ORIGIN: value }));
  }
});

test('app preparation uses fixed shared APIs, redacts responses and never changes the live invitation', async () => {
  const { Readable } = await import('node:stream');
  const secret = 'synthetic-app-operator-secret-32-characters';
  const calls = [];
  const apiConfig = { ...config, dataDir: join(temporary, 'api-preparation'), appTokens: { polymind: secret },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (options.method === 'POST') return new Response(JSON.stringify({ id: 'synthetic-session' }));
      const session = { id: 'synthetic-session', title: 'Synthetic session', status: 'writing-open',
        participantUrl: 'https://polymind.supercollective.io/?session=synthetic-session', privateExtra: 'must-not-leave-adapter' };
      return new Response(JSON.stringify(url.endsWith('/synthetic-session') ? session : [session]));
    } };
  const server = await createHub(apiConfig);
  const invoke = (url, method = 'GET', data, headers = authenticated) => new Promise(resolve => {
    const request = Readable.from(data ? [Buffer.from(JSON.stringify(data))] : []);
    Object.assign(request, { url, method, headers: { host: 'we.supercollective.io', ...headers } });
    let status;
    server.emit('request', request, {
      writeHead(code) { status = code; }, end(body) { resolve({ status, body: JSON.parse(body) }); },
    });
  });
  assert.equal((await invoke('/api/operator/apps/polymind/sessions', 'GET', undefined, {})).status, 401);
  assert.equal((await invoke('/api/operator/apps/polymind/sessions', 'POST', { requestId: 'synthetic-request-001', settings: { title: 'Synthetic session', capacity: 140 } })).status, 403);
  const created = await invoke('/api/operator/apps/polymind/sessions', 'POST', { requestId: 'synthetic-request-001', settings: { title: 'Synthetic session', capacity: 140 } }, mutation);
  assert.equal(created.status, 201);
  assert.equal(created.body.url, 'https://polymind.supercollective.io/?session=synthetic-session');
  assert.equal(created.body.privateExtra, undefined);
  assert.equal(JSON.stringify(created).includes(secret), false);
  assert.equal(calls[0].url, 'https://polymind.supercollective.io/api/operator/sessions');
  assert.equal(calls[0].options.headers.authorization, `Bearer ${secret}`);
  assert.equal(calls[0].options.headers['idempotency-key'], 'synthetic-request-001');
  assert.equal(calls[0].options.redirect, 'error');
  const current = await invoke('/api/current');
  assert.equal(current.body.current.id, 'arrival');
  assert.equal(current.body.revision, 1);
  const configuration = await invoke('/api/operator/config');
  assert.equal(configuration.body.integrations.polymind, true);
  assert.equal(JSON.stringify(configuration).includes(secret), false);
});

test('app adapter rejects unconfigured targets and hides upstream failures', async () => {
  const { appRequest } = await import('../server.mjs');
  await assert.rejects(appRequest(config, 'puck'), { status: 503 });
  const withToken = { ...config, appTokens: { polymind: 'synthetic-operator-token-32-characters' },
    fetch: async () => new Response('raw upstream content must remain private', { status: 500 }) };
  await assert.rejects(appRequest(withToken, 'polymind'), error => error.status === 502 && !error.message.includes('raw upstream'));
  await assert.rejects(appRequest(withToken, 'polymind', '../operator'), { status: 400 });
  await assert.rejects(appRequest(withToken, 'unknown'), { status: 404 });
});

test('name hand-off recognises only supported configured participant destinations', () => {
  const current = { kind: 'activity', status: 'ready', url: 'https://polymind.supercollective.io/?session=one' };
  assert.equal(supportsNameHandoff(current, config), true);
  assert.equal(supportsNameHandoff({ ...current, url: 'https://puck.supercollective.io/room/one' }, config), true);
  for (const url of ['https://polymind.supercollective.io/join', 'https://puck.supercollective.io/',
    'https://other.example/room/one', 'https://puck.supercollective.io/room/one/other']) {
    assert.equal(supportsNameHandoff({ ...current, url }, config), false);
  }
  assert.equal(supportsNameHandoff({ ...current, status: 'unavailable' }, config), false);
  assert.equal(supportsNameHandoff({ ...current, kind: 'analogue' }, config), false);
  const custom = { ...config, appOrigins: { ...config.appOrigins, polymind: 'https://writing.example' } };
  assert.equal(supportsNameHandoff(current, custom), false);
  assert.equal(supportsNameHandoff({ ...current, url: 'https://writing.example/?session=one' }, custom), true);
});

test('pairing admission is serialised, scoped to the cue and durable without exposing identities', async () => {
  const directory = await mkdtemp(join(temporary, 'pairing-'));
  let app = await serve(directory);
  const tokens = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  let roundId;
  const pair = (token, action = 'join', headers = { origin: config.publicOrigin }, expectedPromptRevision) => fetch(`${app.base}/api/pairing`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ token, roundId, action, expectedPromptRevision }),
  });
  try {
    let state = await (await fetch(`${app.base}/api/operator/state`, { headers: authenticated })).json();
    state.activities.push({ id: 'pairs', label: 'Pairs', kind: 'pairs', status: 'ready', instruction: 'Find a partner.', prompts: ['Synthetic invitation A.', 'Synthetic invitation B.'] });
    state.activeId = 'pairs';
    assert.equal((await put(app.base, state)).status, 200);
    const current = await (await fetch(`${app.base}/api/current`)).json();
    roundId = current.pairingRound;
    assert.ok(roundId);
    assert.equal((await pair(tokens[0], 'join', {})).status, 403);
    assert.equal((await pair('invalid')).status, 400);
    const responses = await Promise.all(tokens.flatMap(token => [pair(token), pair(token)]));
    assert.ok(responses.every(response => response.status === 200));
    const saved = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'));
    assert.equal(saved.pairing.waiting.length, 2);
    assert.equal(JSON.stringify(saved).includes(tokens[0]), false);
    assert.equal((await pair(tokens[1], 'leave')).status, 200);
    assert.equal((await pair(tokens[1])).status, 200);
    await app.close();
    // Advance only this disposable persisted batch deadline; avoid sleeping in the test.
    const expired = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'));
    expired.pairing.nextBatchAt = 0;
    expired.pairing.waiting.forEach(entry => { entry.seenAt = Date.now(); });
    await writeFile(join(directory, 'state.json'), JSON.stringify(expired));
    app = await serve(directory);
    let first = await (await pair(tokens[0])).json();
    const second = await (await pair(tokens[1])).json();
    assert.equal(first.status, 'paired'); assert.deepEqual(first, second);
    assert.equal(current.current.prompts, undefined, 'the public invitation does not publish the catalogue');
    assert.equal((await pair(tokens[0], 'next-prompt')).status, 400);
    assert.equal((await pair('33333333-3333-4333-8333-333333333333', 'next-prompt', undefined, 0)).status, 409);
    const concurrent = await Promise.all(tokens.map(token => pair(token, 'next-prompt', undefined, 0).then(response => response.json())));
    assert.equal(concurrent[0].prompt.revision, 1);
    assert.deepEqual(concurrent[0], concurrent[1]);
    assert.deepEqual(await (await pair(tokens[0], 'next-prompt', undefined, 0)).json(), concurrent[0]);
    first = await (await pair(tokens[1], 'skip-prompt', undefined, 1)).json();
    assert.equal(first.prompt.status, 'skipped');

    await app.close(); app = await serve(directory);
    assert.deepEqual(await (await pair(tokens[0])).json(), first);
    state = await (await fetch(`${app.base}/api/operator/state`, { headers: authenticated })).json();
    assert.equal(state.pairing, undefined);
    assert.deepEqual(state.pairingSummary, { pairs: 1, waiting: 0 });
    state.activeId = 'arrival';
    assert.equal((await put(app.base, state)).status, 200);
    assert.equal((await pair(tokens[0])).status, 409);
    assert.equal((await (await fetch(`${app.base}/api/current`)).json()).pairingRound, undefined);
    state.revision += 1; state.activeId = 'pairs';
    assert.equal((await put(app.base, state)).status, 200);
    assert.deepEqual(await (await pair(tokens[0])).json(), first);
  } finally { await app.close(); }
});


test('suggestion catalogues are bounded, deduplicated and limited to pairs invitations', () => {
  const activity = { id: 'pairs', label: 'Pairs', kind: 'pairs', status: 'ready', instruction: '', prompts: [' Synthetic A. ', 'Synthetic A.'] };
  const validate = prompts => validateSelection({ activeId: 'pairs', activities: [{ ...activity, prompts }] }, config);
  assert.deepEqual(validate(activity.prompts).activities[0].prompts, ['Synthetic A.']);
  for (const prompts of ['invalid', [''], ['x'.repeat(301)], Array(65).fill('A')]) {
    assert.throws(() => validate(prompts), { status: 400 });
  }
  assert.throws(() => validateSelection({ activeId: 'pairs', activities: [{ ...activity, kind: 'waiting' }] }, config), { status: 400 });
});
