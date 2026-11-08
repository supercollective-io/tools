import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'puck-e2e-'));
process.env.DATABASE_PATH = join(dir, 'puck.sqlite');
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
await import('../server/index.ts');
