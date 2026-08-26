import { defineConfig, devices } from '@playwright/test';

/**
 * Browser journeys run against a throwaway Postgres (see `.env.e2e`), never the
 * Neon database dev and prod share. Both servers are started by Playwright so a
 * run is one command, and `reuseExistingServer` keeps the loop fast locally.
 */
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3030);
const API_PORT = Number(process.env.E2E_API_PORT ?? 3011);

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts',
  fullyParallel: false, // one shared database — parallel workers would race on it
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 120_000,
  expect: { timeout: 30_000 },
  globalSetup: './e2e/support/global-setup.ts',

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      // The real AppModule with MailService swapped for the file-backed
      // mailbox — that swap is what makes link/code journeys testable.
      command:
        'pnpm --filter @pawly/api exec ts-node -r tsconfig-paths/register --transpile-only test/e2e-server.ts',
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ...loadE2eEnv(),
        API_PORT: String(API_PORT),
        WEB_APP_URL: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      // --webpack, not Turbopack: Turbopack refuses to start when the repo's
      // node_modules is a symlink pointing outside the project root.
      command: `pnpm --filter @pawly/web exec next dev --webpack --port ${WEB_PORT}`,
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ...loadE2eEnv(),
        NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}`,
        PORT: String(WEB_PORT),
      },
    },
  ],
});

/**
 * Reads `.env.e2e` without pulling in a dotenv dependency at config level. The
 * file is gitignored (it holds a real connection string), so CI has no copy —
 * there the values come from the workflow's own environment instead.
 */
function loadE2eEnv(): Record<string, string> {
  const { readFileSync, existsSync } = require('node:fs') as typeof import('node:fs');
  const path = `${__dirname}/.env.e2e`;
  if (!existsSync(path)) return {};

  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}
