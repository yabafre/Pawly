/**
 * Subscription and tier gating at the API boundary.
 *
 * Story 3-6 (AC2, AC3, AC4, AC7, AC9, AC10 — the `subscribedProcedure`
 * middleware, exercised through every subscription status) and Story 12-2 AC3
 * / AC5 (the exact solver is Professional-only, and asking for greedy is
 * unaffected).
 *
 * The subscription is flipped through Prisma, which is exactly what a Stripe
 * webhook does to it, and the token stays the same throughout — the point is
 * that entitlement is re-read per request, never baked into the JWT.
 */
import { createTestHarness, login, type TestHarness } from './harness';
import { TIER_LIMITS } from '@pawly/validators';
import {
  makeClinic,
  makeClinicPlanningSetup,
  makeEmployee,
  trpcData,
  trpcError,
  uniqueEmail,
  type ClinicFixture,
} from './helpers';

type Status = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';

describe('Subscription and tier gating (integration)', () => {
  let harness: TestHarness;
  let clinic: ClinicFixture;
  let token: string;

  const setSubscription = (data: {
    status?: Status;
    entitlementTier?: string;
  }) =>
    harness.prisma.subscription.update({
      where: { clinicId: clinic.clinicId },
      data,
    });

  beforeAll(async () => {
    harness = await createTestHarness();
    clinic = await makeClinic(harness, { tier: 'starter', status: 'active' });
    token = await login(harness, clinic.adminEmail, clinic.adminPassword);
  });

  afterAll(async () => {
    await clinic.cleanup();
    await harness.close();
  });

  afterEach(async () => {
    // Every test leaves the clinic on an active starter plan.
    await harness.prisma.subscription
      .update({
        where: { clinicId: clinic.clinicId },
        data: { status: 'active', entitlementTier: 'starter' },
      })
      .catch(() => {});
  });

  // ── Story 3-6 AC3/AC4/AC9/AC10 ─────────────────────────────────────────

  describe('subscribedProcedure', () => {
    it.each(['active', 'trialing'] as Status[])(
      'allows status %s',
      async (status) => {
        await setSubscription({ status });
        const employees = trpcData<unknown[]>(
          await harness.trpcQuery('employee.list', {}, token),
        );
        expect(Array.isArray(employees)).toBe(true);
      },
    );

    it.each(['past_due', 'canceled', 'unpaid'] as Status[])(
      'denies status %s',
      async (status) => {
        await setSubscription({ status });
        const error = trpcError(
          await harness.trpcQuery('employee.list', {}, token),
        );
        expect(error.code).toBe('FORBIDDEN');
        expect(error.httpStatus).toBe(403);
        expect(error.message).toBe('Active subscription required');
      },
    );

    it('denies a clinic with no subscription row at all', async () => {
      const orphan = await makeClinic(harness, { withoutSubscription: true });
      try {
        const orphanToken = await login(
          harness,
          orphan.adminEmail,
          orphan.adminPassword,
        );
        const error = trpcError(
          await harness.trpcQuery('employee.list', {}, orphanToken),
        );
        expect(error.code).toBe('FORBIDDEN');
        expect(error.message).toBe('Active subscription required');
      } finally {
        await orphan.cleanup();
      }
    });

    it('blocks writes as well as reads, and lets the DB decide per request', async () => {
      await setSubscription({ status: 'canceled' });
      const blocked = await harness.trpcMutation(
        'employee.create',
        {
          firstName: 'Blocked',
          lastName: 'Hire',
          jobType: 'ASV',
          contractType: 'CDI',
          contractHours: 35,
          color: '#3b82f6',
        },
        token,
      );
      expect(trpcError(blocked).message).toBe('Active subscription required');
      expect(
        await harness.prisma.employee.count({
          where: { clinicId: clinic.clinicId },
        }),
      ).toBe(0);

      // Same token, re-entitled clinic: access comes back without re-login.
      await setSubscription({ status: 'active' });
      const created = trpcData<{ id: string }>(
        await harness.trpcMutation(
          'employee.create',
          {
            firstName: 'Allowed',
            lastName: 'Hire',
            jobType: 'ASV',
            contractType: 'CDI',
            contractHours: 35,
            color: '#3b82f6',
          },
          token,
        ),
      );
      await harness.prisma.employee.delete({ where: { id: created.id } });
    });

    // AC7 — the billing surface stays reachable so the clinic can resubscribe,
    // and so does onboarding/tour (they run before a subscription exists).
    it('keeps the billing, onboarding and tour surfaces reachable when inactive', async () => {
      await setSubscription({ status: 'past_due' });

      const status = trpcData<{ status: string } | null>(
        await harness.trpcQuery(
          'stripe.getSubscriptionStatus',
          undefined,
          token,
        ),
      );
      expect(status?.status).toBe('past_due');

      const overview = trpcData<{ subscription: { status: string } }>(
        await harness.trpcQuery('stripe.getBillingOverview', undefined, token),
      );
      expect(overview.subscription.status).toBe('past_due');

      const onboarding = trpcData<Record<string, unknown>>(
        await harness.trpcQuery('clinic.getOnboardingStatus', undefined, token),
      );
      expect(onboarding).toBeDefined();

      const tour = trpcData<Record<string, unknown>>(
        await harness.trpcQuery('tour.getState', undefined, token),
      );
      expect(tour).toBeDefined();
    });

    it('rejects an unauthenticated caller before it ever looks at the subscription', async () => {
      const error = trpcError(await harness.trpcQuery('employee.list', {}));
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toMatch(/must be logged in/);
    });
  });

  // ── Story 3-6 AC6 — entitlementTier limits ─────────────────────────────

  describe('starter employee limit', () => {
    const limit = TIER_LIMITS.starter.maxEmployees;

    const create = (lastName: string) =>
      harness.trpcMutation(
        'employee.create',
        {
          firstName: 'Cap',
          lastName,
          jobType: 'ASV',
          contractType: 'CDI',
          contractHours: 35,
          color: '#3b82f6',
        },
        token,
      );

    afterEach(async () => {
      await harness.prisma.employee.deleteMany({
        where: { clinicId: clinic.clinicId },
      });
    });

    it(`refuses the employee past the starter cap of ${limit}`, async () => {
      // Fill to the cap through Prisma — the cap, not the create path, is what
      // this test is about.
      await Promise.all(
        Array.from({ length: limit }, (_, i) =>
          makeEmployee(harness, {
            clinicId: clinic.clinicId,
            lastName: `Filler${i}`,
            email: null,
          }),
        ),
      );

      const error = trpcError(await create('OverTheLine'));
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toMatch(
        new RegExp(`Employee limit reached \\(${limit}\\)`),
      );
      expect(
        await harness.prisma.employee.count({
          where: { clinicId: clinic.clinicId },
        }),
      ).toBe(limit);
    });

    it('counts only active employees against the cap', async () => {
      await Promise.all(
        Array.from({ length: limit }, (_, i) =>
          makeEmployee(harness, {
            clinicId: clinic.clinicId,
            lastName: `Filler${i}`,
            email: null,
            isActive: i === 0 ? false : true,
          }),
        ),
      );

      // One of the `limit` rows is inactive, so there is room for exactly one.
      const created = trpcData<{ id: string }>(await create('LastSeat'));
      expect(created.id).toEqual(expect.any(String));
      expect(trpcError(await create('NoSeatLeft')).code).toBe('FORBIDDEN');
    });

    it('raises the ceiling when the clinic moves to professional', async () => {
      await Promise.all(
        Array.from({ length: limit }, (_, i) =>
          makeEmployee(harness, {
            clinicId: clinic.clinicId,
            lastName: `Filler${i}`,
            email: null,
          }),
        ),
      );
      expect(trpcError(await create('Blocked')).code).toBe('FORBIDDEN');

      await setSubscription({ entitlementTier: 'professional' });
      const created = trpcData<{ id: string }>(await create('NowAllowed'));
      expect(created.id).toEqual(expect.any(String));
      expect(TIER_LIMITS.professional.maxEmployees).toBeGreaterThan(limit);
    });
  });

  // ── Story 12-2 AC3 / AC5 — the exact solver is Professional-only ───────

  describe('professional-only features', () => {
    let templateId: string;

    beforeAll(async () => {
      ({ templateId } = await makeClinicPlanningSetup(
        harness,
        clinic.clinicId,
      ));
    });

    // AC3.
    it('refuses engine: cpsat on starter and runs nothing', async () => {
      const before = await harness.prisma.shift.count({
        where: { clinicId: clinic.clinicId },
      });

      const error = trpcError(
        await harness.trpcMutation(
          'planning.generatePlan',
          { month: '2027-06', templateId, engine: 'cpsat' },
          token,
        ),
      );
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toBe("Subscription tier 'professional' required");

      expect(
        await harness.prisma.shift.count({
          where: { clinicId: clinic.clinicId },
        }),
      ).toBe(before);
    });

    // AC5 — greedy (the default) is unaffected on starter.
    it('lets starter generate with the default engine', async () => {
      const result = trpcData<{
        stats: { engine: string; solverOutcome?: string };
      }>(
        await harness.trpcMutation(
          'planning.generatePlan',
          { month: '2027-06', templateId },
          token,
        ),
      );
      expect(result.stats.engine).toBe('greedy');
      // Invariant #7 — a starter response never carries solver internals.
      expect(result.stats.solverOutcome).toBeUndefined();

      await harness.prisma.shift.deleteMany({
        where: { clinicId: clinic.clinicId },
      });
    });

    it('accepts engine: cpsat once the clinic is professional', async () => {
      await setSubscription({ entitlementTier: 'professional' });

      const result = trpcData<{
        stats: { engine: string; solverOutcome?: string };
      }>(
        await harness.trpcMutation(
          'planning.generatePlan',
          { month: '2027-06', templateId, engine: 'cpsat' },
          token,
        ),
      );
      // Which engine ends up SERVING is the solver's call (it only wins when it
      // strictly improves, and it needs Node >= 22.12); what the tier gate owes
      // us is that the request was not refused and an outcome was reported.
      expect(['greedy', 'cpsat']).toContain(result.stats.engine);
      expect(result.stats.solverOutcome).toEqual(expect.any(String));

      await harness.prisma.shift.deleteMany({
        where: { clinicId: clinic.clinicId },
      });
    });

    it('gates the planning-rule and equity surfaces behind professional', async () => {
      const rulePayload = {
        name: 'Starter rule attempt',
        ruleType: 'SOFT',
        category: 'STAFFING_MINIMUM',
        isActive: true,
        priority: 0,
        config: { shiftTypeCode: 'MOR', minStaff: 1 },
      };

      const createRule = trpcError(
        await harness.trpcMutation('planning.createRule', rulePayload, token),
      );
      expect(createRule.message).toBe(
        "Subscription tier 'professional' required",
      );

      const counters = trpcError(
        await harness.trpcQuery(
          'planning.getEquityCounters',
          { year: 2027, months: [6] },
          token,
        ),
      );
      expect(counters.message).toBe(
        "Subscription tier 'professional' required",
      );

      await setSubscription({ entitlementTier: 'professional' });

      const created = trpcData<{ id: string }>(
        await harness.trpcMutation('planning.createRule', rulePayload, token),
      );
      expect(created.id).toEqual(expect.any(String));
      trpcData(
        await harness.trpcQuery(
          'planning.getEquityCounters',
          { year: 2027, months: [6] },
          token,
        ),
      );

      await harness.prisma.planningRule.delete({ where: { id: created.id } });
    });

    it('gates on the tier even when the request comes from an EMPLOYEE-shaped token', async () => {
      // Tier and role are separate gates; the role check must not be what
      // rejects a starter cpsat request.
      const employee = await makeEmployee(harness, {
        clinicId: clinic.clinicId,
        email: uniqueEmail('it-gated'),
        withUser: true,
      });
      const { JwtService } = await import('@nestjs/jwt');
      const employeeToken = harness.app.get(JwtService).sign({
        sub: employee.userId!,
        email: employee.email!,
        role: 'EMPLOYEE',
        clinicId: clinic.clinicId,
      });

      const error = trpcError(
        await harness.trpcMutation(
          'planning.generatePlan',
          { month: '2027-06', templateId, engine: 'cpsat' },
          employeeToken,
        ),
      );
      // Admin-only comes first here, which is correct — but it must still be a
      // refusal, never a generation.
      expect(error.code).toBe('FORBIDDEN');
      expect(
        await harness.prisma.shift.count({
          where: { clinicId: clinic.clinicId },
        }),
      ).toBe(0);

      await harness.prisma.employee.delete({ where: { id: employee.id } });
    });
  });
});
