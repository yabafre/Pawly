import type { APIRequestContext } from '@playwright/test';
import { SEED } from './fixtures';

// `127.0.0.1`, not `localhost`: Node resolves `localhost` to `::1` first, and an
// API bound to IPv4 only then refuses every request from the runner while curl
// (which falls back) happily reports it healthy.
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3011').replace(
  '//localhost:',
  '//127.0.0.1:'
);

/**
 * Fixtures a journey needs but is not itself testing go through the API, not
 * through the UI: a test about renaming an employee should fail when renaming
 * breaks, not when the create dialog moves. The browser never takes this path —
 * it always goes Component → Hook → Zsa → Server Action → tRPC.
 */

let e2eApiVerified = false;

/**
 * Refuses to touch anything unless the host on the E2E port is really the E2E
 * server. `/__e2e__/mailbox` only exists in `test/e2e-server.ts`; a dev API
 * booted on the same port would answer to the same routes while pointing at the
 * Neon database, and the first mutation would land in production.
 */
export async function assertE2eApi(request: APIRequestContext): Promise<void> {
  if (e2eApiVerified) return;
  const res = await request.get(`${API}/__e2e__/mailbox`);
  if (!res.ok()) {
    throw new Error(
      `${API} does not expose the E2E mailbox — something other than test/e2e-server.ts is on that port. Refusing to run.`
    );
  }
  e2eApiVerified = true;
}

/**
 * A `Bearer` token for the API.
 *
 * Deliberately through tRPC rather than `POST /auth/login`: the REST route is
 * rate-limited to 5 calls a minute per IP by the global ThrottlerGuard, which a
 * suite re-authenticating every test blows through in three tests. tRPC is
 * mounted as raw Express middleware, so the guard never sees it — the browser
 * takes that same path. Memoized on top, since the token is a 24h JWT.
 */
const tokenCache = new Map<string, string>();

export async function apiToken(
  request: APIRequestContext,
  email = SEED.adminEmail,
  password = SEED.adminPassword
): Promise<string> {
  const key = `${email}:${password}`;
  const cached = tokenCache.get(key);
  if (cached) return cached;

  await assertE2eApi(request);
  const { access_token: token } = await trpcMutation<{ access_token: string }>(
    request,
    undefined,
    'auth.login',
    { email, password }
  );
  tokenCache.set(key, token);
  return token;
}

/** Drops a cached token — for the journey that deliberately changes a password. */
export function forgetToken(email: string, password: string): void {
  tokenCache.delete(`${email}:${password}`);
}

/**
 * Plants the auth cookie from a (cached) token. Same effect as the harness's
 * `signIn`, without a second throttled login per test.
 */
export async function signInAs(
  page: import('@playwright/test').Page,
  request: APIRequestContext,
  email = SEED.adminEmail,
  password = SEED.adminPassword
): Promise<void> {
  const token = await apiToken(request, email, password);
  await page
    .context()
    .addCookies([{ name: 'auth-token', value: token, domain: 'localhost', path: '/' }]);
}

