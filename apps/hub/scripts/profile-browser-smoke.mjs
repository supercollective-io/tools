// Optional browser tooling is supplied explicitly; it is never a runtime dependency.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configuration, createHub } from '../server.mjs';

if (!process.argv[2]) throw new Error('Pass the installed @playwright/test module path as an argument');
const playwrightModule = await import(pathToFileURL(resolve(process.argv[2])).href);
const { chromium, expect } = playwrightModule.chromium ? playwrightModule : playwrightModule.default;
const temporary = await mkdtemp(join(tmpdir(), 'hub-profile-browser-'));
const output = resolve(process.argv[3] ?? join(tmpdir(), 'rehearsing-we-profile-smoke'));
await mkdir(output, { recursive: true });

const password = 'synthetic-profile-browser-password';
const profileId = 'zkm-production-show-14-11-2026';
const writingQuestion = 'What is something you’d like to change, but can’t change on your own?';
const voiceQuestion = 'What would you like us to become capable of together that feels impossible alone?';
const puckQuestion = 'What shall we do with this plane?';
const sequence = 'Arrivals room → 1 · Record individually → 2 · Analogue objects → 4 · Groups of four → All · Polymind analysis → Collective Voice → Puck → Flight';
const analogueInstruction = 'Put your phone away and work in pairs with the analogue objects.';
const fourInstruction = 'Work in groups of four. Keep your phone away.';
const config = configuration({
  HUB_OPERATOR_PASSWORD: password,
  HUB_DATA_DIR: temporary,
  HUB_PUBLIC_ORIGIN: 'http://127.0.0.1:3000',
  HUB_ALLOWED_ORIGINS: 'https://polymind.supercollective.io,https://puck.supercollective.io,https://fly.supercollective.io',
  HUB_POLYMIND_TOKEN: 'synthetic-polymind-operator-token-with-more-than-32-characters',
  HUB_FLIGHT_TOKEN: 'synthetic-flight-operator-token-with-more-than-32-characters',
  HUB_PUCK_TOKEN: 'synthetic-puck-operator-token-with-more-than-32-characters',
});

const upstream = [];
let failVoiceOnce = false;
const polymindSessions = new Map();
const puckRooms = new Map();
const polymindRequests = new Map();
const puckRequests = new Map();
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
});
config.fetch = async (value, options) => {
  const url = new URL(value);
  const method = options.method;
  const body = options.body ? JSON.parse(options.body) : undefined;
  upstream.push({ app: url.hostname, path: url.pathname, method, body, headers: options.headers });

  if (url.hostname === 'fly.supercollective.io') return json({ id: 'current', title: 'Flight', status: 'simulator-disconnected', participantUrl: `https://fly.supercollective.io/?key=${'f'.repeat(32)}` });
  if (url.hostname === 'polymind.supercollective.io') {
    if (method === 'POST' && url.pathname === '/api/operator/sessions') {
      const key = options.headers['idempotency-key'];
      let session = polymindRequests.get(key);
      if (!session) {
        const id = `profile-session-${polymindRequests.size + 1}`;
        session = { id, title: body.title, status: 'writing-closed',
          participantUrl: `https://polymind.supercollective.io/?session=${id}` };
        polymindRequests.set(key, session);
        polymindSessions.set(id, { ...session });
      }
      if (failVoiceOnce && body.title.endsWith('Collective Voice')) {
        failVoiceOnce = false;
        return json({ error: 'Synthetic interrupted creation' }, 503);
      }
      return json(session, 201);
    }
    const preparation = /^\/api\/operator\/sessions\/([^/]+)\/preparation$/.exec(url.pathname);
    if (method === 'PUT' && preparation) {
      const session = polymindSessions.get(preparation[1]);
      if (!session) return json({ error: 'missing' }, 404);
      session.preparation = body;
      return json(body);
    }
    if (method === 'GET' && url.pathname === '/api/operator/sessions') return json([...polymindSessions.values()]);
    const selected = /^\/api\/operator\/sessions\/([^/]+)$/.exec(url.pathname);
    if (method === 'GET' && selected) {
      const session = polymindSessions.get(selected[1]);
      return session ? json(session) : json({ error: 'missing' }, 404);
    }
  }
  if (url.hostname === 'puck.supercollective.io') {
    if (method === 'POST' && url.pathname === '/api/rooms') {
      const key = options.headers['idempotency-key'];
      let room = puckRequests.get(key);
      if (!room) {
        const id = `profile-room-${puckRequests.size + 1}`;
        room = { id, question: body.question, status: 'waiting', options: body.options };
        puckRequests.set(key, room);
        puckRooms.set(id, { ...room });
      }
      return json(room, 201);
    }
    const selected = /^\/api\/rooms\/([^/]+)$/.exec(url.pathname);
    if (method === 'GET' && selected) {
      const room = puckRooms.get(selected[1]);
      return room ? json(room) : json({ error: 'missing' }, 404);
    }
  }
  return json({ error: `Unexpected synthetic upstream route: ${method} ${url.pathname}` }, 404);
};

