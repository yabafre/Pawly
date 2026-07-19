import {
  buildSolverModel,
  decodeSolution,
  type SolverInput,
  type SolverEmployee,
  type SolverSlot,
} from './solver-model';

const emp = (id: string, weeklyCapMinutes = 2100): SolverEmployee => ({
  id,
  jobType: 'VET',
  weeklyCapMinutes,
  monthlyCapMinutes: null,
});

const slot = (
  id: string,
  date: string,
  startTime = '09:00',
  endTime = '17:00',
  breakMinutes = 0,
  requiredStaff = 1,
  requiredJobTypes?: string[],
): SolverSlot => ({
  id,
  date,
  shiftTypeCode: 'CHIR',
  startTime,
  endTime,
  breakMinutes,
  requiredStaff,
  requiredJobTypes,
});

const baseInput = (over: Partial<SolverInput> = {}): SolverInput => ({
  employees: [emp('a'), emp('b')],
  slots: [slot('s1', '2026-08-03')],
  unavailable: new Map(),
  fixedWeeklyMinutes: new Map(),
  fixedMonthlyMinutes: new Map(),
  fixedDailyMinutes: new Map(),
  fixedWorkedDates: new Map(),
  fixedRotationCounts: new Map(),
  rotationRules: [],
  equityWeights: { saturday: 1, weekend: 1, shift: 1 },
  ...over,
});

describe('buildSolverModel — variables', () => {
  // AC6 (verbatim from story 12-1): "Given any solver solution, Then it never violates:
  // unavailability, per-employee overlap, requiredJobTypes, HARD rotation, HARD
  // weekly/monthly contract caps, statutory daily 10h, 13h amplitude, <= 6 consecutive
  // days (all modeled)" — unavailability and jobType are enforced by VAR OMISSION.
  it('creates one bool var per eligible (employee, slot) pair and none for ineligible', () => {
    const input = baseInput({
      employees: [emp('a'), { ...emp('b'), jobType: 'ASV' }],
      slots: [slot('s1', '2026-08-03', '09:00', '17:00', 0, 1, ['VET'])],
      unavailable: new Map([['a', new Set(['2026-08-03'])]]),
    });
    const model = buildSolverModel(input);
    // 'a' unavailable, 'b' wrong jobType -> zero variables, slot unfillable.
    expect(model.vars).toHaveLength(0);
  });

  it('emits a per-slot fill cap of requiredStaff', () => {
    const input = baseInput({
      employees: [emp('a'), emp('b'), emp('c')],
      slots: [slot('s1', '2026-08-03', '09:00', '17:00', 0, 2)],
    });
    const model = buildSolverModel(input);
    const cap = model.constraints.find(
      (c) => c.kind === 'linearLe' && c.tag === 'fill:s1',
    );
    expect(cap).toBeDefined();
    expect(cap!.kind === 'linearLe' && cap!.bound).toBe(2);
  });
});

