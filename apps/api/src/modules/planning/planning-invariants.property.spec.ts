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

  const NUM_RUNS_SAFETY = process.env.CI ? 25 : 100;

  // AC-1 P1 (verbatim from story 13-8-invariant-test-harness:30-31):
  //   P1 (safety) — no served schedule introduces a statutory violation, verified
  //   by an independent re-evaluation of the served shifts rather than the engine's
  //   self-reported violations.
  it('P1 — no served plan introduces a statutory violation (greedy & cpsat)', async () => {
    const isoDate = (d: unknown): string =>
      d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);

    await fc.assert(
      fc.asyncProperty(planningFixtureArb, async (f) => {
        for (const engine of ['greedy', 'cpsat'] as const) {
          configureFixture(harness, f);
          const result = await harness.service.generateMonthlyPlan(
            HARNESS_CLINIC_ID,
            f.month,
            f.templateId,
            { engine },
          );

          // Independent re-evaluation of the SERVED plan (generated + legal survivors),
          // per employee — never trusts result.violations.hard (mocked on cpsat).
          const byEmployee = new Map<string, StatutoryShift[]>();
          const add = (empId: string, s: StatutoryShift) => {
            const list = byEmployee.get(empId) ?? [];
            list.push(s);
            byEmployee.set(empId, list);
          };
          for (const a of result.assignments) {
            add(a.employeeId, {
              date: isoDate(a.date),
              startTime: a.startTime,
              endTime: a.endTime,
              breakMinutes: 0,
            });
          }
          for (const s of f.survivors) {
            add(s.employeeId, {
              date: isoDate(s.date),
              startTime: s.startTime,
              endTime: s.endTime,
              breakMinutes: s.breakMinutes,
            });
          }
          for (const [, shifts] of byEmployee) {
            expect(findStatutoryViolations(shifts)).toEqual([]);
          }

          // Belt-and-suspenders: greedy's own accumulated hard array is the real
          // evaluation (not mocked) and must be clean.
          if (engine === 'greedy') {
            expect(result.violations.hard).toEqual([]);
          }
        }
      }),
      { numRuns: NUM_RUNS_SAFETY, endOnFailure: true },
    );
  }, 180000);
});