const server = await createHub(config);
let browser;
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  config.publicOrigin = base;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    httpCredentials: { username: 'organiser', password },
  });
  await context.route('**/*', route => new URL(route.request().url()).origin === base
    ? route.continue()
    : route.abort());

  const participant = await context.newPage();
  await participant.goto(base);
  await expect(participant.getByRole('heading', { name: 'Waiting to begin' })).toBeVisible();

  const operator = await context.newPage();
  const hubWrites = [];
  operator.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === base && request.method() !== 'GET') hubWrites.push({ path: url.pathname, method: request.method() });
  });
  operator.on('pageerror', error => console.error(`Operator page error: ${error.message}`));
  await operator.goto(`${base}/operator`);
  await expect(operator.locator('#feedback')).toContainText('Saved programme loaded');
  await operator.getByRole('tab', { name: 'Preparation' }).click();
  await expect(operator.locator('#prepare')).toBeVisible();
  await expect(operator.locator('#run-form select[name="profile"]')).toHaveValue(profileId);
  await expect(operator.getByLabel('Collective Voice question')).toHaveValue(voiceQuestion);
  await expect(operator.getByLabel('Puck question')).toHaveValue(puckQuestion);
  await expect(operator.getByLabel('Puck answers — one per line')).toHaveValue('');

  await operator.screenshot({ path: join(output, 'profile-preparation-desktop.png'), fullPage: true });
  await operator.setViewportSize({ width: 390, height: 844 });
  assert.equal(await operator.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
    'Profile preparation must fit a 390px viewport without horizontal scrolling');
  await operator.screenshot({ path: join(output, 'profile-preparation-mobile.png'), fullPage: true });
  await operator.setViewportSize({ width: 1440, height: 1000 });

  await operator.getByRole('button', { name: 'Launch show', exact: true }).click();
  await expect(operator.locator('#run')).toBeVisible();
  await expect(participant.getByRole('heading', { name: 'Waiting to begin' })).toBeVisible();
  assert.equal((await (await operator.request.get(`${base}/api/operator/runs`)).json()).length, 1);
  assert.deepEqual(upstream.slice(0, 6).map(item => [item.app, item.method, item.path]), [
    ['polymind.supercollective.io', 'POST', '/api/operator/sessions'],
    ['polymind.supercollective.io', 'GET', '/api/operator/sessions/profile-session-1'],
    ['polymind.supercollective.io', 'PUT', '/api/operator/sessions/profile-session-1/preparation'],
    ['polymind.supercollective.io', 'POST', '/api/operator/sessions'],
    ['polymind.supercollective.io', 'GET', '/api/operator/sessions/profile-session-2'],
    ['polymind.supercollective.io', 'PUT', '/api/operator/sessions/profile-session-2/preparation'],
  ], 'Preparing writing and voice creates and configures only two Polymind sessions');
  assert.equal(upstream.some(item => item.path.includes('/rounds')), false,
    'Preparation must not start a Polymind round');
  assert.equal(upstream.some(item => item.app === 'puck.supercollective.io'), false,
    'Puck must wait for room-proposed options');
  const preparations = upstream.filter(item => item.method === 'PUT');
  assert.deepEqual(preparations.map(item => item.body), [
    { mode: 'bounded', prompt: writingQuestion, model: preparations[0].body.model },
    { mode: 'continuous', prompt: voiceQuestion, model: preparations[1].body.model },
  ]);
  const profile = (await (await operator.request.get(`${base}/api/operator/profiles`)).json())[0];
  assert.deepEqual(preparations.map(item => item.body.model), [profile.model, profile.voiceModel ?? profile.model],
    'One-click launch must use the complete profile model configuration');
  const ids = [...polymindSessions.keys()];
  assert.deepEqual(ids, ['profile-session-1', 'profile-session-2']);
  await expect(operator.locator('#run-sequence')).toContainText(sequence);
  await expect(operator.locator('#run-resources')).toContainText('1 · Record individually: prepared');
  await expect(operator.locator('#run-resources')).toContainText('Collective Voice: prepared');
  await expect(operator.locator('#run-resources')).toContainText('Puck: waiting for the room’s answer options');
  assert.equal(upstream.filter(item => item.app === 'polymind.supercollective.io' && item.method === 'POST').length, 2,
    'The individual and All cues share one session; Collective Voice has its own session');
  await expect(participant.getByRole('heading', { name: 'Waiting to begin' })).toBeVisible();

  await expect(operator.locator('#run-feedback')).toContainText('Programme loaded into Live cues');
  await expect(participant.getByRole('heading', { name: 'Waiting to begin' })).toBeVisible();
  const installed = await (await operator.request.get(`${base}/api/operator/state`)).json();
  assert.equal(installed.activities.find(item => item.id === 'flight').url, `https://fly.supercollective.io/?key=${'f'.repeat(32)}`);
  assert.deepEqual(installed.activities.map(item => item.id), ['arrival', 'polymind', 'analogue', 'four', 'polymind-all', 'collective-voice', 'puck', 'flight']);
  assert.equal(installed.activeId, 'arrival');
  await operator.getByRole('tab', { name: 'Preparation' }).click();
  const creations = upstream.filter(item => item.method === 'POST').length;
  await operator.getByRole('button', { name: 'Launch show', exact: true }).click();
  await expect(operator.locator('#run')).toBeVisible();
  assert.equal(upstream.filter(item => item.method === 'POST').length, creations);
  assert.equal((await (await operator.request.get(`${base}/api/operator/runs`)).json()).length, 1);
  assert.equal((await (await operator.request.get(`${base}/api/operator/state`)).json()).activeId, 'arrival');
  const writeCountAfterInstall = hubWrites.length;
  const upstreamCountAfterInstall = upstream.length;
  await operator.getByRole('tab', { name: 'Live cues' }).click();
  await operator.getByRole('tab', { name: 'Preparation' }).click();
  await operator.getByRole('tab', { name: 'Live cues' }).click();
  assert.equal(hubWrites.length, writeCountAfterInstall, 'Switching tabs must not mutate the live programme');
  assert.equal(upstream.length, upstreamCountAfterInstall, 'Switching tabs must not call an app');

  const upstreamMutationsBeforeCues = upstream.filter(item => item.method === 'POST' || item.method === 'PUT').length;
  const writingUrl = 'https://polymind.supercollective.io/?session=profile-session-1';
  await operator.getByRole('button', { name: 'Show invitation: 1 · Record individually', exact: true }).click();
  await expect(operator.locator('#feedback')).toContainText('Now showing: 1 · Record individually');
  await expect(participant.getByRole('heading', { name: '1 · Record individually' })).toBeVisible();
  await operator.setViewportSize({ width: 390, height: 844 });
  assert.equal(await operator.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await operator.screenshot({ path: join(output, 'profile-recording-cue-mobile.png'), fullPage: true });
  await operator.setViewportSize({ width: 1440, height: 1000 });
  let liveState = await (await operator.request.get(`${base}/api/operator/state`)).json();
  assert.equal(liveState.activities.find(item => item.id === 'polymind').url, writingUrl);

  await operator.getByRole('button', { name: 'Show invitation: 2 · Analogue objects', exact: true }).click();
  await expect(participant.getByRole('heading', { name: '2 · Analogue objects' })).toBeVisible();
  await expect(participant.locator('#instruction')).toHaveText(analogueInstruction);
  await operator.screenshot({ path: join(output, 'profile-live-cue-desktop.png'), fullPage: true });
  await operator.setViewportSize({ width: 390, height: 844 });
  assert.equal(await operator.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
    'Live cues must fit a 390px viewport without horizontal scrolling');
  await operator.screenshot({ path: join(output, 'profile-live-cue-mobile.png'), fullPage: true });
  await operator.setViewportSize({ width: 1440, height: 1000 });

  await operator.getByRole('button', { name: 'Show invitation: 4 · Groups of four', exact: true }).click();
  await expect(participant.getByRole('heading', { name: '4 · Groups of four' })).toBeVisible();
  await expect(participant.locator('#instruction')).toHaveText(fourInstruction);
  await operator.getByRole('button', { name: 'Show invitation: All · Polymind analysis', exact: true }).click();
  await expect(participant.getByRole('heading', { name: 'All · Polymind analysis' })).toBeVisible();
  liveState = await (await operator.request.get(`${base}/api/operator/state`)).json();
  assert.equal(liveState.activities.find(item => item.id === 'polymind-all').url, writingUrl,
    'The All cue must use the same Polymind session invitation as the individual-writing cue');
  assert.equal(liveState.activities.find(item => item.id === 'polymind').url, writingUrl);
  await expect(operator.locator('#current-operator-note')).toContainText('Close writing');
  await expect(operator.locator('#current-operator-note')).toContainText('analyse');
  const publicCurrent = await (await participant.request.get(`${base}/api/current`)).json();
  assert.equal(JSON.stringify(publicCurrent).includes('Close writing'), false,
    'The private All-cue operator note must not appear in the public current-activity response');
  assert.equal(upstream.filter(item => item.method === 'POST' || item.method === 'PUT').length, upstreamMutationsBeforeCues,
    'Changing activity cues must not create app resources or update app preparation');
  await expect(participant.getByRole('link', { name: 'Join activity' })).toHaveAttribute('href', writingUrl);

  await operator.getByRole('button', { name: 'Show invitation: 2 · Analogue objects', exact: true }).click();
  await expect(participant.getByRole('heading', { name: '2 · Analogue objects' })).toBeVisible();
  await expect(participant.locator('#instruction')).toHaveText(analogueInstruction);
  assert.equal(upstream.filter(item => item.method === 'POST' || item.method === 'PUT').length, upstreamMutationsBeforeCues,
    'Returning to the analogue cue must not create or reconfigure an app');
  await operator.screenshot({ path: join(output, 'profile-live-cue-desktop.png'), fullPage: true });

  await operator.getByRole('tab', { name: 'Preparation' }).click();
  await operator.getByLabel('Answers proposed by the room — two to six, one per line').fill('Continue the approach\nCircle back to the runway');
  await operator.getByRole('button', { name: 'Prepare Puck with these options' }).click();
  await expect(operator.locator('#run-feedback')).toContainText('Puck is prepared with the room’s options');
  const puckCreation = upstream.find(item => item.app === 'puck.supercollective.io' && item.method === 'POST');
  assert.deepEqual(puckCreation?.body, {
    question: puckQuestion,
    options: ['Continue the approach', 'Circle back to the runway'],
    mode: 'baseline',
  });
  assert.equal(upstream.some(item => item.path.includes('/start') || item.path.includes('/rounds')), false,
    'Preparing Puck must not start a Puck round or a Polymind round');
  assert.equal(puckRooms.size, 1);
  const liveAfterPuck = await (await operator.request.get(`${base}/api/operator/state`)).json();
  assert.equal(liveAfterPuck.activeId, 'analogue', 'Connecting Puck must preserve the current analogue cue');
  assert.equal(liveAfterPuck.activities.find(item => item.id === 'analogue').instruction, analogueInstruction);
  assert.equal(liveAfterPuck.activities.find(item => item.id === 'polymind').url, writingUrl);
  assert.equal(liveAfterPuck.activities.find(item => item.id === 'polymind-all').url, writingUrl);
  assert.equal(liveAfterPuck.activities.find(item => item.id === 'collective-voice').url,
    'https://polymind.supercollective.io/?session=profile-session-2');
  assert.equal(liveAfterPuck.activities.find(item => item.id === 'puck').url,
    'https://puck.supercollective.io/room/profile-room-1');
  await expect(operator.locator('#run-sequence')).toContainText(sequence);
  const liveCueRows = await operator.locator('#cues .cue-row').allTextContents();
  assert.match(liveCueRows[3], /Next activity · In person/,
    'Groups of four must remain the next cue after the analogue activity');
  await expect(participant.getByRole('heading', { name: '2 · Analogue objects' })).toBeVisible();
  await expect(participant.locator('#instruction')).toHaveText(analogueInstruction);

  const postedResourceCount = upstream.filter(item => item.method === 'POST').length;
  const resourceIds = [...polymindSessions.keys(), ...puckRooms.keys()];
  await operator.reload();
  await expect(operator.locator('#feedback')).toContainText('Saved programme loaded');
  await operator.getByRole('tab', { name: 'Preparation' }).click();
  await expect(operator.getByLabel('Collective Voice question')).toHaveValue(voiceQuestion);
  await expect(operator.getByLabel('Puck question')).toHaveValue(puckQuestion);
  await expect(operator.getByLabel('Puck answers — one per line')).toHaveValue('');
  await operator.locator('#saved-runs > summary').click();
  await operator.getByRole('button', { name: 'Resume preparation' }).click();
  await expect(operator.locator('#run-feedback')).toContainText('Run resumed. Existing sessions and rooms are retained');
  await expect(operator.locator('#run-sequence')).toContainText(sequence);
  await operator.getByRole('button', { name: 'Launch saved show' }).click();
  await expect(operator.locator('#run-feedback')).toContainText('Puck is prepared.');
  assert.equal(upstream.filter(item => item.method === 'POST').length, postedResourceCount,
    'Resuming and checking a saved run must not create new app resources');
  assert.deepEqual([...polymindSessions.keys(), ...puckRooms.keys()], resourceIds,
    'A resumed run must retain its original Polymind sessions and Puck room');
  await expect(participant.getByRole('heading', { name: '2 · Analogue objects' })).toBeVisible();
  await expect(participant.locator('#instruction')).toHaveText(analogueInstruction);

  await operator.getByRole('tab', { name: 'Preparation' }).click();
  await operator.screenshot({ path: join(output, 'profile-prepared-puck-desktop.png'), fullPage: true });
  // An uncertain resource creation during launch must survive browser reload.
  await operator.getByRole('tab', { name: 'Live cues' }).click();
  await operator.getByRole('button', { name: 'Return to waiting' }).click();
  await expect(participant.getByRole('heading', { name: 'Waiting to begin' })).toBeVisible();
  await operator.getByRole('tab', { name: 'Preparation' }).click();
  await operator.locator('#run-overrides > summary').click();
  failVoiceOnce = true;
  await operator.getByRole('button', { name: 'Launch fresh rehearsal' }).click();
  await expect(operator.locator('#run-feedback')).toHaveClass(/error/);
  assert.equal(polymindSessions.size, 4, 'Both resources committed before the interrupted reply');
  assert.equal((await (await operator.request.get(`${base}/api/operator/state`)).json()).runId, installed.runId,
    'A partial launch must leave the original programme installed');
  await operator.reload();
  await expect(operator.locator('#run-feedback')).toContainText('interrupted rehearsal');
  await operator.locator('#run-overrides > summary').click();
  await operator.getByRole('button', { name: 'Launch fresh rehearsal' }).click();
  await expect(operator.locator('#run')).toBeVisible();
  assert.equal(polymindSessions.size, 4, 'Retry must recover the committed sessions');
  assert.equal((await (await operator.request.get(`${base}/api/operator/runs`)).json()).length, 2,
    'Retry must recover the same rehearsal run');
  assert.equal((await (await operator.request.get(`${base}/api/operator/state`)).json()).activeId, 'arrival');
  assert.equal(await operator.evaluate(() => sessionStorage.getItem('hub-run-creation')), null);
  console.log(`Profile browser smoke passed; synthetic upstream calls: ${upstream.length}; screenshots: ${output}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