describe('buildSolverModel — hard constraint parity (AC6)', () => {
  it('mutexes overlapping same-day slots per employee', () => {
    const input = baseInput({
      slots: [
        slot('s1', '2026-08-03', '09:00', '13:00'),
        slot('s2', '2026-08-03', '12:00', '17:00'),
      ],
    });
    const model = buildSolverModel(input);
    const mutex = model.constraints.filter(
      (c) => c.kind === 'linearLe' && c.tag.startsWith('overlap:'),
    );
    // one mutex per employee for the overlapping pair
    expect(mutex).toHaveLength(2);
    expect(mutex[0].kind === 'linearLe' && mutex[0].bound).toBe(1);
  });

  // Story 13-3 (KON-132) — AC2: a pair the greedy engine would refuse must be
  // forbidden in the model too, or the solver can propose it and the plan is SERVED.
  it('mutexes a cross-midnight pair on adjacent dates', () => {
    const input = baseInput({
      employees: [emp('a')],
      slots: [
        slot('s1', '2026-08-03', '22:00', '06:00'),
        slot('s2', '2026-08-04', '05:00', '09:00'),
      ],
    });
    const model = buildSolverModel(input);
    const mutex = model.constraints.filter(
      (c) => c.kind === 'linearLe' && c.tag.startsWith('overlap:'),
    );
    expect(mutex).toHaveLength(1);
    expect(mutex[0].kind === 'linearLe' && mutex[0].bound).toBe(1);
  });

  it('does not mutex a cross-midnight pair that only touches at the junction', () => {
    const input = baseInput({
      employees: [emp('a')],
      slots: [
        slot('s1', '2026-08-03', '22:00', '06:00'),
        slot('s2', '2026-08-04', '06:00', '12:00'),
      ],
    });
    const model = buildSolverModel(input);
    expect(
      model.constraints.filter(
        (c) => c.kind === 'linearLe' && c.tag.startsWith('overlap:'),
      ),
    ).toHaveLength(0);
  });

  // AC6: 06:00->14:00 plus 22:00->06:00 on ONE date spans 06:00 to 06:00 next day
  // = 24h amplitude, far past the statutory 13h. The raw HH:MM span scored it 8h.
  it('emits the statutory amplitude mutex when a same-date pair spans midnight', () => {
    const input = baseInput({
      employees: [emp('a')],
      slots: [
        slot('s1', '2026-08-03', '06:00', '14:00'),
        slot('s2', '2026-08-03', '22:00', '06:00'),
      ],
    });
    const model = buildSolverModel(input);
    expect(
      model.constraints.filter(
        (c) =>
          c.kind === 'linearLe' && c.tag.startsWith('statutory-amplitude:'),
      ),
    ).toHaveLength(1);
  });

  it('caps weekly net minutes including the fixed baseline', () => {
    const input = baseInput({
      employees: [emp('a', 480)], // 8h/week cap
      slots: [
        slot('s1', '2026-08-03', '09:00', '17:00'), // 480 net, ISO week of Mon 08-03
        slot('s2', '2026-08-05', '09:00', '17:00'), // same ISO week
      ],
      fixedWeeklyMinutes: new Map([['a|2026-08-03', 60]]), // 1h already fixed
    });
    const model = buildSolverModel(input);
    const weekly = model.constraints.find(
      (c) => c.kind === 'linearLe' && c.tag.startsWith('weekly:a'),
    );
    expect(weekly).toBeDefined();
    expect(weekly!.kind === 'linearLe' && weekly!.bound).toBe(480 - 60);
  });

  it('deducts the fixed monthly baseline from the monthly cap (T5, mirror of weekly)', () => {
    const input = baseInput({
      employees: [{ ...emp('a'), monthlyCapMinutes: 480 }], // 8h/month cap
      slots: [
        slot('s1', '2026-08-03', '09:00', '17:00'), // 480 net
        slot('s2', '2026-08-10', '09:00', '17:00'),
      ],
      fixedMonthlyMinutes: new Map([['a', 240]]), // 4h of survivors already worked this month
    });
    const model = buildSolverModel(input);
    const monthly = model.constraints.find(
      (c) => c.kind === 'linearLe' && c.tag === 'monthly:a',
    );
    expect(monthly).toBeDefined();
    expect(monthly!.kind === 'linearLe' && monthly!.bound).toBe(480 - 240);
  });

  it('enforces statutory daily 10h as a per-date cap', () => {
    const input = baseInput({
      slots: [
        slot('s1', '2026-08-03', '06:00', '12:00'), // 360 net
        slot('s2', '2026-08-03', '14:00', '20:00'), // 360 net -> 720 > 600 daily
      ],
    });
    const model = buildSolverModel(input);
    const daily = model.constraints.filter((c) =>
      c.tag.startsWith('statutory-daily:'),
    );
    expect(daily.length).toBeGreaterThan(0);
  });

  it('mutexes same-day slot pairs whose combined amplitude exceeds 13h', () => {
    const input = baseInput({
      slots: [
        slot('s1', '2026-08-03', '06:00', '10:00'), // 240 net
        slot('s2', '2026-08-03', '16:00', '20:00'), // 240 net, amplitude 06->20 = 840 > 780
      ],
    });
    const model = buildSolverModel(input);
    const amplitude = model.constraints.filter(
      (c) => c.kind === 'linearLe' && c.tag.startsWith('statutory-amplitude:'),
    );
    expect(amplitude).toHaveLength(2); // one per employee
  });

  it('enforces <= 6 consecutive worked days over a 7-day window', () => {
    const days = ['03', '04', '05', '06', '07', '08', '09'];
    const input = baseInput({
      slots: days.map((d) => slot(`s${d}`, `2026-08-${d}`)),
    });
    const model = buildSolverModel(input);
    const window = model.constraints.find(
      (c) => c.kind === 'linearLe' && c.tag.startsWith('consecutive:a'),
    );
    expect(window).toBeDefined();
    expect(window!.kind === 'linearLe' && window!.bound).toBe(6);
  });

  it('caps HARD rotation counting fixed history', () => {
    const input = baseInput({
      slots: [
        slot('sat1', '2026-08-01'), // Saturdays
        slot('sat2', '2026-08-08'),
        slot('sat3', '2026-08-15'),
      ],
      rotationRules: [{ targetIsoDay: 6, maxPerPeriod: 2 }],
      fixedRotationCounts: new Map([['a|6', 1]]),
    });
    const model = buildSolverModel(input);
    const rot = model.constraints.find(
      (c) => c.kind === 'linearLe' && c.tag === 'rotation:a:6',
    );
    expect(rot).toBeDefined();
    expect(rot!.kind === 'linearLe' && rot!.bound).toBe(1); // 2 max - 1 already in history
  });
});