function headers(token?: string): Record<string, string> {
  // `x-trpc-source` is what the production CSRF guard checks; without it every
  // mutation is a 403, here as in production.
  return {
    'content-type': 'application/json',
    'x-trpc-source': 'e2e',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

/** Unwraps the superjson envelope the server's transformer wraps replies in. */
async function unwrap<T>(
  res: { ok(): boolean; status(): number; text(): Promise<string> },
  path: string
): Promise<T> {
  const body = await res.text();
  if (!res.ok()) throw new Error(`tRPC ${path} → ${res.status()}: ${body}`);
  const parsed = JSON.parse(body) as { result?: { data?: { json?: T } } };
  return parsed.result?.data?.json as T;
}

export async function trpcQuery<T>(
  request: APIRequestContext,
  token: string | undefined,
  path: string,
  input?: unknown
): Promise<T> {
  const query =
    input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const res = await request.get(`${API}/trpc/${path}${query}`, { headers: headers(token) });
  return unwrap<T>(res, path);
}

export async function trpcMutation<T>(
  request: APIRequestContext,
  token: string | undefined,
  path: string,
  input?: unknown
): Promise<T> {
  const res = await request.post(`${API}/trpc/${path}`, {
    headers: headers(token),
    data: JSON.stringify({ json: input ?? {} }),
  });
  return unwrap<T>(res, path);
}

/** Collision-proof across parallel files and across re-runs on the same DB. */
export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.test`;
}

/** Same idea for names, so a locator can target exactly one card. */
export function uniqueLastName(prefix = 'Testeur'): string {
  return `${prefix}${Date.now().toString().slice(-7)}`;
}

export interface ApiEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  jobType: string;
  contractType: string;
  contractHours: number;
  color: string;
  isActive: boolean;
  userId: string | null;
}

export async function createEmployee(
  request: APIRequestContext,
  token: string,
  overrides: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    jobType: string;
    contractType: string;
    contractHours: number;
    color: string;
    hireDate: string;
  }> = {}
): Promise<ApiEmployee> {
  return trpcMutation<ApiEmployee>(request, token, 'employee.create', {
    firstName: 'Test',
    lastName: uniqueLastName(),
    email: uniqueEmail(),
    jobType: 'ASV',
    contractType: 'CDI',
    contractHours: 35,
    color: '#3b82f6',
    hireDate: '2026-01-05T00:00:00.000Z',
    ...overrides,
  });
}

/**
 * Teardown. The starter tier caps a clinic at 10 *active* employees, so a suite
 * that creates without deactivating poisons every later run.
 */
export async function deactivateEmployee(
  request: APIRequestContext,
  token: string,
  id: string
): Promise<void> {
  await trpcMutation(request, token, 'employee.toggleActive', { id });
}

export async function listEmployees(
  request: APIRequestContext,
  token: string,
  includeInactive = true
): Promise<ApiEmployee[]> {
  return trpcQuery<ApiEmployee[]>(request, token, 'employee.list', { includeInactive });
}

/**
 * Puts a known password back on an admin account through the real reset flow —
 * used as teardown by the journey that changes it, so a mid-test failure cannot
 * lock every later run out of the seed admin.
 */
export async function forceAdminPassword(
  request: APIRequestContext,
  mailbox: { waitFor: (p: (m: { type: string; to: string; url?: string }) => boolean, ms?: number) => Promise<{ url?: string }> },
  email: string,
  password: string,
): Promise<void> {
  await trpcMutation(request, undefined, 'auth.requestPasswordReset', { email });
  const mail = await mailbox.waitFor((m) => m.type === 'sendPasswordResetEmail' && m.to === email);
  const token = new URL(mail.url as string).searchParams.get('token');
  await trpcMutation(request, undefined, 'auth.resetPassword', { token, password });
}

export interface Tenant {
  token: string;
  adminEmail: string;
  adminPassword: string;
  clinicName: string;
}

/**
 * A second clinic, built the way the Stripe registration path builds one, then
 * pushed past onboarding so its admin lands on real screens. Multi-tenant
 * assertions need a neighbour that actually exists.
 */
export async function registerTenant(
  request: APIRequestContext,
  label = 'Voisine',
): Promise<Tenant> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const clinicName = `Clinique ${label} ${stamp}`;
  const adminEmail = `admin-${stamp}@example.test`;
  const adminPassword = 'VoisineMdp2026!';

  await trpcMutation(request, undefined, 'auth.register', {
    clinicName,
    adminName: `Admin ${label}`,
    email: adminEmail,
    password: adminPassword,
  });

  const token = await apiToken(request, adminEmail, adminPassword);
  await trpcMutation(request, token, 'clinic.completeOnboarding', {
    clinicName,
    workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    defaultStartTime: '08:00',
    defaultEndTime: '19:00',
    is24_7: false,
    shiftTypes: [
      {
        name: 'Journée',
        code: 'JOUR',
        startTime: '09:00',
        endTime: '17:00',
        breakMinutes: 60,
        color: '#14b8a6',
      },
    ],
  });

  // The product tour auto-starts for an admin who has never finished it, and it
  // drives `router.push` from step to step behind a driver.js overlay. Left on,
  // it navigates away mid-test and swallows clicks. Marking it done is exactly
  // what a returning admin's account looks like.
  await trpcMutation(request, token, 'tour.complete', { tourKey: 'admin' });

  return { token, adminEmail, adminPassword, clinicName };
}

export const SHIFT_TYPE = {
  code: 'JOUR',
  name: 'Journée',
  startTime: '09:00',
  endTime: '17:00',
  breakMinutes: 60,
  color: '#14b8a6',
} as const;

export interface ProvisionedClinic extends Tenant {
  employees: ApiEmployee[];
  templateId: string;
}

/**
 * A clinic that can actually be planned: config + one shift type (from
 * `registerTenant`), a handful of employees, and a Mon–Fri template pointing at
 * that shift type. `requiredStaff` above the headcount is how a test forces
 * holes on purpose.
 */
export async function provisionClinic(
  request: APIRequestContext,
  options: {
    label?: string;
    professional?: boolean;
    employees?: number;
    requiredStaff?: number;
    days?: number[];
  } = {}
): Promise<ProvisionedClinic> {
  const {
    label = 'Planning',
    professional = false,
    employees: headcount = 3,
    requiredStaff = 1,
    days = [1, 2, 3, 4, 5],
  } = options;

  const tenant = await registerTenant(request, label);
  if (professional) {
    const { grantProfessionalTier } = await import('./db');
    await grantProfessionalTier(tenant.adminEmail);
  }

  const jobTypes = ['VET', 'ASV', 'ASV', 'VET', 'ASV'];
  const employees: ApiEmployee[] = [];
  for (let i = 0; i < headcount; i++) {
    employees.push(
      await createEmployee(request, tenant.token, {
        firstName: `Emp${i + 1}`,
        lastName: uniqueLastName('Equipe'),
        email: uniqueEmail(`emp${i + 1}`),
        jobType: jobTypes[i % jobTypes.length],
        contractHours: 35,
      })
    );
  }

  const template = await trpcMutation<{ id: string }>(
    request,
    tenant.token,
    'planning.createTemplate',
    {
      name: 'Semaine type E2E',
      data: {
        days: days.map((dayOfWeek) => ({
          dayOfWeek,
          slots: [{ shiftTypeCode: SHIFT_TYPE.code, requiredStaff }],
        })),
      },
    }
  );

  return { ...tenant, employees, templateId: template.id };
}

/** A month far enough ahead that nothing else in the suite has touched it. */
export function futureMonth(offset = 2): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
