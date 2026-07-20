// Story 13-8 (KON-138) — AC-2: the ONE end-to-end path that closes the router/service
// mock split. Real router (createCallerFactory) + real PlanningGenerationService +
// real SolverEngineService; only Prisma/peripheral services are mocked.
jest.mock('@/trigger/client', () => ({
  batchEmailPublishTask: {
    trigger: jest.fn().mockResolvedValue({ id: 'mock' }),
  },
  batchPushPublishTask: {
    trigger: jest.fn().mockResolvedValue({ id: 'mock' }),
  },
  sendEmailTask: { trigger: jest.fn().mockResolvedValue({ id: 'mock' }) },
}));
// The real tRPC layer pulls in ESM-only superjson, which ts-jest won't transpile
// under node_modules — stub it, mirroring planning.router.spec.ts.
jest.mock('superjson', () => ({
  __esModule: true,
  default: {
    serialize: (v: unknown) => ({ json: v, meta: undefined }),
    deserialize: (v: { json: unknown }) => v.json ?? v,
  },
}));

import { createCallerFactory } from '@/trpc/trpc';
import { planningRouter } from '@/trpc/routers/planning.router';
import { solverOutcomeSchema } from '@pawly/validators';
import {
  createGenerationHarness,
  configureFixture,
  buildServedCpsatFixture,
  HARNESS_CLINIC_ID,
  type GenerationHarness,
} from './planning-harness.testutil';

describe('generatePlan integration — real router→service→solver (Story 13-8, KON-138)', () => {
  let harness: GenerationHarness;
  beforeAll(async () => {
    harness = await createGenerationHarness();
  });

  // AC-2 (verbatim from story 13-8-invariant-test-harness:33):
  //   ... one end-to-end integration test that drives the real generation request
  //   path ... asserts the solver was actually invoked, the write transaction
  //   executed, the served schedule is statutory-clean, and a valid solver outcome
  //   is reported — closing the gap where endpoint tests mock the service and
  //   service tests never exercise the endpoint.
  it('drives cpsat generation through the tRPC caller into the transaction path', async () => {
    const fixture = buildServedCpsatFixture();
    configureFixture(harness, fixture);

    const solveSpy = jest.spyOn(harness.solverEngine, 'solve');
    const createCaller = createCallerFactory(planningRouter);
    const caller = createCaller({
      user: {
        sub: 'user-1',
        email: 'admin@clinic.fr',
        role: 'ADMIN',
        clinicId: HARNESS_CLINIC_ID,
      },
      prisma: {
        subscription: {
          findUnique: jest.fn().mockResolvedValue({
            status: 'active',
            entitlementTier: 'professional',
            currentPeriodEnd: new Date('2026-12-31'),
            cancelAtPeriodEnd: false,
          }),
        },
      },
      redis: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
        del: jest.fn(),
        invalidatePattern: jest.fn(),
        incr: jest.fn().mockResolvedValue(1),
        isAvailable: false,
      },
      planningGenerationService: harness.service,
    } as any);

    const result = await caller.generatePlan({
      month: fixture.month,
      templateId: fixture.templateId,
      engine: 'cpsat',
    });

    // Real solver was invoked (cpsat path), transaction ran, served plan is clean,
    // and a valid solver outcome is reported (cpsat request → outcome present).
    expect(solveSpy).toHaveBeenCalled();
    expect(harness.prisma.$transaction).toHaveBeenCalled();
    expect(result.violations.hard).toEqual([]);
    expect(
      result.stats.engine === 'greedy' || result.stats.engine === 'cpsat',
    ).toBe(true);
    expect(
      solverOutcomeSchema.safeParse(result.stats.solverOutcome).success,
    ).toBe(true);
  }, 60000);
});
