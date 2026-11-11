const { COOLIFY_URL, COOLIFY_TOKEN, COOLIFY_STAGING_APP_UUID } = process.env;
if (!COOLIFY_URL || !COOLIFY_TOKEN || !COOLIFY_STAGING_APP_UUID) throw new Error('Set COOLIFY_URL, COOLIFY_TOKEN and COOLIFY_STAGING_APP_UUID for the preconfigured synthetic staging application.');
const origin = new URL(COOLIFY_URL);
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/') throw new Error('Use the authenticated Coolify HTTPS origin.');
async function api(path, options = {}) {
  const response = await fetch(new URL(`/api/v1/${path}`, origin), { ...options, headers: { Authorization: `Bearer ${COOLIFY_TOKEN}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok) throw new Error(`Coolify request failed (${response.status}); inspect the resource before retrying.`);
  return response.json();
}
const deployed = await api('deploy', { method: 'POST', body: JSON.stringify({ uuid: COOLIFY_STAGING_APP_UUID }) });
const id = deployed.deployments?.[0]?.deployment_uuid;
if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Deployment response did not identify a deployment. Inspect Coolify; do not blindly redeploy.');
console.log(`Deployment queued: ${id}`);
const deadline = Date.now() + 15 * 60 * 1000;
while (Date.now() < deadline) {
  const value = await api(`deployments/${id}`);
  const state = value.status ?? value.deployment?.status;
  if (state === 'finished') { console.log(`Deployment finished: ${id}. Run smoke-staging and verify the actual revision and volume.`); process.exit(0); }
  if (['failed', 'cancelled', 'canceled', 'cancelled-by-user'].includes(state)) throw new Error(`Deployment ${state}: ${id}; inspect Coolify logs.`);
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
throw new Error(`Deployment still pending: ${id}. Inspect that deployment before another action.`);