describe('objective + decode', () => {
  // AC1 (verbatim from story 12-1): "Then the served plan has strictly fewer holes" —
  // fill must dominate every equity term lexicographically or the solver could trade
  // a filled slot for a fairer spread.
  it('weights fill lexicographically above the equity spread terms', () => {
    const input = baseInput({
      employees: [emp('a'), emp('b')],
      slots: [
        slot('sat1', '2026-08-01'),
        slot('sun1', '2026-08-02'),
        slot('mon1', '2026-08-03'),
      ],
    });
    const model = buildSolverModel(input);
    const fillTerms = model.objective.filter((t) => t.tag === 'fill');
    const spreadTerms = model.objective.filter((t) => t.tag !== 'fill');
    expect(fillTerms.length).toBeGreaterThan(0);
    expect(spreadTerms.length).toBeGreaterThan(0);
    const minFill = Math.min(...fillTerms.map((t) => Math.abs(t.weight)));
    const sumSpread = spreadTerms.reduce((s, t) => s + Math.abs(t.weight), 0);
    expect(minFill).toBeGreaterThan(sumSpread);
  });

  it('decodeSolution maps chosen vars back to assignments', () => {
    const input = baseInput();
    const model = buildSolverModel(input);
    const chosen = new Set(model.vars.map((v) => v.name));
    const assignments = decodeSolution(model, chosen, input);
    expect(assignments).toEqual([
      {
        employeeId: 'a',
        date: '2026-08-03',
        startTime: '09:00',
        endTime: '17:00',
        shiftTypeCode: 'CHIR',
        breakMinutes: 0,
      },
      {
        employeeId: 'b',
        date: '2026-08-03',
        startTime: '09:00',
        endTime: '17:00',
        shiftTypeCode: 'CHIR',
        breakMinutes: 0,
      },
    ]);
  });

  // AC4 (verbatim from story 12-1): "Given the same inputs and engine: 'cpsat' twice,
  // Then the two results are deep-equal" — starts with a deterministic IR build.
  it('is deterministic — two builds produce identical IR', () => {
    const input = baseInput({
      employees: [emp('b'), emp('a')], // deliberately unsorted input
      slots: [slot('s2', '2026-08-05'), slot('s1', '2026-08-03')],
    });
    expect(buildSolverModel(input)).toEqual(buildSolverModel(input));
  });
});
