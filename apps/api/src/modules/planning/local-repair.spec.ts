import {
  equityObjective,
  computeLoads,
  mergeEquityLoads,
  deriveEquityWeights,
  findEjectionChain,
  selectImprovingSwap,
  DEFAULT_EQUITY_WEIGHTS,
  type EmployeeLoad,
  type RepairSlot,
  type RepairAssignment,
} from './local-repair';

const slot = (
  id: string,
  date: string,
  shiftTypeCode: string,
  startTime = '09:00',
  endTime = '17:00',
  breakMinutes = 0,
  requiredJobTypes?: string[],
): RepairSlot => ({
  id,
  date,
  shiftTypeCode,
  startTime,
  endTime,
  breakMinutes,
  requiredJobTypes,
});

const assign = (slotId: string, employeeId: string): RepairAssignment => ({
  slotId,
  employeeId,
});

describe('equityObjective + computeLoads', () => {
  it('computeLoads counts saturday, weekend and shift totals per employee', () => {
    const slotById = new Map<string, RepairSlot>([
      ['s-sat', slot('s-sat', '2026-08-01', 'CHIR')], // 2026-08-01 is a Saturday
      ['s-sun', slot('s-sun', '2026-08-02', 'CHIR')], // Sunday
      ['s-mon', slot('s-mon', '2026-08-03', 'CHIR')], // Monday
    ]);
    const loads = computeLoads(
      [assign('s-sat', 'e1'), assign('s-sun', 'e1'), assign('s-mon', 'e2')],
      slotById,
    );
    expect(loads.get('e1')).toEqual({
      saturdayCount: 1,
      weekendCount: 2,
      shiftCount: 2,
    });
    expect(loads.get('e2')).toEqual({
      saturdayCount: 0,
      weekendCount: 0,
      shiftCount: 1,
    });
  });

  it('objective is 0 for a perfectly balanced load and positive otherwise', () => {
    const balanced = new Map([
      ['e1', { saturdayCount: 1, weekendCount: 1, shiftCount: 2 }],
      ['e2', { saturdayCount: 1, weekendCount: 1, shiftCount: 2 }],
    ]);
    expect(equityObjective(balanced)).toBe(0);
    const skewed = new Map([
      ['e1', { saturdayCount: 2, weekendCount: 2, shiftCount: 2 }],
      ['e2', { saturdayCount: 0, weekendCount: 0, shiftCount: 2 }],
    ]);
    expect(equityObjective(skewed)).toBeGreaterThan(0);
  });

  // AC5 — scale normalization. A ±1 deviation on a rare metric (saturdays, mean 1) must count
  // for MORE than a ±1 deviation on an abundant one (shifts, mean 21). The unnormalized
  // objective scored both identically (2.0 each).
  it('normalizes each term by its workforce mean so rare metrics are not drowned', () => {
    const saturdaySkew = new Map([
      ['e1', { saturdayCount: 2, weekendCount: 2, shiftCount: 21 }],
      ['e2', { saturdayCount: 0, weekendCount: 2, shiftCount: 21 }],
    ]);
    const shiftSkew = new Map([
      ['e1', { saturdayCount: 1, weekendCount: 2, shiftCount: 22 }],
      ['e2', { saturdayCount: 1, weekendCount: 2, shiftCount: 20 }],
    ]);
    expect(equityObjective(saturdaySkew)).toBeGreaterThan(
      equityObjective(shiftSkew),
    );
  });

  it('guards a zero mean — no NaN when a metric is absent from the workforce', () => {
    const noSaturdays = new Map([
      ['e1', { saturdayCount: 0, weekendCount: 0, shiftCount: 3 }],
      ['e2', { saturdayCount: 0, weekendCount: 0, shiftCount: 1 }],
    ]);
    const obj = equityObjective(noSaturdays);
    expect(Number.isFinite(obj)).toBe(true);
    expect(obj).toBeGreaterThan(0); // the shift skew still registers
  });

  // AC6 — explicit weights scale their term linearly.
  it('scales a term by its weight', () => {
    const saturdayOnlySkew = new Map([
      ['e1', { saturdayCount: 2, weekendCount: 2, shiftCount: 21 }],
      ['e2', { saturdayCount: 0, weekendCount: 2, shiftCount: 21 }],
    ]);
    const base = equityObjective(saturdayOnlySkew, DEFAULT_EQUITY_WEIGHTS);
    const doubled = equityObjective(saturdayOnlySkew, {
      saturday: 2,
      weekend: 1,
      shift: 1,
    });
    expect(doubled).toBeCloseTo(2 * base, 10);
  });
});

