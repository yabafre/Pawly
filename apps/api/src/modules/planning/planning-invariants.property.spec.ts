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
  regimeForJobType,
  type StatutoryShift,
} from './french-labor-law';
import {
  createGenerationHarness,
  configureFixture,
  planningFixtureArb,
  buildImprovableCpsatFixture,
  HARNESS_CLINIC_ID,
  type GenerationHarness,
} from './planning-harness.testutil';

// CI-aware run ladder (NFR2 budget pattern — bounded shrinking/runs).
const NUM_RUNS_DET = process.env.CI ? 15 : process.env.TURBO_HASH ? 25 : 40;

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

  const NUM_RUNS_SAFETY = process.env.CI
    ? 25
    : process.env.TURBO_HASH
      ? 50
      : 100;

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
          const jobTypeOf = new Map(
            f.employees.map((e) => [e.id, e.jobType]),
          );
          for (const [empId, shifts] of byEmployee) {
            expect(
              findStatutoryViolations(shifts, {
                regime: regimeForJobType(jobTypeOf.get(empId)),
              }).filter((v) => !v.soft),
            ).toEqual([]);
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

  const NUM_RUNS_CPSAT = process.env.CI ? 8 : process.env.TURBO_HASH ? 12 : 20;

  // AC-1 P2 (verbatim from story 13-8-invariant-test-harness:31):
  //   P2 (improve-never-degrade) — the exact engine never fills fewer slots, nor
  //   leaves more holes, than greedy for the same input.
  it('P2 — cpsat never degrades greedy (fill dominates, holes non-increasing)', async () => {
    await fc.assert(
      fc.asyncProperty(planningFixtureArb, async (f) => {
        configureFixture(harness, f);
        const greedy = await harness.service.generateMonthlyPlan(
          HARNESS_CLINIC_ID,
          f.month,
          f.templateId,
          { engine: 'greedy' },
        );
        configureFixture(harness, f);
        const cpsat = await harness.service.generateMonthlyPlan(
          HARNESS_CLINIC_ID,
          f.month,
          f.templateId,
          { engine: 'cpsat' },
        );

        expect(cpsat.stats.filledSlots).toBeGreaterThanOrEqual(
          greedy.stats.filledSlots,
        );
        expect(cpsat.stats.holeCount).toBeLessThanOrEqual(
          greedy.stats.holeCount,
        );
      }),
      { numRuns: NUM_RUNS_CPSAT, endOnFailure: true },
    );
  }, 180000);

  // AC-1 P2 — POSITIVE arm + solver canary (review F1).
  //
  // The bounded `planningFixtureArb` never forces cpsat to be served: greedy(+repair)
  // already fills every slot, so P2/P3 above only ever exercise the trivial never-degrade
  // side (cpsat silently falls back to greedy → the assertions become greedy-vs-greedy).
  // This deterministic fixture is the ONE place the harness proves the exact engine
  // genuinely SOLVES, strictly WINS, survives replay-revalidation, and is SERVED. Run with
  // `enableRepair: false` so the solver's baseline is the raw (hole-bearing) greedy plan.
  //
  // It also acts as the SOLVER CANARY: if or-tools is unavailable (e.g. Node < 22.12) the
  // served engine stays greedy and this fails LOUDLY, instead of the cpsat coverage above
  // going silently vacuous with a green suite.
  it('cpsat is genuinely served and strictly improves a greedy-suboptimal fixture', async () => {
    const f = buildImprovableCpsatFixture();

    configureFixture(harness, f);
    const greedy = await harness.service.generateMonthlyPlan(
      HARNESS_CLINIC_ID,
      f.month,
      f.templateId,
      { engine: 'greedy', enableRepair: false },
    );
    configureFixture(harness, f);
    const cpsat = await harness.service.generateMonthlyPlan(
      HARNESS_CLINIC_ID,
      f.month,
      f.templateId,
      { engine: 'cpsat', enableRepair: false },
    );

    // Greedy-only is genuinely suboptimal (strands ≥1 hole)…
    expect(greedy.stats.holeCount).toBeGreaterThan(0);
    // …the exact engine's plan was actually SERVED (not a silent greedy fallback)…
    expect(cpsat.stats.engine).toBe('cpsat');
    expect(cpsat.stats.solverOutcome).toBe('served');
    // …strictly improving fill and holes…
    expect(cpsat.stats.filledSlots).toBeGreaterThan(greedy.stats.filledSlots);
    expect(cpsat.stats.holeCount).toBeLessThan(greedy.stats.holeCount);

    // …and the served cpsat plan is statutory-clean by INDEPENDENT re-evaluation (P1
    // method). This is the only place P1's re-eval runs over a plan the exact engine
    // actually served — never trusting result.violations.hard (mocked on the cpsat path).
    const isoDate = (d: unknown): string =>
      d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
    const byEmployee = new Map<string, StatutoryShift[]>();
    for (const a of cpsat.assignments) {
      const list = byEmployee.get(a.employeeId) ?? [];
      list.push({
        date: isoDate(a.date),
        startTime: a.startTime,
        endTime: a.endTime,
        breakMinutes: 0,
      });
      byEmployee.set(a.employeeId, list);
    }
    for (const [, shifts] of byEmployee) {
      expect(
        findStatutoryViolations(shifts, { regime: 'SUPPORT_STAFF' }).filter(
          (v) => !v.soft,
        ),
      ).toEqual([]);
    }
  }, 60000);
});
