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
const sequence = 'Arrivals room → 1 · Record individually → 2 · Pairs → 4 · Groups of four → All · Polymind analysis → Collective Voice → Puck → Flight';
const analogueInstruction = 'Find the person with the same pair number. Show them your screen to check.';
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
  await operator.locator('#manual-programme > summary').click();
  // Defaults are a reviewable form edit, preserving the installed run and app URLs.
  for (const [label, kind] of [['2 · Pairs', 'pairs'], ['4 · Groups of four', 'fours']]) {
    await operator.locator('.prepare-choice').filter({ hasText: label }).click();
    await operator.getByLabel('What should people do?').selectOption('analogue');
    await operator.getByRole('button', { name: 'Use ZKM pair and fours defaults for this invitation', exact: true }).click();
    await expect(operator.getByLabel('What should people do?')).toHaveValue(kind);
    await expect(operator.getByLabel(kind === 'pairs' ? 'Pair suggestions' : 'Fours suggestions', { exact: true })).not.toHaveValue('');
    await operator.screenshot({ path: join(output, `profile-${kind}-preparation.png`), fullPage: true });
    await operator.getByRole('button', { name: 'Save invitation', exact: true }).click();
    await expect(operator.locator('#feedback')).toContainText(`Saved ${label}`);
  }
  const updatedProgramme = await (await operator.request.get(`${base}/api/operator/state`)).json();
  assert.equal(updatedProgramme.runId, installed.runId);
  assert.deepEqual(updatedProgramme.activities.filter(item => item.kind === 'activity'), installed.activities.filter(item => item.kind === 'activity'));
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

  const profilePrompts = liveState.activities.find(item => item.id === 'analogue').prompts;
  assert.equal(profilePrompts.length, 28, 'The profile loads its pool without manual preparation');
  await operator.getByRole('button', { name: 'Show invitation: 2 · Pairs', exact: true }).click();
  await expect(participant.getByRole('heading', { name: '2 · Pairs' })).toBeVisible();
  await expect(participant.locator('#pairing')).toBeVisible();
  // Two independent phones share one saved assignment, without sharing identity.
  const partnerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const partner = await partnerContext.newPage();
  await partner.goto(base);
  await participant.getByRole('button', { name: 'Find me a partner' }).click();
  await partner.getByRole('button', { name: 'Find me a partner' }).click();
  await expect(participant.locator('#pair-marker')).toBeVisible({ timeout: 20000 });
  await expect(partner.locator('#pair-marker')).toBeVisible({ timeout: 20000 });
  const pairNumber = await participant.locator('#pair-number').textContent();
  await expect(partner.locator('#pair-number')).toHaveText(pairNumber);
  await participant.reload();
  await expect(participant.locator('#pair-number')).toHaveText(pairNumber);
  for (const width of [320, 390, 1100]) {
    await participant.setViewportSize({ width, height: 844 });
    assert.equal(await participant.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await participant.screenshot({ path: join(output, `pairing-${width}.png`), fullPage: true });
  }
  await participant.setViewportSize({ width: 390, height: 844 });
  await participant.getByRole('button', { name: 'We’ve found each other', exact: true }).click();
  await partner.getByRole('button', { name: 'We’ve found each other', exact: true }).click();
  await participant.getByRole('button', { name: 'Try something together', exact: true }).click();
  await expect(participant.getByRole('button', { name: 'Try another', exact: true })).toBeVisible();
  const firstPrompt = await participant.locator('#pair-prompt-text').textContent();
  assert.ok(profilePrompts.includes(firstPrompt));
  await expect(partner.locator('#pair-prompt-text')).toHaveText(firstPrompt);
  await partner.getByRole('button', { name: 'Try another', exact: true }).click();
  await expect(partner.locator('#pair-prompt-text')).not.toHaveText(firstPrompt);
  const secondPrompt = await partner.locator('#pair-prompt-text').textContent();
  await expect(participant.locator('#pair-prompt-text')).toHaveText(secondPrompt);
  await participant.reload();
  await expect(participant.locator('#pair-conversation')).toBeVisible();
  await expect(participant.locator('#pair-prompt-text')).toHaveText(secondPrompt);
  for (const width of [320, 390, 1100]) {
    await participant.setViewportSize({ width, height: 844 });
    assert.equal(await participant.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await participant.screenshot({ path: join(output, `pair-prompt-${width}.png`), fullPage: true });
  }
  await participant.setViewportSize({ width: 390, height: 844 });
  await partner.getByRole('button', { name: 'Continue without a suggestion', exact: true }).click();
  await expect(participant.locator('#pair-prompt-text')).toHaveText('Continue your conversation.');
  await participant.getByRole('button', { name: `Show pair ${pairNumber}`, exact: true }).click();
  await expect(participant.locator('#pair-marker')).toBeVisible();
  await expect(participant.locator('#pair-number')).toHaveText(pairNumber);
  const extraContexts = await Promise.all([1, 2].map(() => browser.newContext({ viewport: { width: 390, height: 844 } })));
  const extras = await Promise.all(extraContexts.map(context => context.newPage()));
  for (const phone of extras) {
    await phone.goto(base);
    await phone.getByRole('button', { name: 'Find me a partner' }).click();
  }
  for (const phone of extras) await expect(phone.locator('#pair-marker')).toBeVisible({ timeout: 20000 });
  await operator.screenshot({ path: join(output, 'profile-live-cue-desktop.png'), fullPage: true });
  await operator.setViewportSize({ width: 390, height: 844 });
  assert.equal(await operator.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
    'Live cues must fit a 390px viewport without horizontal scrolling');
  await operator.screenshot({ path: join(output, 'profile-live-cue-mobile.png'), fullPage: true });
  await operator.setViewportSize({ width: 1440, height: 1000 });

  await operator.getByRole('button', { name: 'Show invitation: 4 · Groups of four', exact: true }).click();
  await expect(participant.getByRole('heading', { name: '4 · Groups of four' })).toBeVisible();
  const phones = [participant, partner, ...extras];
  const foursPrompts = liveState.activities.find(item => item.id === 'four').prompts;
  assert.ok(foursPrompts.length > 0);
  for (const phone of phones) {
    await expect(phone.getByRole('button', { name: 'We’ve found our group', exact: true })).toBeVisible();
    await expect(phone.locator('#pair-number')).toHaveText('01');
    await phone.getByRole('button', { name: 'We’ve found our group', exact: true }).click();
  }
  await participant.getByRole('button', { name: 'Try something together', exact: true }).click();
  await expect(participant.getByRole('button', { name: 'Try another', exact: true })).toBeVisible();
  const foursPrompt = await participant.locator('#pair-prompt-text').textContent();
  assert.ok(foursPrompts.includes(foursPrompt));
  for (const phone of phones) await expect(phone.locator('#pair-prompt-text')).toHaveText(foursPrompt);
  await extras[0].reload();
  await expect(extras[0].locator('#pair-prompt-text')).toHaveText(foursPrompt);
  for (const width of [320, 390, 1100]) {
    await participant.setViewportSize({ width, height: 844 });
    assert.equal(await participant.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await participant.screenshot({ path: join(output, `fours-prompt-${width}.png`), fullPage: true });
  }
  await participant.setViewportSize({ width: 390, height: 844 });
  await partner.getByRole('button', { name: 'Continue without a suggestion', exact: true }).click();
  for (const phone of phones) await expect(phone.locator('#pair-prompt-text')).toHaveText('Continue your conversation.');
  await participant.getByRole('button', { name: 'Show group 01', exact: true }).click();
  await participant.screenshot({ path: join(output, 'fours-marker-390.png'), fullPage: true });
  await partnerContext.close();
  for (const context of extraContexts) await context.close();
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

  await operator.getByRole('button', { name: 'Show invitation: 2 · Pairs', exact: true }).click();
  await expect(participant.getByRole('heading', { name: '2 · Pairs' })).toBeVisible();
  await expect(participant.locator('#pairing')).toBeVisible();
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
  assert.match(liveCueRows[3], /Next activity · Two pairs into four/,
    'Groups of four must remain the next cue after the analogue activity');
  await expect(participant.getByRole('heading', { name: '2 · Pairs' })).toBeVisible();
  await expect(participant.locator('#pairing')).toBeVisible();

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
  await expect(participant.getByRole('heading', { name: '2 · Pairs' })).toBeVisible();
  await expect(participant.locator('#pairing')).toBeVisible();

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