describe('deriveEquityWeights — ROTATION_EQUITY priority wiring (AC6)', () => {
  const rule = (
    category: string,
    targetDay: string | undefined,
    priority: number,
  ) => ({
    category,
    config: targetDay ? { targetDay } : {},
    priority,
  });

  it('defaults to {1,1,1} when no rotation rule exists', () => {
    expect(deriveEquityWeights([])).toEqual({
      saturday: 1,
      weekend: 1,
      shift: 1,
    });
  });

  it('a saturday rule boosts the saturday term via 1 + priority/10', () => {
    expect(
      deriveEquityWeights([rule('ROTATION_EQUITY', 'saturday', 5)]),
    ).toEqual({ saturday: 1.5, weekend: 1, shift: 1 });
  });

  it('a sunday rule boosts the weekend term', () => {
    expect(
      deriveEquityWeights([rule('ROTATION_EQUITY', 'sunday', 10)]),
    ).toEqual({ saturday: 1, weekend: 2, shift: 1 });
  });

  it('takes the max priority per metric across rules', () => {
    expect(
      deriveEquityWeights([
        rule('ROTATION_EQUITY', 'saturday', 3),
        rule('ROTATION_EQUITY', 'saturday', 7),
      ]),
    ).toEqual({ saturday: 1.7, weekend: 1, shift: 1 });
  });

  it('ignores non-rotation categories and non-weekend target days', () => {
    expect(
      deriveEquityWeights([
        rule('STAFFING_MINIMUM', 'saturday', 9),
        rule('ROTATION_EQUITY', 'monday', 9),
        rule('ROTATION_EQUITY', undefined, 9),
      ]),
    ).toEqual({ saturday: 1, weekend: 1, shift: 1 });
  });
});

describe('findEjectionChain — bin-packing counter-example (AC1)', () => {
  // Two VET-only slots on different days, both at a 1-shift-per-employee cap. Greedy placed VET
  // "a" on s1 (which "b" could also cover) and then cannot fill s2: "a" is now at its cap and "b"
  // is unavailable on s2's day → hole on s2. No one is eligible for s2 as a plain ADDITION — that
  // is exactly why greedy stranded it. "a" becomes eligible for s2 only AFTER it leaves s1
  // (post-removal), which is the move a single greedy pass cannot make. Depth-2 fix: move "a"
  // from s1 → s2, backfill s1 with the idle "b".
  const s1 = slot('s1', '2026-08-03', 'CHIR', '09:00', '17:00', 0, ['VET']); // Monday
  const s2 = slot('s2', '2026-08-05', 'CHIR', '09:00', '17:00', 0, ['VET']); // Wednesday (the hole)
  const slotById = new Map<string, RepairSlot>([
    ['s1', s1],
    ['s2', s2],
  ]);
  const assignments = [assign('s1', 'a')];
  const employees = ['a', 'b'];

  // Additions (backfill): "b" can take s1 (idle VET, available Monday); nobody can be added to the
  // hole s2 without a removal first (a is at cap, b unavailable Wednesday).
  const isEligibleAddition = (emp: string, s: RepairSlot): boolean =>
    s.id === 's1' ? emp === 'a' || emp === 'b' : false;
  // The mover, evaluated on post-removal state: "a" fits s2 once it has left s1.
  const isMoverEligible = (
    mover: string,
    target: RepairSlot,
    _vacated: RepairSlot,
  ): boolean => target.id === 's2' && mover === 'a';

  it('finds the single-move chain that a single greedy pass cannot', () => {
    const chain = findEjectionChain(
      s2,
      assignments,
      slotById,
      employees,
      isEligibleAddition,
      isMoverEligible,
    );
    expect(chain).toEqual({
      holeSlotId: 's2',
      moves: [{ employeeId: 'a', fromSlotId: 's1', toSlotId: 's2' }],
      backfillEmployeeId: 'b',
      backfillSlotId: 's1',
    });
  });

  it('returns null when no backfill exists for the vacated slot', () => {
    // Only "a" fits s1 — and "a" is the mover, so there is no one to backfill the vacated slot.
    const onlyAFitsS1 = (emp: string, s: RepairSlot): boolean =>
      s.id === 's1' && emp === 'a';
    expect(
      findEjectionChain(
        s2,
        assignments,
        slotById,
        employees,
        onlyAFitsS1,
        isMoverEligible,
      ),
    ).toBeNull();
  });

  it('is deterministic — same inputs, same chain, no RNG', () => {
    const first = findEjectionChain(
      s2,
      assignments,
      slotById,
      employees,
      isEligibleAddition,
      isMoverEligible,
    );
    const second = findEjectionChain(
      s2,
      assignments,
      slotById,
      employees,
      isEligibleAddition,
      isMoverEligible,
    );
    expect(first).toEqual(second);
  });
});

