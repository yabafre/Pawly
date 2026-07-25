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

import fc, { sample as fcSample } from 'fast-check';
import {
  findStatutoryViolations,
  regimeForJobType,
  STATUTORY_WINDOW_DAYS,
  type StatutoryShift,
} from './french-labor-law';
import {
  createGenerationHarness,
  configureFixture,
  planningFixtureArb,
  buildImprovableCpsatFixture,
  SHIFT_TYPE_MENU,
  HARNESS_CLINIC_ID,
  type GenerationHarness,
} from './planning-harness.testutil';

// CI-aware run ladder (NFR2 budget pattern — bounded shrinking/runs).
const NUM_RUNS_DET = process.env.CI ? 15 : process.env.TURBO_HASH ? 25 : 40;

/** The data window the engine had for `YYYY-MM`: the month +/- its statutory radius. */
const monthDataWindow = (month: string): { start: string; end: string } => {
  const [y, m] = month.split('-').map(Number);
  const shift = (d: Date, days: number): string => {
    const c = new Date(d);
    c.setUTCDate(c.getUTCDate() + days);
    return c.toISOString().slice(0, 10);
  };
  return {
    start: shift(new Date(Date.UTC(y, m - 1, 1)), -STATUTORY_WINDOW_DAYS),
    end: shift(new Date(Date.UTC(y, m, 0)), STATUTORY_WINDOW_DAYS),
  };
};

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
              // KON-140 (V6) — was hardcoded 0: harmless while the menu had no breaks,
              // but a served GUARD (40-min break) must not read as a break-less 12h day.
              breakMinutes: a.breakMinutes ?? 0,
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
          const jobTypeOf = new Map(f.employees.map((e) => [e.id, e.jobType]));
          // KON-141 — re-evaluate over the SAME data window the engine reasoned on: the union
          // of its per-candidate +/-STATUTORY_WINDOW_DAYS windows across the month. Omitting it
          // clips open-ended rest gaps to the ISO-week edge, which manufactures a weekly-rest
          // "deficit" at the month frontier out of hours nobody ever loaded — the engine cannot
          // be held to a rest period that depends on data outside its window. Interior weeks,
          // where every gap is bounded by real shifts, are unaffected: this was verified by
          // re-running the recorded counterexamples against the pre-fix engine, which stays RED.
          const window = monthDataWindow(f.month);
          for (const [empId, shifts] of byEmployee) {
            expect(
              findStatutoryViolations(shifts, {
                regime: regimeForJobType(jobTypeOf.get(empId)),
                window,
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
        breakMinutes: a.breakMinutes ?? 0, // KON-140 (V6) — same oracle fix as P1
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

  // KON-140 (V6) — the safety property is only as strong as what the generators can
  // produce. This pins the menu's ability to pressure the KON-139 rule set: at least one
  // continuous >=10h-net type (REST_DAYS trigger / 12h-cap territory) and one overnight
  // type (cross-midnight paths). If a refactor waters the menu down, this fails before
  // the property silently turns vacuous again (verification-audit V6).
  it('generator menu can pressure the CCN rules (>=10h continuous + overnight types)', () => {
    const net = (t: { startTime: string; endTime: string }) => {
      const [sh, sm] = t.startTime.split(':').map(Number);
      const [eh, em] = t.endTime.split(':').map(Number);
      const raw = eh * 60 + em - (sh * 60 + sm);
      const span = raw < 0 ? raw + 1440 : raw;
      const brk = (t as { breakMinutes?: number }).breakMinutes ?? 0;
      return span - brk;
    };
    expect(SHIFT_TYPE_MENU.some((t) => net(t) >= 600)).toBe(true);
    expect(
      SHIFT_TYPE_MENU.some((t) => t.endTime < t.startTime), // overnight wrap
    ).toBe(true);
  });

  // KON-144 follow-up — the same "is the generator actually reaching it?" pin, one level
  // up. 13-8 shipped `rules: []`, so the rule engine's CONFIGURABLE caps never ran under
  // randomized input and KON-140's maxDailyHours path was unreachable by any property.
  // A rule the engine ignores would be coverage theatre, so this pins two things: the
  // fixtures really carry contract rules, and the caps they carry really BITE — i.e. they
  // are tighter than what the shift-type menu produces in a day, so the engine has to act.
  it('generators reach the configurable contract caps, and the caps can bite', () => {
    const fixtures = fcSample(planningFixtureArb, 200);
    const withRule = fixtures.filter((f) => f.rules.length > 0);
    expect(withRule.length).toBeGreaterThan(0);

    const configs = withRule.map(
      (f) =>
        (f.rules[0] as { config: Record<string, number | undefined> }).config,
    );
    // A daily cap only tightens below the statutory 12h; above it the engine drops it.
    const dailyCaps = configs
      .map((c) => c.maxDailyHours)
      .filter((h): h is number => h !== undefined);
    expect(dailyCaps.length).toBeGreaterThan(0);
    expect(dailyCaps.every((h) => h < 12)).toBe(true);

    // ...and at least one sampled cap is below a full GUARD day (11h20 net), so a fixture
    // pairing that cap with that shift type genuinely forces the engine to refuse.
    expect(Math.min(...dailyCaps) * 60).toBeLessThan(680);
  });
});
