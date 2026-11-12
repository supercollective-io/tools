import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runtimeOrigin } from '../runtime-origin.mjs';

for (const key of ['PUBLIC_ORIGIN', 'HUB_PUBLIC_ORIGIN']) {
  test(`${key}: explicit override takes precedence`, () => {
    assert.equal(runtimeOrigin({ [key]: 'https://override.example/', COOLIFY_URL: 'invalid' }, key), 'https://override.example');
  });
  test(`${key}: canonical domain and www alias work in either order`, () => {
    for (const value of ['https://puck.example,https://www.puck.example', 'https://www.puck.example/, https://puck.example/'])
      assert.equal(runtimeOrigin({ COOLIFY_URL: value }, key), 'https://puck.example');
    assert.equal(runtimeOrigin({ COOLIFY_URL: 'https://www.puck.example' }, key), 'https://www.puck.example');
    assert.equal(runtimeOrigin({ COOLIFY_URL: 'http://127.0.0.1:4273' }, key), 'http://127.0.0.1:4273');
  });
  test(`${key}: missing, malformed and ambiguous configuration fails`, () => {
    for (const env of [{}, { [key]: '' }, { [key]: '$COOLIFY_URL' },
      ...['', 'https://a.example,https://b.example', 'https://a.example,http://a.example',
        'https://user:secret@a.example', 'https://a.example/path', 'https://a.example?x=1',
        'https://a.example,', 'ftp://a.example'].map(COOLIFY_URL => ({ COOLIFY_URL }))])
      assert.throws(() => runtimeOrigin(env, key));
  });
  test(`${key}: entrypoint exports the selected origin to its command`, () => {
    const env = { ...process.env, COOLIFY_URL: 'https://www.puck.example,https://puck.example' };
    delete env[key];
    const result = spawnSync('sh', [fileURLToPath(new URL('../runtime-entrypoint.sh', import.meta.url)),
      key, process.execPath, '-e', `process.stdout.write(process.env.${key})`], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'https://puck.example');
    const failed = spawnSync('sh', [fileURLToPath(new URL('../runtime-entrypoint.sh', import.meta.url)),
      key, process.execPath, '-e', 'console.log("COMMAND_STARTED")'], { env: { ...env, COOLIFY_URL: '' }, encoding: 'utf8' });
    assert.equal(failed.status, 1);
    assert.equal(failed.stdout, '');
    assert.match(failed.stderr, /configure a domain/);
  });
}