describe('findEjectionChain — depth-3 fallback (KON-128 AC1)', () => {
  // Three slots, three employees. Hole = s3. Greedy left a@s1, b@s2.
  //   - Nobody fits s3 as a plain addition (that is why it is a hole).
  //   - Depth-2 fails: the only mover for s3 is "a" (post-removal of s1), but then NOBODY can
  //     backfill s1 as an addition — "b" only fits s1 after leaving s2 (a second relocation).
  //   - Depth-3 succeeds: a: s1→s3, b: s2→s1, idle "c" backfills s2.
  const s1 = slot('s1', '2026-08-03', 'CHIR'); // Monday
  const s2 = slot('s2', '2026-08-05', 'CHIR'); // Wednesday
  const s3 = slot('s3', '2026-08-07', 'CHIR'); // Friday (the hole)
  const slotById = new Map<string, RepairSlot>([
    ['s1', s1],
    ['s2', s2],
    ['s3', s3],
  ]);
  const assignments = [assign('s1', 'a'), assign('s2', 'b')];
  const employees = ['a', 'b', 'c'];

  const isEligibleAddition = (emp: string, s: RepairSlot): boolean =>
    emp === 'c' && s.id === 's2';
  const isMoverEligible = (
    mover: string,
    target: RepairSlot,
    vacated: RepairSlot,
  ): boolean =>
    (mover === 'a' && target.id === 's3' && vacated.id === 's1') ||
    (mover === 'b' && target.id === 's1' && vacated.id === 's2');

  it('repairs a hole no depth-2 chain can reach', () => {
    const chain = findEjectionChain(
      s3,
      assignments,
      slotById,
      employees,
      isEligibleAddition,
      isMoverEligible,
    );
    expect(chain).toEqual({
      holeSlotId: 's3',
      moves: [
        { employeeId: 'a', fromSlotId: 's1', toSlotId: 's3' },
        { employeeId: 'b', fromSlotId: 's2', toSlotId: 's1' },
      ],
      backfillEmployeeId: 'c',
      backfillSlotId: 's2',
    });
  });

  it('prefers the depth-2 chain when one exists (AC1 — no behavior change)', () => {
    // Open a direct backfill for s1: now the depth-2 chain (a: s1→s3, backfill c@s1) exists and
    // must win even though the depth-3 chain above is also valid.
    const withDirectBackfill = (emp: string, s: RepairSlot): boolean =>
      (emp === 'c' && s.id === 's2') || (emp === 'c' && s.id === 's1');
    const chain = findEjectionChain(
      s3,
      assignments,
      slotById,
      employees,
      withDirectBackfill,
      isMoverEligible,
    );
    expect(chain).toEqual({
      holeSlotId: 's3',
      moves: [{ employeeId: 'a', fromSlotId: 's1', toSlotId: 's3' }],
      backfillEmployeeId: 'c',
      backfillSlotId: 's1',
    });
  });

  it('respects the evaluation budget — a zero budget disables the depth-3 phase (AC4)', () => {
    expect(
      findEjectionChain(
        s3,
        assignments,
        slotById,
        employees,
        isEligibleAddition,
        isMoverEligible,
        { depth3Budget: { remaining: 0 } },
      ),
    ).toBeNull();
  });

  it('stops probing once the budget is exhausted (AC4)', () => {
    let calls = 0;
    const countedMover = (
      mover: string,
      target: RepairSlot,
      vacated: RepairSlot,
    ): boolean => {
      calls++;
      return isMoverEligible(mover, target, vacated);
    };
    const countedAddition = (emp: string, s: RepairSlot): boolean => {
      calls++;
      return isEligibleAddition(emp, s);
    };
    const chain = findEjectionChain(
      s3,
      assignments,
      slotById,
      employees,
      countedAddition,
      countedMover,
      { depth3Budget: { remaining: 1 } },
    );
    expect(chain).toBeNull(); // 1 evaluation is not enough to complete any 2-move chain
    // depth-2 phase: 2 mover probes + 2 backfill probes on the "a" branch. depth-3 adds at most 1.
    expect(calls).toBeLessThanOrEqual(6);
  });

  it('shares one mutable budget across calls — a whole pass stays bounded (AC4)', () => {
    const shared = { remaining: 200 };
    const first = findEjectionChain(
      s3,
      assignments,
      slotById,
      employees,
      isEligibleAddition,
      isMoverEligible,
      { depth3Budget: shared },
    );
    expect(first).not.toBeNull();
    const afterFirst = shared.remaining;
    expect(afterFirst).toBeLessThan(200); // the successful search consumed from the shared pool
    // Drain the pool: the same search now aborts instead of drawing a fresh budget.
    shared.remaining = 0;
    expect(
      findEjectionChain(
        s3,
        assignments,
        slotById,
        employees,
        isEligibleAddition,
        isMoverEligible,
        { depth3Budget: shared },
      ),
    ).toBeNull();
  });

  it('is deterministic at depth 3 — same inputs, same chain', () => {
    const run = () =>
      findEjectionChain(
        s3,
        assignments,
        slotById,
        employees,
        isEligibleAddition,
        isMoverEligible,
      );
    expect(run()).toEqual(run());
  });
});

