import { expect, test } from '@playwright/test';

test('two participants share a round, reconnect, cancel and replay privately', async ({
  page,
  browser,
}) => {
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  guest.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('Your name', { exact: true }).fill('Jo');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  const roomUrl = page.url();
  await guest.goto(roomUrl);
  await guest.getByLabel('Your name', { exact: true }).fill('Alex');
  await guest.getByRole('button', { name: 'Join the room' }).click();
  await expect(page.getByText('2 online')).toBeVisible();
  await page.getByRole('button', { name: 'Start round', exact: true }).click();
  await expect(guest.getByText('ROUND IN PROGRESS')).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText('59s', { timeout: 8000 });
  await page.bringToFront();
  const arena = page.getByRole('application');
  await arena.scrollIntoViewIfNeeded();
  const box = await arena.boundingBox();
  if (!box) throw new Error('Arena has no bounds.');
  await page.mouse.move(box.x + box.width * 0.54, box.y + box.height * 0.5);
  await page.mouse.down();
  await expect
    .poll(async () => Number(await page.locator('.puck').getAttribute('cx')))
    .toBeGreaterThan(520);
  await expect
    .poll(async () => Number(await guest.locator('.puck').getAttribute('cx')))
    .toBeGreaterThan(520);
  expect(await page.locator('.magnet').count()).toBe(1);
  expect(await guest.locator('.magnet').count()).toBe(1);
  await page.mouse.up();
  await guest.reload();
  await expect(guest.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.getByText('2 online')).toBeVisible();
  const duplicate = await guestContext.newPage();
  await duplicate.goto(roomUrl);
  await expect(duplicate.getByText('Connected', { exact: true })).toBeVisible();
  await expect(guest.getByText('Another tab now controls your magnet.')).toBeVisible();
  await expect(page.getByText('2 online')).toBeVisible();
  await duplicate.close();
  await guest.reload();
  await expect(guest.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel round' }).click();
  await expect(guest.getByRole('heading', { name: 'Round cancelled.' })).toBeVisible();
  await page.getByRole('link', { name: /cancelled.*Replay/ }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const download = page.getByRole('link', { name: 'Download recording' });
  const href = await download.getAttribute('href');
  if (!href) throw new Error('Missing recording URL.');
  const response = await page.request.get(href);
  expect(response.ok()).toBe(true);
  const recording = await response.json();
  expect(recording.frames.length).toBeGreaterThan(60);
  expect(recording.result.phase).toBe('cancelled');
  const stranger = await browser.newContext();
  expect((await stranger.request.get(`http://localhost:4173${href}`)).status()).toBe(403);
  await stranger.close();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByLabel('Round timeline', { exact: true }).inputValue()))
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await guestContext.close();
});

test('mobile create form fits and accepts keyboard input', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByLabel('Your name', { exact: true }).fill('Mobile');
  await page.getByRole('button', { name: 'Create room' }).click();
  const arena = page.getByRole('application');
  await arena.focus();
  await page.keyboard.press('ArrowRight');
  expect(Number(await page.locator('.magnet').getAttribute('cx'))).toBeGreaterThan(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
