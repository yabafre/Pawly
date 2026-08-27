import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';

export const SEED = {
  clinicName: 'Clinique Zen Dev',
  adminEmail: 'admin@pawly.local',
  adminPassword: 'Admin123!',
  employeeEmail: 'employee@pawly.local',
  employeeFirstName: 'Camille',
} as const;

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3011';

export interface CapturedMail {
  type: string;
  to: string;
  url?: string;
  code?: string;
  args: unknown[];
  sentAt: string;
}

/**
 * The mails the API would have sent, newest last. Backed by the stub installed
 * in `apps/api/test/e2e-server.ts`.
 */
export class Mailbox {
  constructor(private readonly request: APIRequestContext) {}

  async all(): Promise<CapturedMail[]> {
    const res = await this.request.get(`${API}/__e2e__/mailbox`);
    return (await res.json()) as CapturedMail[];
  }

  async clear(): Promise<void> {
    await this.request.delete(`${API}/__e2e__/mailbox`);
  }

  /**
   * Polls because the send is often a side effect the request under test does
   * not await (invitations are deliberately fire-and-forget).
   */
  async waitFor(
    predicate: (mail: CapturedMail) => boolean,
    timeoutMs = 15_000,
  ): Promise<CapturedMail> {
    const deadline = Date.now() + timeoutMs;
    let seen: CapturedMail[] = [];
    while (Date.now() < deadline) {
      seen = await this.all();
      const hit = [...seen].reverse().find(predicate);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(
      `No mail matched within ${timeoutMs}ms. Mailbox held: ${
        seen.map((m) => `${m.type}→${m.to}`).join(', ') || '(empty)'
      }`,
    );
  }
}

/**
 * Signs in through the API and plants the cookie the app reads, instead of
 * driving the login form. Journeys that are *about* logging in use the form;
 * every other journey just needs to be past the door.
 */
export async function signIn(
  page: Page,
  request: APIRequestContext,
  email = SEED.adminEmail,
  password = SEED.adminPassword,
): Promise<void> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  if (!res.ok()) throw new Error(`Sign-in failed for ${email}: ${res.status()} ${await res.text()}`);
  const { access_token: token } = (await res.json()) as { access_token: string };
  await page.context().addCookies([
    { name: 'auth-token', value: token, domain: 'localhost', path: '/' },
  ]);
}

/**
 * Puts the per-IP auth throttler back at zero. Every test dials from the same
 * loopback address, so a run that exercises more than a handful of auth flows
 * would 429 on itself — a failure that looks like a broken login but is the
 * suite fighting the rate limiter. A test that *means* to hit the limit simply
 * does not call this.
 */
export async function resetThrottle(request: APIRequestContext): Promise<void> {
  await request.delete(`${API}/__e2e__/throttle`);
}

/**
 * Employees have no password — their account is passwordless by design — so the
 * only way in is the code they are emailed. Runs the exchange over the API and
 * plants the resulting cookie, the same shortcut `signIn` takes for admins.
 */
export async function signInAsEmployee(
  page: Page,
  request: APIRequestContext,
  email = SEED.employeeEmail,
): Promise<void> {
  const mailbox = new Mailbox(request);
  await resetThrottle(request);
  await request.post(`${API}/auth/otp/request`, { data: { email } });

  const mail = await mailbox.waitFor((m) => m.type === 'sendOtpCode' && m.to === email);
  const res = await request.post(`${API}/auth/otp/verify`, {
    data: { email, code: mail.code },
  });
  if (!res.ok()) {
    throw new Error(`OTP sign-in failed for ${email}: ${res.status()} ${await res.text()}`);
  }

  const { access_token: token } = (await res.json()) as { access_token: string };
  await page.context().addCookies([
    { name: 'auth-token', value: token, domain: 'localhost', path: '/' },
  ]);
}

export const test = base.extend<{ mailbox: Mailbox }>({
  mailbox: async ({ request }, use) => {
    const mailbox = new Mailbox(request);
    await mailbox.clear();
    await resetThrottle(request);
    await use(mailbox);
  },
});

export { expect };
