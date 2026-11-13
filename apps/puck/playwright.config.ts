import { defineConfig, devices } from '@playwright/test';

const port = process.env.E2E_PORT ?? '4173';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error('E2E_PORT must be an integer between 1 and 65535.');
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec tsx scripts/test-server.ts',
    url: `${baseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      PORT: port,
      HOST: '127.0.0.1',
      PUBLIC_ORIGIN: baseURL,
      PUCK_OPERATOR_TOKEN: 'synthetic-e2e-operator-token-32-characters',
    },
  },
});
