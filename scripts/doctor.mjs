import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const checks = [['Node', process.versions.node, process.versions.node === '26.13.0']];
for (const [tool, expected] of [['pnpm', '12.18.0'], ['python', '3.12.13'], ['uv', '0.11.28'], ['just', '1.58.0']]) {
  const result = spawnSync(tool, ['--version'], { encoding: 'utf8' });
  checks.push([tool, result.status === 0 ? result.stdout.trim() : 'unavailable', result.status === 0 && result.stdout.includes(expected)]);
}
for (const file of ['apps/polymind/node_modules/zod/package.json', 'apps/puck/node_modules/svelte/package.json', 'apps/puck/node_modules/better-sqlite3/package.json', 'packages/match/.venv/bin/python']) checks.push([file, await access(file).then(() => 'installed', () => 'missing'), await access(file).then(() => true, () => false)]);
for (const [name, value, ok] of checks) console.log(`${ok ? 'OK' : 'FAIL'} ${name}: ${value}`);
console.log(`Operator token: ${process.env.OPERATOR_TOKEN?.length >= 32 ? 'configured' : 'set OPERATOR_TOKEN (at least 32 characters)'}`);
console.log(`Transcription: ${process.env.TRANSCRIPTION_MODEL ? 'explicit model configured' : 'typed capture only'}`);
console.log(`Model credentials: ${['OPENAI_API_KEY', 'JEV_API_KEY'].filter((key) => !process.env[key]).join(', ') || 'configured'} ${['OPENAI_API_KEY', 'JEV_API_KEY'].some((key) => !process.env[key]) ? '(not configured; only needed for the chosen providers)' : ''}`);
if (checks.some(([, , ok]) => !ok)) process.exitCode = 1;
