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

    // Real solver was invoked AND actually ran — the cpsat request drove the whole
    // router→service→solver→replay→transaction path, and a valid solver outcome is reported.
    expect(solveSpy).toHaveBeenCalled();
    expect(harness.prisma.$transaction).toHaveBeenCalled();
    expect(result.violations.hard).toEqual([]);
    expect(
      solverOutcomeSchema.safeParse(result.stats.solverOutcome).success,
    ).toBe(true);
    // F1/F3 — the old `engine === 'greedy' || 'cpsat'` check was a tautology (2-value enum,
    // always true). Assert instead that the solver genuinely ran and did NOT silently degrade
    // to ENGINE_UNAVAILABLE (what happens if or-tools can't load, e.g. Node < 22.12), which
    // would make `solveSpy.toHaveBeenCalled()` pass while the solver never actually solved.
    // On buildServedCpsatFixture greedy is already optimal, so the served engine is greedy
    // with outcome 'no-improvement'; AC-2's job is the end-to-end wiring, while the positive
    // served-cpsat path is proven in planning-invariants.property.spec.ts.
    expect(result.stats.solverOutcome).not.toBe('engine-unavailable');
  }, 60000);
});
