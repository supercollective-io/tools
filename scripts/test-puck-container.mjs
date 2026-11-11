// Synthetic loopback checks against the independently built Puck image.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const image = process.env.PUCK_TEST_IMAGE ?? 'puck:local-candidate';
const name = `puck-check-${process.pid}-${Date.now()}`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 120000 }).trim();
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once('error', reject);
  reservation.listen(0, '127.0.0.1', resolve);
});
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
async function ready() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(1000) }).then(r => r.ok, () => false)) return;
    await delay(500);
  }
  throw new Error('Puck image did not become ready');
}
let created = false;
try {
  docker('run', '--detach', '--name', name, '--publish', `127.0.0.1:${port}:3000`,
    '--env', `PUBLIC_ORIGIN=${origin}`, image);
  created = true;
  await ready();
  assert.equal(docker('exec', name, 'id', '-u'), '1000');
  docker('exec', name, 'node', '-e', `
    const fs = require('node:fs');
    for (const name of ['typescript', 'vitest', '@playwright/test', '@biomejs/biome']) {
      try { require.resolve(name); throw new Error('Development dependency present: ' + name); }
      catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
    }
    if (fs.existsSync('/app/apps/polymind') || fs.existsSync('/app/packages/match'))
      throw new Error('Unrelated runtime present');
  `);
  const response = await fetch(`${origin}/api/rooms`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'Synthetic restart check', options: ['A', 'B'] }),
  });
  assert.equal(response.status, 201);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const { id } = await response.json();
  // Real HTTP admission, WebSocket inputs and replay through the production image.
  await new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['--dir', 'apps/puck', 'load:smoke', '--', origin, '2'], { stdio: 'inherit' });
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('WebSocket smoke timed out')); }, 120000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`WebSocket smoke exited ${code}`)); });
  });
  docker('restart', '--time', '10', name);
  await ready();
  const restored = await fetch(`${origin}/api/rooms/${id}`, { headers: { cookie } });
  assert.equal(restored.status, 200);
  const room = await restored.json();
  assert.equal(room.question, 'Synthetic restart check');
  assert.equal(room.me.host, true);
  console.log('Puck image: non-root health, production isolation, two-client WebSockets/replay and room/host persistence passed.');
} finally {
  // -v removes only the anonymous test volume created by this container.
  if (created) docker('rm', '--force', '--volumes', name);
}
