/**
 * Which procedures an EMPLOYEE token may call.
 *
 * The clinic boundary is covered in `multi-tenancy.e2e-spec.ts`; this suite is
 * about the boundary *inside* a clinic. Some procedures check
 * `ctx.user.role !== 'ADMIN'` and some do not, and the difference is not
 * documented anywhere — so it is pinned here, including the places where the
 * check is missing.
 */
import { createTestHarness, type TestHarness } from './harness';
import { SEED, resetThrottle, trpcData } from './helpers';

describe('Role boundaries inside a clinic (integration)', () => {
  let harness: TestHarness;
  let employeeToken: string;

  /** Employees are passwordless: the only way in is the emailed code. */
  async function signInAsEmployee(email: string): Promise<string> {
    resetThrottle(harness);
    harness.mailbox.reset();
    await harness.http().post('/auth/otp/request').send({ email }).expect(201);

    const otp = harness.mailbox.read().find((m) => m.type === 'sendOtpCode' && m.to === email);
    if (!otp?.code) throw new Error(`No OTP captured for ${email}`);

    const res = await harness
      .http()
      .post('/auth/otp/verify')
      .send({ email, code: otp.code })
      .expect(201);
    return res.body.access_token as string;
  }

  beforeAll(async () => {
    harness = await createTestHarness();
    employeeToken = await signInAsEmployee(SEED.employeeEmail);
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('procedures that do enforce the admin role', () => {
    it('dashboard.getStats answers "Admin only"', async () => {
      const res = await harness.trpcQuery('dashboard.getStats', undefined, employeeToken);
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).toContain('Admin only');
    });
  });

  describe('procedures that do not', () => {
    /**
     * PRODUCT BUG — the clinic roster is readable by any employee.
     *
     * `employee.list` is a plain `subscribedProcedure` (authenticated +
     * subscribed) with no role check, unlike `dashboard.getStats` above and
     * unlike the three procedures further down this same router that do test
     * `ctx.user.role !== 'ADMIN'`. An employee calling the API directly gets
     * every colleague's record: names, emails, phone numbers, contract types
     * and contract hours.
     *
     * The web app does not expose this today — the admin layout's onboarding
     * lookup bounces a non-admin before the page renders — so the exposure is
     * API-only. That is not a mitigation: the token is the employee's own and
     * the call is one request.
     *
     * Fix: gate `employee.list` on the admin role, or return a reduced
     * projection (first name, colour, job type) for non-admin callers, which is
     * all the planning views actually need.
     */
    it.failing('employee.list is refused to an employee', async () => {
      const res = await harness.trpcQuery('employee.list', {}, employeeToken);
      expect(res.status).toBe(403);
    });

    it('employee.list currently returns the full roster — pinned so a fix is noticed', async () => {
      const roster = trpcData<Array<Record<string, unknown>>>(
        await harness.trpcQuery('employee.list', {}, employeeToken),
      );

      expect(Array.isArray(roster)).toBe(true);
      // The fields that make this a disclosure rather than a lookup.
      expect(roster[0]).toHaveProperty('email');
      expect(roster[0]).toHaveProperty('contractHours');
    });

    /**
     * Billing state is admin business, and this one answers an employee too.
     * Lower stakes than the roster — tier and status, no payment data — but the
     * same missing check.
     */
    it.failing('stripe.getSubscriptionStatus is refused to an employee', async () => {
      const res = await harness.trpcQuery('stripe.getSubscriptionStatus', undefined, employeeToken);
      expect(res.status).toBe(403);
    });
  });
});
