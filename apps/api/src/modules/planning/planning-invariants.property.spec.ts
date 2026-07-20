// Story 13-8 (KON-138) — property-based invariants over randomized planning inputs.
jest.mock('@/trigger/client', () => ({
  batchEmailPublishTask: {
    trigger: jest.fn().mockResolvedValue({ id: 'mock' }),
  },
  batchPushPublishTask: {
    trigger: jest.fn().mockResolvedValue({ id: 'mock' }),
  },
  sendEmailTask: { trigger: jest.fn().mockResolvedValue({ id: 'mock' }) },
}));

import fc from 'fast-check';
import {
  findStatutoryViolations,
  type StatutoryShift,
} from './french-labor-law';
import {
  createGenerationHarness,
  configureFixture,
  planningFixtureArb,
  HARNESS_CLINIC_ID,
  type GenerationHarness,
} from './planning-harness.testutil';

// CI-aware run ladder (NFR2 budget pattern — bounded shrinking/runs).
const NUM_RUNS_DET = process.env.CI ? 15 : 40;

describe('Planning engine invariants (Story 13-8, KON-138)', () => {
  let harness: GenerationHarness;
  beforeAll(async () => {
    harness = await createGenerationHarness();
  });

  // AC-1 P3 (verbatim from story 13-8-invariant-test-harness:32):
  //   P3 (determinism) — generating the same input twice with the same engine
  //   yields identical output.
  it('P3 — same input twice yields deep-equal output (greedy & cpsat)', async () => {
    await fc.assert(
      fc.asyncProperty(planningFixtureArb, async (f) => {
        for (const engine of ['greedy', 'cpsat'] as const) {
          configureFixture(harness, f);
          const run1 = await harness.service.generateMonthlyPlan(
            HARNESS_CLINIC_ID,
            f.month,
            f.templateId,
            { engine },
          );
          configureFixture(harness, f);
          const run2 = await harness.service.generateMonthlyPlan(
            HARNESS_CLINIC_ID,
            f.month,
            f.templateId,
            { engine },
          );
          expect(run2).toEqual(run1);
        }
      }),
      { numRuns: NUM_RUNS_DET, endOnFailure: true },
    );
  }, 180000);
});
