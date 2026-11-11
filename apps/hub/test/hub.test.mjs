import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { configuration, createHub, participantUrl } from '../server.mjs';

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
    assert.match(await privateResponse.text(), /Private operator desk/);
    const state = await (await fetch(`${app.base}/api/operator/state`, { headers: authenticated })).json();
    const digital = state.activities.find(activity => activity.id === 'polymind');
    digital.status = 'ready'; digital.url = 'https://polymind.supercollective.io/join?session=synthetic';
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
  assert.equal(participantUrl('https://polymind.supercollective.io/join?session=public', config),
    'https://polymind.supercollective.io/join?session=public');
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
