import {
  equityObjective,
  computeLoads,
  findEjectionChain,
  selectImprovingSwap,
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
  const isMoverEligibleForHole = (mover: string, hole: RepairSlot): boolean =>
    hole.id === 's2' && mover === 'a';

  it('finds the depth-2 chain that a single greedy pass cannot', () => {
    const chain = findEjectionChain(
      s2,
      assignments,
      slotById,
      employees,
      isEligibleAddition,
      isMoverEligibleForHole,
    );
    expect(chain).toEqual({
      holeSlotId: 's2',
      ejectFromSlotId: 's1',
      moverEmployeeId: 'a',
      backfillEmployeeId: 'b',
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
        isMoverEligibleForHole,
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
      isMoverEligibleForHole,
    );
    const second = findEjectionChain(
      s2,
      assignments,
      slotById,
      employees,
      isEligibleAddition,
      isMoverEligibleForHole,
    );
    expect(first).toEqual(second);
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
});
