// Optional browser tooling is supplied explicitly; it is never a runtime dependency.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configuration, createHub } from '../server.mjs';

if (!process.argv[2]) throw new Error('Pass the installed @playwright/test module path as an argument');
const { chromium, expect } = await import(pathToFileURL(resolve(process.argv[2])).href);
const temporary = await mkdtemp(join(tmpdir(), 'hub-browser-'));
const output = resolve(process.argv[3] ?? join(tmpdir(), 'rehearsing-we-hub-smoke'));
await mkdir(output, { recursive: true });
const password = 'synthetic-browser-check-password';
const config = configuration({ HUB_OPERATOR_PASSWORD: password, HUB_DATA_DIR: temporary,
  HUB_PUBLIC_ORIGIN: 'http://127.0.0.1:3000', HUB_ALLOWED_ORIGINS: 'https://polymind.supercollective.io,https://fly.supercollective.io', HUB_POLYMIND_TOKEN: 'synthetic-upstream-operator-token-32-characters' });
const upstreamSessions = new Map([['prepared-session', { id: 'prepared-session', title: 'Prepared synthetic session', status: 'writing-open', participantUrl: 'https://polymind.supercollective.io/?session=prepared-session' }]]);
const requests = new Map();
config.fetch = async (url, options) => {
  if (options.method === 'POST') {
    const key = options.headers['idempotency-key'];
    const id = requests.get(key) ?? `created-${requests.size + 1}`;
    requests.set(key, id);
    const data = JSON.parse(options.body);
    upstreamSessions.set(id, { id, title: data.title, status: 'writing-closed', participantUrl: `https://polymind.supercollective.io/?session=${id}` });
    return new Response(JSON.stringify({ id }));
  }
  const id = new URL(url).pathname.split('/').at(-1);
  const value = id === 'sessions' ? [...upstreamSessions.values()] : upstreamSessions.get(id);
  return new Response(JSON.stringify(value ?? { error: 'Not found' }), { status: value ? 200 : 404 });
};
const server = await createHub(config);
let browser;
try {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  config.publicOrigin = base;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    httpCredentials: { username: 'organiser', password } });
  const page = await context.newPage();
  await page.goto(base);
  await expect(page.getByRole('heading', { name: 'Waiting to begin' })).toBeVisible();
  await expect(page.locator('#connection')).toBeHidden();
  await expect(page.locator('#instruction')).toBeHidden();
  await expect(page.getByText('A temporary collective · ZKM')).toHaveCount(0);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true, `Participant entrance must fit a ${width}px viewport without horizontal scrolling`);
  }
  await page.screenshot({ path: join(output, 'mobile-welcome.png'), fullPage: true });
  const operator = await context.newPage();
  await operator.setViewportSize({ width: 1100, height: 900 });
  operator.on('pageerror', error => console.error(`Operator page error: ${error.message}`));
  await operator.goto(`${base}/operator?view=live`);
  console.log(`Operator load: ${await operator.locator('#feedback').textContent()}`);
  await expect(operator.locator('#feedback')).toContainText('Saved programme loaded');
  await operator.screenshot({ path: join(output, 'operator.png'), fullPage: true });
  const appControls = operator.getByRole('navigation', { name: 'App controls' });
  await expect(appControls.getByRole('link', { name: 'Polymind controls' })).toHaveAttribute('href', 'https://polymind.supercollective.io/operator');
  await expect(appControls.getByRole('link', { name: 'Puck controls' })).toHaveAttribute('href', 'https://puck.supercollective.io/operator');
  const liveTab = operator.getByRole('tab', { name: 'Live cues' });
  const preparationTab = operator.getByRole('tab', { name: 'Preparation' });
  await expect(liveTab).toHaveAttribute('aria-controls', 'run');
  await expect(operator.locator('#run')).toHaveAttribute('aria-labelledby', 'run-view');
  await liveTab.focus(); await operator.keyboard.press('ArrowRight');
  await expect(preparationTab).toHaveAttribute('aria-selected', 'true');
  await expect(operator.locator('#prepare')).toBeVisible();
  await operator.keyboard.press('Home');
  await expect(liveTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Waiting to begin' })).toBeVisible();
  await operator.getByRole('button', { name: 'Prepare Polymind', exact: true }).click();
  await expect(operator.getByLabel('Instruction for the room')).toBeVisible();
  await operator.locator('#manual-destination > summary').click();
  await operator.getByLabel('Participant link or path').fill('/?session=synthetic');
  await expect(operator.getByLabel('Instruction for the room')).toBeHidden();
  await operator.getByRole('button', { name: 'Save invitation', exact: true }).click();
  await expect(operator.locator('#feedback')).toContainText('Saved Polymind');
  // Preparation must never change the current invitation.
  await expect(page.getByRole('heading', { name: 'Waiting to begin' })).toBeVisible();
  await expect(operator.getByRole('link', { name: 'Open saved participant page to check' })).toHaveAttribute(
    'href', 'https://polymind.supercollective.io/?session=synthetic');
  await operator.screenshot({ path: join(output, 'operator-preparation.png'), fullPage: true });
  await operator.getByRole('tab', { name: 'Live cues' }).click();
  await operator.getByRole('button', { name: 'Show invitation: Polymind', exact: true }).click();
  await expect(operator.locator('#feedback')).toContainText('Now showing: Polymind');
  await expect(appControls.getByRole('link', { name: 'Polymind session controls' })).toHaveAttribute('href', 'https://polymind.supercollective.io/operator?session=synthetic');
  await expect(operator.locator('#current-heading')).toBeFocused();
  await operator.screenshot({ path: join(output, 'operator-live.png'), fullPage: true });
  for (const width of [320, 390]) {
    await operator.setViewportSize({ width, height: 844 });
    assert.equal(await operator.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await operator.screenshot({ path: join(output, 'operator-mobile.png'), fullPage: true });
  await operator.setViewportSize({ width: 1100, height: 900 });
  await expect(page.getByRole('link', { name: 'Join activity' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Polymind', exact: true })).toBeVisible();
  await expect(page.locator('#instruction')).toBeHidden();
  await page.screenshot({ path: join(output, 'mobile-activity.png'), fullPage: true });
  const flightUrl = `https://fly.supercollective.io/?key=${'S'.repeat(32)}`;
  await operator.getByRole('button', { name: 'Prepare Flight', exact: true }).click();
  await operator.getByLabel('Participant link or path').fill(flightUrl);
  await operator.getByRole('button', { name: 'Save invitation', exact: true }).click();
  await expect(operator.locator('#feedback')).toContainText('Saved Flight');
  await operator.getByRole('tab', { name: 'Live cues' }).click();
  await operator.getByRole('button', { name: 'Show invitation: Flight', exact: true }).click();
  await expect(operator.locator('[data-app-status="flight"]')).toHaveText('Simulator readiness not checked here');
  await operator.getByRole('button', { name: 'Refresh app checks' }).click();
  await expect(operator.locator('#feedback')).toContainText('Saved invitations are unchanged');
  await expect(page.getByRole('heading', { name: 'Flight', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join activity' })).toHaveAttribute('href', flightUrl);
  await operator.getByRole('button', { name: 'Show invitation: Polymind', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Polymind', exact: true })).toBeVisible();
  await context.route('https://polymind.supercollective.io/**', route => route.fulfill({ contentType: 'text/html',
    body: `<html><head><title>Synthetic destination</title></head><body><h1>Synthetic destination</h1><script>localStorage.setItem('syntheticVisits',Number(localStorage.getItem('syntheticVisits')||0)+1)</script><a href="${base}">Return to the room</a></body></html>` }));
  await page.getByRole('link', { name: 'Join activity' }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic destination' })).toBeVisible();
  assert.equal(context.pages().length, 2, 'Digital activity opens in the existing participant tab');
  assert.equal(await page.evaluate(() => localStorage.getItem('syntheticVisits')), '1');
  await page.getByRole('link', { name: 'Return to the room' }).click();
  await page.getByRole('link', { name: 'Join activity' }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic destination' })).toBeVisible();
  assert.equal(await page.evaluate(() => localStorage.getItem('syntheticVisits')), '2');
  await page.getByRole('link', { name: 'Return to the room' }).click();
  await operator.getByRole('button', { name: 'Show invitation: In-person activity', exact: true }).click();
  await expect(operator.locator('#feedback')).toContainText('Now showing: In-person activity');
  await expect(page.getByRole('heading', { name: 'In-person activity' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join activity' })).toBeHidden();
  await expect(page.locator('#phase')).toBeHidden();
  await expect(page.locator('#instruction')).toHaveText('Put your phone away. Leave this page open — we’ll return to it.');
  await expect(page.locator('#instruction')).toBeVisible();
  await page.screenshot({ path: join(output, 'mobile-analogue.png'), fullPage: true });
  // An unsaved setup edit must not leak into an unrelated live cue.
  await operator.getByRole('tab', { name: 'Preparation' }).click();
  await operator.getByRole('button', { name: 'Polymind · Link saved · check before showing', exact: true }).click();
  await operator.getByLabel('Invitation name').fill('Unsaved synthetic name');
  await operator.getByRole('tab', { name: 'Live cues' }).click();
  await operator.getByRole('button', { name: 'Return to waiting', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Waiting to begin' })).toBeVisible();
  await operator.getByRole('tab', { name: 'Preparation' }).click();
  await expect(operator.getByLabel('Invitation name')).toHaveValue('Unsaved synthetic name');
  operator.once('dialog', dialog => dialog.accept());
  await operator.getByRole('button', { name: 'Cancel editing', exact: true }).click();
  // Server validation stays authoritative, with an error beside the retained edit.
  await operator.getByRole('button', { name: 'Polymind · Link saved · check before showing', exact: true }).click();
  await operator.locator('#manual-destination > summary').click();
  await operator.getByLabel('Participant link or path').fill('/operator');
  await operator.getByRole('button', { name: 'Save invitation', exact: true }).click();
  await expect(operator.getByRole('alert')).toContainText('complete Participant entrance');
  await expect(operator.getByLabel('Participant link or path')).toHaveValue('/operator');
  await operator.getByLabel('Participant link or path').fill('polymind.supercollective.io/?session=synthetic');
  await operator.getByRole('button', { name: 'Save invitation', exact: true }).click();
  await expect(operator.locator('#feedback')).toContainText('Saved Polymind');
  // A failed cue must never appear successful, and must require reconciliation.
  await operator.getByRole('tab', { name: 'Live cues' }).click();
  await context.route(`${base}/api/operator/state`, route => route.request().method() === 'PUT' ? route.abort() : route.continue());
  await operator.getByRole('button', { name: 'Show invitation: Polymind', exact: true }).click();
  await expect(operator.locator('#feedback')).toContainText('Could not confirm the save');
  await expect(operator.getByRole('button', { name: 'Show invitation: Polymind', exact: true })).toBeDisabled();
  await context.unroute(`${base}/api/operator/state`);
  await operator.getByRole('button', { name: 'Refresh saved state', exact: true }).click();
  await expect(operator.locator('#feedback')).toContainText('Saved programme loaded');
  await expect(operator.getByRole('button', { name: 'Show invitation: Polymind', exact: true })).toBeEnabled();
  // A second operator's edit cannot overwrite this draft; refresh preserves it.
  await operator.getByRole('tab', { name: 'Preparation' }).click();
  await operator.getByRole('button', { name: 'Polymind · Link saved · check before showing', exact: true }).click();
  await operator.getByLabel('Invitation name').fill('Retained draft');
  await operator.evaluate(async () => {
    const saved = await (await fetch('/api/operator/state')).json();
    const result = await fetch('/api/operator/state', { method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision: saved.revision, activeId: 'analogue', activities: saved.activities }) });
    if (!result.ok) throw new Error('Synthetic concurrent edit failed');
  });
  await operator.getByRole('button', { name: 'Save invitation', exact: true }).click();
  await expect(operator.locator('#feedback')).toContainText('changed');
  await operator.getByRole('button', { name: 'Refresh saved state', exact: true }).click();
  await expect(operator.locator('#feedback')).toContainText('Your unsaved edits are kept');
  await expect(operator.getByLabel('Invitation name')).toHaveValue('Retained draft');
  await operator.getByRole('tab', { name: 'Live cues' }).click();
  await expect(operator.getByText('Unsaved changes · Show uses the saved version')).toBeVisible();
  operator.once('dialog', dialog => dialog.dismiss());
  await operator.getByRole('button', { name: 'Show invitation: Polymind', exact: true }).click();
  await expect(operator.locator('#current')).toContainText('In-person activity');
  await operator.getByRole('tab', { name: 'Preparation' }).click();
  operator.once('dialog', dialog => dialog.accept());
  await operator.getByRole('button', { name: 'Cancel editing', exact: true }).click();
  await operator.getByRole('button', { name: 'Polymind · Link saved · check before showing', exact: true }).click();
  await expect(operator.getByLabel('Existing session or room')).toContainText('Prepared synthetic session');
  await operator.getByRole('button', { name: 'Connect selected activity', exact: true }).click();
  await expect(operator.locator('#feedback')).toContainText('Saved Polymind');
  await expect(operator.getByRole('link', { name: 'Open saved participant page to check' })).toHaveAttribute('href', 'https://polymind.supercollective.io/?session=prepared-session');
  await operator.locator('#create-activity > summary').click();
  await operator.getByLabel('Session name', { exact: true }).fill('Created from Hub');
  await operator.getByRole('button', { name: 'Create and connect', exact: true }).click();
  await expect(operator.getByRole('link', { name: 'Open saved participant page to check' })).toHaveAttribute('href', 'https://polymind.supercollective.io/?session=created-1');
  assert.equal(requests.size, 1);
  await operator.screenshot({ path: join(output, 'operator-api-preparation.png'), fullPage: true });
  await context.route(`${base}/api/current`, route => route.abort());
  await expect(page.getByRole('status')).toContainText('Connection interrupted');
  await context.unroute(`${base}/api/current`);
  await expect(page.locator('#connection')).toBeHidden();
  await page.goto(`${base}/print`);
  await expect(page.getByRole('img', { name: 'QR code for https://we.supercollective.io' })).toBeVisible();
  await page.screenshot({ path: join(output, 'entrance-card.png'), fullPage: true });
  console.log(`Browser smoke passed; screenshots: ${output}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
