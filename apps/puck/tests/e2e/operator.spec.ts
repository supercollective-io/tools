import { expect, test } from '@playwright/test';

test('API-created rooms use the ordinary operator page and room controls', async ({
  page,
  request,
  baseURL,
}) => {
  const secret = 'synthetic-e2e-operator-token-32-characters';
  const headers = {
    Authorization: `Bearer ${secret}`,
    Origin: baseURL ?? '',
    'Idempotency-Key': 'synthetic-browser-room-request-001',
  };
  const data = {
    question: 'Which synthetic route?',
    options: ['North', 'South'],
    mode: 'baseline',
  };
  expect((await request.get('/api/rooms')).status()).toBe(401);
  expect(
    (
      await request.post('/api/rooms', {
        headers: { ...headers, Origin: 'https://untrusted.example' },
        data,
      })
    ).status(),
  ).toBe(403);
  const created = await request.post('/api/rooms', { headers, data });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  expect(await (await request.post('/api/rooms', { headers, data })).json()).toEqual({ id });
  expect(
    (
      await request.post(`/api/rooms/${id}/host`, { headers: { Origin: baseURL ?? '' }, data: {} })
    ).status(),
  ).toBe(401);
  await page.goto(`/operator?room=${id}`);
  await page.getByLabel('Operator access token').fill(secret);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: data.question })).toBeVisible();
  await page.getByRole('button', { name: 'Open host controls' }).click();
  await expect(page.getByRole('button', { name: 'Start round', exact: true })).toBeVisible();
  const room = await (await page.request.get(`/api/rooms/${id}`)).json();
  expect(room.me).toMatchObject({ host: true, participating: false });
  expect(room.membership.registered).toBe(0);
  expect(room).not.toHaveProperty('operatorUrl');
  await page.goto('/operator');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  expect((await (await page.request.get(`/api/rooms/${id}`)).json()).me.host).toBe(false);
});
