import { SolverEngineService } from './solver-engine.service';
import { buildSolverModel } from './solver-model';
import type { SolverInput } from './solver-model';

// Tiny REAL solves — or-tools-wasm is fast enough for unit scope (<100ms each).
describe('SolverEngineService (KON-129)', () => {
  const service = new SolverEngineService();

  const input: SolverInput = {
    employees: [
      {
        id: 'a',
        jobType: 'VET',
        weeklyCapMinutes: 480,
        monthlyCapMinutes: null,
      },
      {
        id: 'b',
        jobType: 'VET',
        weeklyCapMinutes: 480,
        monthlyCapMinutes: null,
      },
    ],
    slots: [
      {
        id: '2026-08-03|CHIR|09:00',
        date: '2026-08-03',
        shiftTypeCode: 'CHIR',
        startTime: '09:00',
        endTime: '17:00',
        breakMinutes: 0,
        requiredStaff: 1,
      },
      {
        id: '2026-08-05|CHIR|09:00',
        date: '2026-08-05',
        shiftTypeCode: 'CHIR',
        startTime: '09:00',
        endTime: '17:00',
        breakMinutes: 0,
        requiredStaff: 1,
      },
    ],
    unavailable: new Map([['b', new Set(['2026-08-05'])]]),
    fixedWeeklyMinutes: new Map(),
    fixedDailyMinutes: new Map(),
    fixedWorkedDates: new Map(),
    fixedRotationCounts: new Map(),
    rotationRules: [],
    equityWeights: { saturday: 1, weekend: 1, shift: 1 },
  };

  // AC1 (verbatim from story 12-1): "Given engine: 'cpsat' on a month where
  // greedy+repair strands >= 1 hole while a fuller feasible assignment exists,
  // When generation runs, Then the served plan has strictly fewer holes" — the
  // adapter must find the full-fill optimum on the classic bin-packing instance:
  // 'a' fits both days, 'b' only Monday; weekly cap 480 = one 8h shift each.
  it('solves the bin-packing counter-example to full fill (a->Wed, b->Mon)', async () => {
    const model = buildSolverModel(input);
    const result = await service.solve(model, {
      deterministicTimeBudget: 1.0,
    });
    expect(result.status).toBe('OPTIMAL');
    expect([...result.chosenVarNames].sort()).toEqual([
      'a@2026-08-05|CHIR|09:00',
      'b@2026-08-03|CHIR|09:00',
    ]);
  });

  it('honours a solution hint without changing the optimum', async () => {
    const model = buildSolverModel(input);
    const result = await service.solve(model, {
      deterministicTimeBudget: 1.0,
      hint: new Set(['b@2026-08-03|CHIR|09:00']),
    });
    expect(result.status).toBe('OPTIMAL');
    expect(result.chosenVarNames.size).toBe(2);
  });

  // AC4 (verbatim from story 12-1): "Given the same inputs and engine: 'cpsat'
  // twice, Then the two results are deep-equal (workers = 1, fixed seed,
  // deterministic-time budget — invariant #3)."
  it('is deterministic across two identical solves', async () => {
    const model = buildSolverModel(input);
    const r1 = await service.solve(model, { deterministicTimeBudget: 1.0 });
    const r2 = await service.solve(model, { deterministicTimeBudget: 1.0 });
    expect([...r1.chosenVarNames].sort()).toEqual(
      [...r2.chosenVarNames].sort(),
    );
    expect(r1.status).toBe(r2.status);
  });

  it('materializes spread vars — a saturday-imbalanced instance solves OPTIMAL with both spreads', async () => {
    // Two Saturdays + one Sunday + one Monday over two weeks, two employees with
    // room for two shifts each: the spread IR constraints must translate without
    // error and the solve must still fill everything (fill dominates spread).
    const spreadInput: SolverInput = {
      ...input,
      employees: [
        {
          id: 'a',
          jobType: 'VET',
          weeklyCapMinutes: 2100,
          monthlyCapMinutes: null,
        },
        {
          id: 'b',
          jobType: 'VET',
          weeklyCapMinutes: 2100,
          monthlyCapMinutes: null,
        },
      ],
      slots: [
        {
          id: '2026-08-01|CHIR|09:00',
          date: '2026-08-01', // Saturday
          shiftTypeCode: 'CHIR',
          startTime: '09:00',
          endTime: '17:00',
          breakMinutes: 0,
          requiredStaff: 1,
        },
        {
          id: '2026-08-02|CHIR|09:00',
          date: '2026-08-02', // Sunday
          shiftTypeCode: 'CHIR',
          startTime: '09:00',
          endTime: '17:00',
          breakMinutes: 0,
          requiredStaff: 1,
        },
        {
          id: '2026-08-08|CHIR|09:00',
          date: '2026-08-08', // Saturday
          shiftTypeCode: 'CHIR',
          startTime: '09:00',
          endTime: '17:00',
          breakMinutes: 0,
          requiredStaff: 1,
        },
        {
          id: '2026-08-10|CHIR|09:00',
          date: '2026-08-10', // Monday
          shiftTypeCode: 'CHIR',
          startTime: '09:00',
          endTime: '17:00',
          breakMinutes: 0,
          requiredStaff: 1,
        },
      ],
      unavailable: new Map(),
    };
    const model = buildSolverModel(spreadInput);
    expect(model.constraints.some((c) => c.kind === 'spread')).toBe(true);
    const result = await service.solve(model, {
      deterministicTimeBudget: 1.0,
    });
    expect(result.status).toBe('OPTIMAL');
    expect(result.chosenVarNames.size).toBe(4); // everything filled
    // With equal weights the optimum splits the two Saturdays 1/1.
    const saturdays = [...result.chosenVarNames].filter(
      (n) => n.includes('2026-08-01') || n.includes('2026-08-08'),
    );
    const byEmployee = new Set(saturdays.map((n) => n.split('@')[0]));
    expect(byEmployee.size).toBe(2);
  });

  it('reports a terminal status instead of throwing on an exhausted deterministic budget', async () => {
    const model = buildSolverModel(input);
    const result = await service.solve(model, {
      deterministicTimeBudget: 1e-9,
    });
    expect(['OPTIMAL', 'FEASIBLE', 'UNKNOWN']).toContain(result.status);
  });
});