describe('selectImprovingSwap — equity hill-climb (AC2)', () => {
  // e1 works both weekend days, e2 works both weekdays. Swapping one weekend
  // day between them strictly lowers the weekend/Saturday variance.
  const slotById = new Map<string, RepairSlot>([
    ['s-sat', slot('s-sat', '2026-08-01', 'CHIR')], // Saturday, e1
    ['s-sun', slot('s-sun', '2026-08-02', 'CHIR')], // Sunday, e1
    ['s-mon', slot('s-mon', '2026-08-03', 'CHIR')], // Monday, e2
    ['s-tue', slot('s-tue', '2026-08-04', 'CHIR')], // Tuesday, e2
  ]);
  const assignments = [
    assign('s-sat', 'e1'),
    assign('s-sun', 'e1'),
    assign('s-mon', 'e2'),
    assign('s-tue', 'e2'),
  ];

  it('proposes a swap that strictly decreases the objective', () => {
    const isEligible = () => true; // everyone fits everywhere
    const swap = selectImprovingSwap(assignments, slotById, isEligible);
    expect(swap).not.toBeNull();
    // Applying the proposed swap must lower the objective vs the current one.
    const before = equityObjective(computeLoads(assignments, slotById));
    const swapped = assignments.map((a) => {
      if (a.slotId === swap!.slotIdA) return assign(a.slotId, swap!.employeeB);
      if (a.slotId === swap!.slotIdB) return assign(a.slotId, swap!.employeeA);
      return a;
    });
    const after = equityObjective(computeLoads(swapped, slotById));
    expect(after).toBeLessThan(before);
  });

  it('returns null when no eligible swap improves the objective', () => {
    const isEligible = () => true;
    const balanced = [
      assign('s-sat', 'e1'),
      assign('s-sun', 'e2'),
      assign('s-mon', 'e1'),
      assign('s-tue', 'e2'),
    ];
    expect(selectImprovingSwap(balanced, slotById, isEligible)).toBeNull();
  });

  it('never proposes a swap that fails the eligibility predicate', () => {
    // e1 carries both weekend days; every objective-improving swap must hand one of
    // them (Saturday OR Sunday) to e2. Block e2 from both weekend days and the guard
    // has to reject all of them — the only improving swaps left are ineligible.
    const isEligible = (emp: string, s: RepairSlot) =>
      !(emp === 'e2' && (s.id === 's-sat' || s.id === 's-sun'));
    const swap = selectImprovingSwap(assignments, slotById, isEligible);
    expect(swap).toBeNull();
  });

  // KON-128 AC6 — the weights flow through pair selection: the same instance picks a different
  // best swap when the saturday term is discounted.
  describe('weighted selection', () => {
    // e1: two Saturdays. e3: three Sundays. e2/e4: weekdays. The saturday-fixing swap
    // (sat1 ↔ mon1) wins by default (it improves BOTH normalized terms); discounting the
    // saturday weight flips the pick to the weekend-only swap (sun1 ↔ mon1).
    const wSlotById = new Map<string, RepairSlot>([
      ['sat1', slot('sat1', '2026-08-01', 'CHIR')], // Saturday
      ['sun1', slot('sun1', '2026-08-02', 'CHIR')], // Sunday
      ['mon1', slot('mon1', '2026-08-03', 'CHIR')], // Monday
      ['tue1', slot('tue1', '2026-08-04', 'CHIR')], // Tuesday
      ['sat2', slot('sat2', '2026-08-08', 'CHIR')], // Saturday
      ['sun2', slot('sun2', '2026-08-09', 'CHIR')], // Sunday
      ['sun3', slot('sun3', '2026-08-16', 'CHIR')], // Sunday
    ]);
    const wAssignments = [
      assign('sat1', 'e1'),
      assign('sat2', 'e1'),
      assign('mon1', 'e2'),
      assign('sun1', 'e3'),
      assign('sun2', 'e3'),
      assign('sun3', 'e3'),
      assign('tue1', 'e4'),
    ];
    const isEligible = () => true;

    it('picks the saturday-fixing swap under default weights', () => {
      const swap = selectImprovingSwap(wAssignments, wSlotById, isEligible);
      expect(swap).toEqual({
        slotIdA: 'sat1',
        slotIdB: 'mon1',
        employeeA: 'e1',
        employeeB: 'e2',
      });
    });

    it('picks the weekend-only swap when the saturday term is discounted', () => {
      const swap = selectImprovingSwap(wAssignments, wSlotById, isEligible, {
        saturday: 0.01,
        weekend: 1,
        shift: 1,
      });
      expect(swap).toEqual({
        slotIdA: 'sun1',
        slotIdB: 'mon1',
        employeeA: 'e3',
        employeeB: 'e2',
      });
    });
  });
});

