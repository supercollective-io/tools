import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';

const image = process.argv[2] ?? 'hub:local-candidate';
const name = `rehearsing-we-hub-smoke-${randomUUID().slice(0, 8)}`;
const volume = `${name}-data`;
const password = 'synthetic-container-smoke-password';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const origin = 'https://we.supercollective.io';
const authorization = `Basic ${Buffer.from(`organiser:${password}`).toString('base64')}`;
let started = false;
async function ready(base, path = '/healthz') {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response.json();
    } catch { /* A disposable container can take a moment to start. */ }
    await pause(100);
  }
  throw new Error('Container did not become ready');
}
try {
  docker('volume', 'create', volume);
  docker('run', '--detach', '--rm', '--name', name, '--publish', '127.0.0.1::3000',
    '--mount', `type=volume,source=${volume},target=/data`, '--env', `HUB_OPERATOR_PASSWORD=${password}`, '--env', `COOLIFY_URL=https://www.we.supercollective.io,${origin}`, image);
  started = true;
  let base = `http://${docker('port', name, '3000/tcp')}`;
  await ready(base);
  assert.equal(docker('exec', name, 'id', '-u'), '1000');
  const state = await (await fetch(`${base}/api/operator/state`, { headers: { authorization } })).json();
  const digital = state.activities.find(activity => activity.id === 'polymind');
  digital.status = 'ready'; digital.url = 'https://polymind.supercollective.io/?session=synthetic';
  const saved = await fetch(`${base}/api/operator/state`, { method: 'PUT',
    headers: { authorization, origin, 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRevision: state.revision, activeId: 'polymind', activities: state.activities }) });
  assert.equal(saved.status, 200);
  docker('restart', name);
  // Docker can reassign an automatically selected host port on restart.
  base = `http://${docker('port', name, '3000/tcp')}`;
  const current = await ready(base, '/api/current');
  assert.equal(current.revision, 2); assert.equal(current.current.id, 'polymind');
  let health;
  for (let attempt = 0; attempt < 100; attempt++) {
    health = docker('inspect', '--format', '{{.State.Health.Status}}', name);
    if (health === 'healthy') break;
    await pause(200);
  }
  assert.equal(health, 'healthy');
  const evidence = { node: '26.13.0',
    baseImage: 'node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68',
    imageId: docker('image', 'inspect', '--format', '{{.Id}}', image),
    checks: {
      runtimeUser: docker('inspect', '--format', '{{.Config.User}}', name), runtimeUid: 1000,
      dockerHealth: health, persistedRevisionAfterRestart: 2 },
    limits: ['Local container smoke only; not a Coolify deployment',
      'Public DNS/TLS and actual-phone/venue tests remain pending'] };
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  if (started) console.error(docker('logs', name));
  throw error;
} finally {
  if (started) docker('stop', name);
  docker('volume', 'rm', volume);
}
