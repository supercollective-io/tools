import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec tsx scripts/test-server.ts',
    url: 'http://localhost:4173/healthz',
    reuseExistingServer: false,
    timeout: 120000,
    env: { PORT: '4173', HOST: '127.0.0.1', PUBLIC_ORIGIN: 'http://localhost:4173' },
  },
});
