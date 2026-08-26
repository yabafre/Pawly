import { request as playwrightRequest } from '@playwright/test';

/**
 * `next dev` compiles a route the first time it is requested, and that first
 * hit routinely costs more than a test's own timeout — which surfaces as a
 * flaky "element not found" on whichever test happened to go first. Paying the
 * compilation once, up front, keeps the timeouts measuring the application
 * rather than the bundler.
 */
const ROUTES = [
  '/fr/login',
  '/en/login',
  '/fr/dashboard',
  '/fr/dashboard/schedule',
  '/fr/dashboard/absences',
  '/en/dashboard/schedule',
  '/fr/admin/employees',
  '/fr/admin/planning',
  '/fr/admin/settings',
];

export default async function globalSetup(): Promise<void> {
  const baseURL = `http://localhost:${process.env.E2E_WEB_PORT ?? 3030}`;
  const context = await playwrightRequest.newContext({ baseURL });

  // Sequential on purpose: nine parallel first-compiles are enough to make the
  // dev server thrash and answer 500 to the very requests meant to warm it.
  for (const route of ROUTES) {
    await context.get(route, { timeout: 180_000, failOnStatusCode: false }).catch(() => undefined);
  }

  await context.dispose();
}
