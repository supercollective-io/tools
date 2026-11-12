import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('production startup', () => {
  it.each([
    undefined,
    '',
    '   ',
    '$COOLIFY_URL',
    'https://puck.example/',
    'https://user:secret@puck.example',
    'ftp://puck.example',
  ])('rejects a missing or invalid public origin (%s) before opening data', (value) => {
    const directory = mkdtempSync(join(tmpdir(), 'origin-startup-'));
    const dataPath = join(directory, 'data');
    try {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_PATH: dataPath,
      };
      delete env.PUBLIC_ORIGIN;
      if (value !== undefined) env.PUBLIC_ORIGIN = value;
      const result = spawnSync(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env,
        encoding: 'utf8',
        timeout: 10000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        value?.trim()
          ? 'PUBLIC_ORIGIN must be an exact HTTP(S) origin'
          : 'Set PUBLIC_ORIGIN to the public origin before starting Puck in production.',
      );
      expect(existsSync(dataPath)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
