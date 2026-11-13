import { expect, test } from '@playwright/test';
import { initialState, type Recording, step } from '../../src/lib/core/engine.ts';
import { mapInput } from '../../src/lib/core/experiments.ts';

test('personalised correction mode records proportions, layouts and replay perspectives', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await page.getByText('Advanced settings', { exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Mode', exact: true })
    .selectOption('personalised-corrected');
  await page.getByRole('button', { name: 'Create room' }).click();
  await page.getByText('Join as a participant', { exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Host');
  await page.getByRole('button', { name: 'Join the room' }).click();
  await expect(page.locator('.magnet')).toBeVisible();
  const roomId = new URL(page.url()).pathname.split('/').pop();
  const room = await (await page.request.get(`/api/rooms/${roomId}`)).json();
  expect(room.mode).toBe('personalised-corrected');
  const neighbourIds = [...room.localOptions]
    .sort((a, b) => Math.atan2(a.y - 500, a.x - 500) - Math.atan2(b.y - 500, b.x - 500))
    .map((o) => o.id);
  const original = room.options.map((o: { id: string }) => o.id);
  expect(
    [1, -1].some((d) =>
      neighbourIds.every(
        (id, i) => id === original[(original.indexOf(neighbourIds[0]) + d * i + 8) % 4],
      ),
    ),
  ).toBe(false);
  await page.reload();
  await expect(page.locator('.magnet')).toBeVisible();
  expect((await (await page.request.get(`/api/rooms/${roomId}`)).json()).localOptions).toEqual(
    room.localOptions,
  );
  const context = await browser.newContext();
  try {
    const guest = await context.newPage();
    await guest.goto(page.url());
    await expect(
      guest.getByText('Experimental: Personalised layouts + correction', { exact: true }),
    ).toBeVisible();
    await guest.getByLabel('Your name', { exact: true }).fill('Guest');
    await guest.getByRole('button', { name: 'Join the room' }).click();
    await expect(page.getByText('2 joined', { exact: true })).toBeVisible();
    await page.bringToFront();
    await page.getByRole('button', { name: 'Start round', exact: true }).click();
    const arena = page.getByRole('application');
    await arena.scrollIntoViewIfNeeded();
    const box = await arena.boundingBox();
    if (!box) throw new Error('Missing arena');
    const length = Math.hypot(0.3, 0.7);
    await page.mouse.move(
      box.x + box.width * (0.5 + (0.7 / length) * 0.04),
      box.y + box.height * (0.5 - (0.3 / length) * 0.04),
    );
    await page.mouse.down();
    await expect(page.getByText(/30%.*70%|70%.*30%/)).toBeVisible();
    await expect(page.locator('.correction-force')).toBeAttached({ timeout: 8000 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Cancel round' }).click();
    await page.getByRole('link', { name: /cancelled.*Replay/ }).click();
    const href = await page.getByRole('link', { name: 'Download recording' }).getAttribute('href');
    if (!href) throw new Error('Missing download');
    const recording: Recording = await (await page.request.get(href)).json();
    expect(recording.config.mode).toBe('personalised-corrected');
    expect(recording.config.correctionRatio).toBe(0.16);
    expect(
      recording.frames.some(
        (f) => f.state.correction && Math.hypot(f.state.correction.x, f.state.correction.y) > 0,
      ),
    ).toBe(true);
    expect(recording.config.mappingVersion).toBe('angular-mixture-v1');
    expect(recording.participants.every((p) => p.layout?.length === 4)).toBe(true);
    expect(
      recording.frames.some((f) =>
        f.inputs.some((i) =>
          Object.values(i.optionWeights ?? {}).some((w) => Math.abs(w - 0.3) < 0.03),
        ),
      ),
    ).toBe(true);
    let state = initialState(recording.config);
    for (const frame of recording.frames) {
      for (const raw of frame.localInputs ?? []) {
        const layout = recording.participants.find((p) => p.id === raw.participantId)?.layout;
        if (!layout) throw new Error('Missing layout');
        expect(mapInput(raw, state.position, recording.options, layout, recording.config)).toEqual(
          frame.inputs.find((i) => i.participantId === raw.participantId),
        );
      }
      state = step(state, frame.inputs, recording.options, recording.config);
      expect(state).toEqual(frame.state);
    }
    await page
      .getByRole('combobox', { name: 'Replay view', exact: true })
      .selectOption(recording.participants[0].id);
    await expect(page.getByText(/Personal view — own magnet/)).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Replay view', exact: true })
      .selectOption('contributions');
    const contributionFrame = recording.frames.findIndex(
      (f) =>
        f.state.phase === 'active' &&
        f.state.elapsedMs > 0 &&
        f.inputs.some(
          (i) =>
            i.engaged && Object.values(i.optionWeights ?? {}).some((w) => Math.abs(w - 0.3) < 0.03),
        ),
    );
    expect(contributionFrame).toBeGreaterThanOrEqual(0);
    await page.getByRole('slider', { name: 'Round timeline' }).fill(String(contributionFrame));
    await expect(page.locator('.contribution-arrow')).toHaveCount(2);
    await expect(page.locator('.replay-magnet')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Option contributions' })).toContainText('Host:');
    const hostId = recording.participants.find((p) => p.name === 'Host')?.id;
    const guestId = recording.participants.find((p) => p.name === 'Guest')?.id;
    if (!hostId || !guestId) throw new Error('Missing participant');
    await page.getByRole('combobox', { name: 'Participant', exact: true }).selectOption(guestId);
    await expect(page.locator('.contribution-arrow')).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Participant', exact: true }).selectOption(hostId);
    await expect(page.locator('.contribution-arrow')).toHaveCount(2);
    await page.getByRole('combobox', { name: 'Replay view', exact: true }).selectOption('');
    await expect(page.locator('.contribution-arrow')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
