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
  HUB_PUBLIC_ORIGIN: 'http://127.0.0.1:3000' });
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
  await operator.goto(`${base}/operator`);
  await operator.screenshot({ path: join(output, 'operator.png'), fullPage: true });
  console.log(`Operator load: ${await operator.locator('#feedback').textContent()}`);
  await expect(operator.getByRole('status')).toContainText('Saved programme loaded');
  const digital = operator.getByRole('group', { name: 'Polymind' });
  await digital.getByLabel('Availability').selectOption('ready');
  await expect(digital.getByLabel('Instruction for the room')).toBeHidden();
  await digital.getByLabel('Participant destination (HTTPS)').fill('https://polymind.supercollective.io/join?session=synthetic');
  await digital.getByRole('radio').check();
  await operator.getByRole('button', { name: 'Save programme' }).click();
  await expect(operator.getByRole('status')).toContainText('Invitation saved · revision 2');
  await expect(page.getByRole('link', { name: 'Join activity' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Polymind', exact: true })).toBeVisible();
  await expect(page.locator('#instruction')).toBeHidden();
  await page.screenshot({ path: join(output, 'mobile-activity.png'), fullPage: true });
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
  await operator.getByRole('group', { name: 'In-person activity' }).getByRole('radio').check();
  await operator.getByRole('button', { name: 'Save programme' }).click();
  await expect(operator.getByRole('status')).toContainText('Invitation saved · revision 3');
  await expect(page.getByRole('heading', { name: 'In-person activity' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join activity' })).toBeHidden();
  await expect(page.locator('#phase')).toBeHidden();
  await expect(page.locator('#instruction')).toHaveText('Put your phone away. Leave this page open — we’ll return to it.');
  await expect(page.locator('#instruction')).toBeVisible();
  await page.screenshot({ path: join(output, 'mobile-analogue.png'), fullPage: true });
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
