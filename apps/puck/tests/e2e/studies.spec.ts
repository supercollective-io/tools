import { expect, test } from '@playwright/test';

test('Outline preview supports interaction and responsive states', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/studies');
  const arena = page.getByRole('application');
  await arena.focus();
  await page.keyboard.press('ArrowRight');
  expect(Number(await page.locator('.magnet').getAttribute('cx'))).toBe(518);
  await page.keyboard.down('Space');
  await expect(page.locator('.pull-line')).toBeVisible();
  await expect
    .poll(async () => Number(await page.locator('.puck').getAttribute('cy')))
    .toBeGreaterThan(505);
  await page.keyboard.up('Space');
  await expect(page.locator('.pull-line')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset puck' }).click();
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });

  const box = await arena.boundingBox();
  if (!box) throw new Error('Missing arena');
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
  await page.mouse.down();
  await expect
    .poll(async () => Number(await page.locator('.puck').getAttribute('cx')))
    .toBeGreaterThan(510);
  await page.mouse.up();
  await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('holding');
  await expect(page.locator('.dwell-ring')).toHaveAttribute('stroke-dasharray', '0.5 1');
  await expect(page.locator('.magnet')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('holding.png'), fullPage: true });
  await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('selected');
  await expect(page.locator('.target.chosen')).toHaveCount(1);
  await expect(page.locator('.puck')).toHaveAttribute('cy', '130');
  await page.screenshot({ path: testInfo.outputPath('selected.png'), fullPage: true });

  // A stationary preview should not continually mutate puck coordinates.
  const mutations = await page.locator('.puck').evaluate(async (puck) => {
    let count = 0;
    const observer = new MutationObserver((records) => {
      count += records.length;
    });
    observer.observe(puck, { attributes: true, attributeFilter: ['cx', 'cy'] });
    await new Promise((resolve) => setTimeout(resolve, 150));
    observer.disconnect();
    return count;
  });
  expect(mutations).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Reset puck' }).click();
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
  await page.getByLabel('Six longer options').check();
  await expect(page.locator('.arena-option-key li')).toHaveCount(6);
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const targets = page.locator('.arena .target');
    const labels = page.locator('.arena .target-label');
    await expect(targets).toHaveCount(6);
    await expect(labels).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      const target = await targets.nth(i).boundingBox();
      const label = await labels.nth(i).boundingBox();
      if (!target || !label) throw new Error('Missing target or label bounds');
      const overlaps =
        label.x < target.x + target.width &&
        label.x + label.width > target.x &&
        label.y < target.y + target.height &&
        label.y + label.height > target.y;
      expect(overlaps, `Option ${i + 1} overlaps its target at ${width}px`).toBe(false);
    }
    await page.screenshot({
      path: testInfo.outputPath(`mobile-long-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('holding');
  await expect(page.locator('.puck')).toHaveAttribute('cy', '130');
  expect(errors).toEqual([]);
});
