// Exercise the real applications on distinct browser origins with disposable state.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configuration, createHub } from '../apps/hub/server.mjs';
import { startSessionServer } from '../apps/polymind/dist/session/server.js';

const { chromium, expect } = await import(pathToFileURL(resolve('apps/polymind/node_modules/@playwright/test/index.mjs')).href);
const directory = await mkdtemp(join(tmpdir(), 'name-handoff-'));
const polyOrigin = 'https://polymind.test';
const puckOrigin = 'https://puck.test';
const operatorToken = 'synthetic-browser-operator-token-32-characters';
const password = 'synthetic-browser-hub-password';
const freePort = async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolveClose => server.close(resolveClose));
  return port;
};
let poly, hub, puck, browser;
try {
  const polyPort = await freePort();
  const puckPort = await freePort();
  poly = await startSessionServer({ directory: join(directory, 'polymind'), port: polyPort,
    origin: polyOrigin, operatorToken });
  puck = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: resolve('apps/puck'), env: { ...process.env, PORT: String(puckPort), HOST: '127.0.0.1',
      PUBLIC_ORIGIN: puckOrigin, PUCK_OPERATOR_TOKEN: operatorToken, DATABASE_PATH: join(directory, 'puck.sqlite') }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let puckOutput = '';
  puck.stdout.on('data', data => { puckOutput += data; });
  puck.stderr.on('data', data => { puckOutput += data; });
  const puckBase = `http://127.0.0.1:${puckPort}`;
  for (let i = 0; i < 100; i++) {
    if (puck.exitCode !== null) throw new Error(`Puck exited: ${puckOutput}`);
    try { if ((await fetch(`${puckBase}/healthz`)).ok) break; } catch { /* starting */ }
    if (i === 99) throw new Error(`Puck did not start: ${puckOutput}`);
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  const config = configuration({ HUB_OPERATOR_PASSWORD: password, HUB_DATA_DIR: join(directory, 'hub'),
    HUB_PUBLIC_ORIGIN: 'http://127.0.0.1:3000', HUB_ALLOWED_ORIGINS: `${polyOrigin},${puckOrigin}`,
    HUB_POLYMIND_ORIGIN: polyOrigin, HUB_PUCK_ORIGIN: puckOrigin });
  hub = await createHub(config);
  hub.listen(0, '127.0.0.1'); await once(hub, 'listening');
  const hubBase = `http://127.0.0.1:${hub.address().port}`;
  config.publicOrigin = hubBase;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  // Proxy HTTP to the real servers while retaining each HTTPS browser origin.
  // WebSockets are outside this handoff smoke; Puck's own browser suite covers them.
  for (const [origin, port] of [[polyOrigin, polyPort], [puckOrigin, puckPort]]) {
    await context.route(`${origin}/**`, async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: `http://127.0.0.1:${port}${url.pathname}${url.search}`,
        headers: { ...route.request().headers(), host: url.host } });
      await route.fulfill({ response });
    });
  }
  const operator = await context.newPage();
  await operator.goto(`${polyOrigin}/operator`);
  await operator.getByLabel('Operator access token').fill(operatorToken);
  await operator.getByRole('button', { name: 'Sign in', exact: true }).click();
  await operator.getByRole('button', { name: 'Create session', exact: true }).click();
  await operator.getByRole('button', { name: 'Open writing', exact: true }).click();
  const polyPath = await operator.locator('#join-link').getAttribute('href');
  assert.ok(polyPath);
  const createRoom = await fetch(`${puckBase}/api/rooms`, { method: 'POST', headers: {
    origin: puckOrigin, 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'Synthetic question?', options: ['One', 'Two'] }) });
  assert.equal(createRoom.status, 201);
  const room = await createRoom.json();
  const auth = `Basic ${Buffer.from(`organiser:${password}`).toString('base64')}`;
  async function show(id, url) {
    const headers = { authorization: auth, origin: hubBase, 'content-type': 'application/json' };
    const state = await (await fetch(`${hubBase}/api/operator/state`, { headers })).json();
    const activity = state.activities.find(item => item.id === id);
    activity.status = 'ready'; activity.url = url; state.activeId = id;
    const response = await fetch(`${hubBase}/api/operator/state`, { method: 'PUT', headers,
      body: JSON.stringify({ expectedRevision: state.revision, activeId: id, activities: state.activities }) });
    assert.equal(response.status, 200, await response.text());
  }
  await show('polymind', `${polyOrigin}${polyPath}`);
  const page = await context.newPage();
  await page.goto(hubBase);
  await page.getByLabel('Your name').fill('  Ada & Bea  ');
  await page.getByRole('link', { name: 'Join activity' }).click();
  await expect(page.getByLabel('Your name')).toHaveValue('Ada & Bea');
  assert.equal(new URL(page.url()).hash, '');
  await page.getByLabel('If matched, I need my partner to come to my seat').check();
  await page.getByRole('button', { name: 'Join session' }).click();
  await expect(page.locator('#badge')).toHaveText('001');
  const polyState = await page.evaluate(async () => (await fetch(`/api/state${location.search}`)).json());
  assert.equal(polyState.participant.name, 'Ada & Bea');
  assert.equal(polyState.participant.seated, true);
  const polyCookies = await context.cookies(polyOrigin);
  assert.ok(polyCookies.some(cookie => cookie.name.startsWith('pm_')));
  await page.goto(hubBase);
  await show('puck', `${puckOrigin}/room/${room.id}`);
  await expect(page.getByRole('heading', { name: 'Puck', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Join activity' }).click();
  await expect(page.getByLabel('Your name')).toHaveValue('Ada & Bea');
  assert.equal(new URL(page.url()).hash, '');
  const roomState = () => page.evaluate(async id => (await fetch(`/api/rooms/${id}`)).json(), room.id);
  assert.equal((await roomState()).me, null);
  await page.getByRole('button', { name: 'Join the room' }).click();
  await expect(page.getByLabel('Your name')).toHaveCount(0);
  const puckIdentity = (await roomState()).me;
  assert.equal(puckIdentity.name, 'Ada & Bea');
  assert.ok(puckIdentity.id);
  const puckCookies = await context.cookies(puckOrigin);
  assert.ok(puckCookies.length > 0);
  assert.ok(!puckCookies.some(cookie => cookie.name.startsWith('pm_')));
  assert.ok(!(await context.cookies(polyOrigin)).some(cookie => puckCookies.some(other => other.name === cookie.name)));
  await page.goto(hubBase);
  await page.getByRole('button', { name: 'Change name' }).click();
  await page.getByLabel('Your name').fill('Changed name');
  await page.getByRole('link', { name: 'Join activity' }).click();
  await expect(page.getByLabel('Your name')).toHaveCount(0);
  assert.equal(await page.evaluate(() => localStorage.getItem('rw-display-name-v1')), 'Ada & Bea');
  const revisitedPuck = (await roomState()).me;
  assert.equal(revisitedPuck.id, puckIdentity.id);
  assert.equal(revisitedPuck.name, 'Ada & Bea');
  await page.goto(hubBase);
  await show('polymind', `${polyOrigin}${polyPath}`);
  await expect(page.getByRole('heading', { name: 'Polymind', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Join activity' }).click();
  await expect(page.locator('#badge')).toHaveText('001');
  const revisited = await page.evaluate(async () => (await fetch(`/api/state${location.search}`)).json());
  assert.equal(revisited.participant.name, 'Ada & Bea');
  assert.equal(revisited.participant.seated, true);
  assert.equal(new URL(page.url()).hash, '');
  const publicState = await (await fetch(`${hubBase}/api/current`)).text();
  assert.ok(!publicState.includes('Ada & Bea') && !publicState.includes('Changed name'));
  assert.deepEqual(errors, []);
  console.log('Cross-origin name handoff browser smoke passed.');
} finally {
  await browser?.close();
  await poly?.close();
  if (hub) await new Promise(resolveClose => hub.close(resolveClose));
  if (puck && puck.exitCode === null) { puck.kill('SIGTERM'); await once(puck, 'exit'); }
  await rm(directory, { recursive: true, force: true });
}