describe('mergeEquityLoads — survivor-aware acceptance gate (Story 13-5, T7/AC-2)', () => {
  const load = (
    shiftCount: number,
    saturdayCount = 0,
    weekendCount = 0,
  ): EmployeeLoad => ({
    saturdayCount,
    weekendCount,
    shiftCount,
  });

  it('an empty baseline is the identity — the gate reduces to survivor-blind', () => {
    const generated = new Map<string, EmployeeLoad>([
      ['a', load(3, 1, 2)],
      ['b', load(1)],
    ]);
    const merged = mergeEquityLoads(new Map(), generated);
    expect(merged).toEqual(generated);
    // A fresh map with fresh entries — never the same references (no aliasing).
    expect(merged).not.toBe(generated);
    expect(merged.get('a')).not.toBe(generated.get('a'));
  });

  it('deep-copies baseline entries and mutates neither input', () => {
    const baseline = new Map<string, EmployeeLoad>([['a', load(1, 1, 1)]]);
    const generated = new Map<string, EmployeeLoad>([['a', load(5, 5, 5)]]);
    const merged = mergeEquityLoads(baseline, generated);
    expect(merged.get('a')).toEqual(load(6, 6, 6));
    // Inputs are untouched — the helper is pure.
    expect(baseline.get('a')).toEqual(load(1, 1, 1));
    expect(generated.get('a')).toEqual(load(5, 5, 5));
  });

  it('sums survivor + generated per employee, seeding absent employees from zero', () => {
    const baseline = new Map<string, EmployeeLoad>([['a', load(2, 1, 1)]]);
    const generated = new Map<string, EmployeeLoad>([
      ['a', load(1)],
      ['b', load(3, 0, 1)], // 'b' has no survivor baseline
    ]);
    const merged = mergeEquityLoads(baseline, generated);
    expect(merged.get('a')).toEqual(load(3, 1, 1));
    expect(merged.get('b')).toEqual(load(3, 0, 1));
  });

  it('is LOAD-BEARING: a skewed survivor baseline flips which equal-fill plan the gate judges fairer (AC-2)', () => {
    const weights = { saturday: 1, weekend: 1, shift: 1 };
    // Two generated plans, SAME fill (2 shifts each) — so the gate decides on equity
    // alone (candidate.length === greedyFilled). Distribution differs only.
    const planA = new Map<string, EmployeeLoad>([
      ['a', load(2)],
      ['b', load(0)],
    ]);
    const planB = new Map<string, EmployeeLoad>([
      ['a', load(1)],
      ['b', load(1)],
    ]);

    // Survivor-blind (empty baseline): B is perfectly balanced, strictly fairer than A.
    expect(equityObjective(planB, weights)).toBeLessThan(
      equityObjective(planA, weights),
    );

    // But 'b' already carries 3 immovable survivor shifts. TOTAL load then makes A the
    // fairer generated plan — A totals (a:2, b:3) vs B's (a:1, b:4). If the gate merged
    // survivors wrongly (or not at all), it would still prefer B and REGRESS real
    // fairness. The survivor-aware merge must reverse the verdict.
    const survivors = new Map<string, EmployeeLoad>([['b', load(3)]]);
    const totalA = equityObjective(mergeEquityLoads(survivors, planA), weights);
    const totalB = equityObjective(mergeEquityLoads(survivors, planB), weights);
    expect(totalA).toBeLessThan(totalB); // decision flipped: A now wins

    // Determinism: same inputs → identical scalar, twice.
    expect(equityObjective(mergeEquityLoads(survivors, planA), weights)).toBe(
      totalA,
    );
  });
});
