// AC3 (verbatim from story 11-8-unified-rule-engine:19):
//   Given the extracted pure module `rule-engine.ts` (no NestJS, no Prisma, no I/O —
//   mirroring `french-labor-law.ts`), When its unit tests run, Then each primitive is
//   covered by a passing, breaching, and boundary case: `netMinutes` break-deduction,
//   weekly + monthly contract with `ruleType`/floor/overtime-tolerance, rotation with
//   `ruleType`/`applicableJobTypes`, and the incremental HARD primitives.
import {
  netMinutes,
  isoWeekStart,
  isoWeekday,
  evaluateContractCompliance,
  evaluateRotationEquity,
  violatesHardContractIncremental,
  violatesHardRotation,
  type EvaluatorRule,
  type EvalShift,
} from './rule-engine';

const rule = (
  ruleType: 'HARD' | 'SOFT',
  category: string,
  config: Record<string, unknown>,
): EvaluatorRule => ({
  id: 'r1',
  name: 'Test rule',
  ruleType,
  category,
  config,
});

const shift = (
  employeeId: string,
  date: string,
  startTime: string,
  endTime: string,
  breakMinutes = 0,
  contractHours = 35,
  jobType?: string,
): EvalShift => ({
  employeeId,
  contractHours,
  date,
  startTime,
  endTime,
  breakMinutes,
  jobType,
});

describe('primitives', () => {
  it('netMinutes deducts break and wraps overnight', () => {
    expect(netMinutes('08:00', '18:00', 60)).toBe(540); // 10h - 1h
    expect(netMinutes('22:00', '06:00', 0)).toBe(480); // 8h overnight
  });
  it('isoWeekStart returns the Monday of the ISO week (UTC)', () => {
    expect(isoWeekStart('2026-08-05')).toBe('2026-08-03'); // Wed -> Mon
    expect(isoWeekStart('2026-08-09')).toBe('2026-08-03'); // Sun -> Mon
  });
  it('isoWeekday maps Sunday to 7', () => {
    expect(isoWeekday('2026-08-03')).toBe(1); // Monday
    expect(isoWeekday('2026-08-08')).toBe(6); // Saturday
    expect(isoWeekday('2026-08-09')).toBe(7); // Sunday
  });
});

describe('evaluateContractCompliance — weekly (maxWeeklyHours)', () => {
  it('HARD weekly overage -> blocking, deducting breakMinutes', () => {
    // Mon-Sat 09:00-18:00 with 0 break = 9h/day x 6 = 54h > 35h
    const shifts = ['03', '04', '05', '06', '07', '08'].map((d) =>
      shift('e1', `2026-08-${d}`, '09:00', '18:00', 0),
    );
    const v = evaluateContractCompliance(
      rule('HARD', 'CONTRACT_COMPLIANCE', { maxWeeklyHours: 35 }),
      shifts,
    );
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      severity: 'blocking',
      affectedDate: '2026-08-03', // ISO — keys the grid-cell conflict lookup
    });
    // Human-facing date is French-formatted, like the statutory messages (aped-review m2).
    expect(v[0].messageParams?.date).toBe('03/08/2026');
    expect(v[0].messageKey).toBe(
      'violations.contractCompliance.weeklyOvertime',
    );
  });
  it('SOFT weekly overage -> warning', () => {
    const shifts = ['03', '04', '05', '06', '07', '08'].map((d) =>
      shift('e1', `2026-08-${d}`, '09:00', '18:00', 0),
    );
    const v = evaluateContractCompliance(
      rule('SOFT', 'CONTRACT_COMPLIANCE', { maxWeeklyHours: 35 }),
      shifts,
    );
    expect(v[0].severity).toBe('warning');
  });
  it('effective limit floors to min(contractHours, maxWeeklyHours)', () => {
    // 25h contract, rule 35h -> effective 25h. 3 x 9h = 27h > 25h.
    const shifts = ['03', '04', '05'].map((d) =>
      shift('e1', `2026-08-${d}`, '09:00', '18:00', 0, 25),
    );
    const v = evaluateContractCompliance(
      rule('HARD', 'CONTRACT_COMPLIANCE', { maxWeeklyHours: 35 }),
      shifts,
    );
    expect(v).toHaveLength(1);
  });
  it('HARD overtimeThresholdPercent widens the limit', () => {
    // 35h x 1.10 = 38.5h. 4 x 9h = 36h -> under tolerance, no violation.
    const shifts = ['03', '04', '05', '06'].map((d) =>
      shift('e1', `2026-08-${d}`, '09:00', '18:00', 0, 40),
    );
    const v = evaluateContractCompliance(
      rule('HARD', 'CONTRACT_COMPLIANCE', {
        maxWeeklyHours: 35,
        overtimeThresholdPercent: 10,
      }),
      shifts,
    );
    expect(v).toHaveLength(0);
  });
});

describe('evaluateContractCompliance — monthly (maxMonthlyHours)', () => {
  it('HARD monthly overage -> blocking', () => {
    const shifts = Array.from({ length: 20 }, (_, i) =>
      shift(
        'e1',
        `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
        '08:00',
        '18:00',
        0,
      ),
    ); // 20 x 10h = 200h > 150h
    const v = evaluateContractCompliance(
      rule('HARD', 'CONTRACT_COMPLIANCE', { maxMonthlyHours: 150 }),
      shifts,
    );
    expect(
      v.some(
        (x) =>
          x.severity === 'blocking' &&
          x.messageKey === 'violations.contractCompliance.overtime',
      ),
    ).toBe(true);
  });
  it('monthly threshold is minute-precise, not rounded to hours (aped-review m6)', () => {
    // 15 x 10h Mon-Fri over 3 weeks = 9000 min; contractHours 60 keeps the weekly floor quiet.
    const base = [
      '03',
      '04',
      '05',
      '06',
      '07',
      '10',
      '11',
      '12',
      '13',
      '14',
      '17',
      '18',
      '19',
      '20',
      '21',
    ].map((d) => shift('e1', `2026-08-${d}`, '08:00', '18:00', 0, 60));
    const cap = rule('HARD', 'CONTRACT_COMPLIANCE', { maxMonthlyHours: 150 });
    // Exactly 150h00 -> at the limit, no violation.
    expect(evaluateContractCompliance(cap, base)).toHaveLength(0);
    // 150h29 -> violation; the legacy Math.round-then-compare would have let it pass.
    const overBy29min = [
      ...base,
      shift('e1', '2026-08-24', '09:00', '09:29', 0, 60),
    ];
    const v = evaluateContractCompliance(cap, overBy29min);
    expect(v).toHaveLength(1);
    expect(v[0].messageKey).toBe('violations.contractCompliance.overtime');
  });
  it('capless rule (statutory / rest-only config) emits nothing, even over contractHours', () => {
    // The seeded 11-3 statutory rule is CONTRACT_COMPLIANCE with no maxWeeklyHours /
    // maxMonthlyHours — visibility-only ("Enforcement NEVER depends on this row").
    // 5 x 9h = 45h > 35h contract must NOT block publication under that rule; legal
    // overtime is not a statutory breach (aped-review m3, attempt 2).
    const shifts = ['03', '04', '05', '06', '07'].map((d) =>
      shift('e1', `2026-08-${d}`, '09:00', '18:00', 0, 35),
    );
    expect(
      evaluateContractCompliance(
        rule('HARD', 'CONTRACT_COMPLIANCE', {
          maxDailyHours: 10,
          minWeeklyRestHours: 35,
        }),
        shifts,
      ),
    ).toHaveLength(0);
  });
  it('no maxWeeklyHours: weekly floor is contractHours (aped-review m3)', () => {
    // 5 x 9h = 45h > 35h contract, rule carries only maxMonthlyHours (not breached).
    // Generation and preValidateMove already refuse this week; post-hoc must agree.
    const shifts = ['03', '04', '05', '06', '07'].map((d) =>
      shift('e1', `2026-08-${d}`, '09:00', '18:00', 0, 35),
    );
    const v = evaluateContractCompliance(
      rule('HARD', 'CONTRACT_COMPLIANCE', { maxMonthlyHours: 200 }),
      shifts,
    );
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      severity: 'blocking',
      messageKey: 'violations.contractCompliance.weeklyOvertime',
    });
    expect(v[0].messageParams?.maxWeeklyHours).toBe(35);
  });
});

describe('evaluateRotationEquity', () => {
  it('HARD rotation overage -> blocking, spread across dates', () => {
    // 3 Saturdays, max 2
    const shifts = ['01', '08', '15'].map((d) =>
      shift('e1', `2026-08-${d}`, '09:00', '15:00'),
    );
    const v = evaluateRotationEquity(
      rule('HARD', 'ROTATION_EQUITY', {
        targetDay: 'saturday',
        maxPerPeriod: 2,
        trackingPeriod: 'monthly',
      }),
      shifts,
    );
    expect(v).toHaveLength(3);
    expect(v.every((x) => x.severity === 'blocking')).toBe(true);
  });
  it('SOFT rotation overage -> warning', () => {
    const shifts = ['01', '08', '15'].map((d) =>
      shift('e1', `2026-08-${d}`, '09:00', '15:00'),
    );
    const v = evaluateRotationEquity(
      rule('SOFT', 'ROTATION_EQUITY', {
        targetDay: 'saturday',
        maxPerPeriod: 2,
        trackingPeriod: 'monthly',
      }),
      shifts,
    );
    expect(v[0].severity).toBe('warning');
  });
  it('respects applicableJobTypes', () => {
    const shifts = ['01', '08', '15'].map((d) =>
      shift('e1', `2026-08-${d}`, '09:00', '15:00', 0, 35, 'VET'),
    );
    const v = evaluateRotationEquity(
      rule('HARD', 'ROTATION_EQUITY', {
        targetDay: 'saturday',
        maxPerPeriod: 2,
        applicableJobTypes: ['ASV'],
      }),
      shifts,
    );
    expect(v).toHaveLength(0); // VET not in [ASV]
  });
  it('does not flag exactly maxPerPeriod', () => {
    const shifts = ['01', '08'].map((d) =>
      shift('e1', `2026-08-${d}`, '09:00', '15:00'),
    );
    const v = evaluateRotationEquity(
      rule('HARD', 'ROTATION_EQUITY', {
        targetDay: 'saturday',
        maxPerPeriod: 2,
      }),
      shifts,
    );
    expect(v).toHaveLength(0);
  });
});

describe('incremental HARD primitives', () => {
  it('violatesHardContractIncremental blocks when candidate tips over the weekly cap', () => {
    const r = rule('HARD', 'CONTRACT_COMPLIANCE', { maxWeeklyHours: 35 });
    expect(
      violatesHardContractIncremental(r, {
        weekMinutes: 30 * 60,
        monthMinutes: 0,
        candidateMinutes: 6 * 60,
        contractHours: 35,
      }),
    ).toBe(true); // 36h > 35h
    expect(
      violatesHardContractIncremental(r, {
        weekMinutes: 20 * 60,
        monthMinutes: 0,
        candidateMinutes: 6 * 60,
        contractHours: 35,
      }),
    ).toBe(false); // 26h
  });
  it('violatesHardRotation blocks at the cap and honours applicableJobTypes', () => {
    const r = rule('HARD', 'ROTATION_EQUITY', {
      targetDay: 'saturday',
      maxPerPeriod: 2,
      applicableJobTypes: ['ASV'],
    });
    expect(violatesHardRotation(r, { currentCount: 2, jobType: 'ASV' })).toBe(
      true,
    );
    expect(violatesHardRotation(r, { currentCount: 1, jobType: 'ASV' })).toBe(
      false,
    );
    expect(violatesHardRotation(r, { currentCount: 5, jobType: 'VET' })).toBe(
      false,
    ); // not applicable
  });
});

describe('KON-140 (V7) — configured maxDailyHours as a tightening', () => {
  const dailyRule = (
    maxDailyHours: number,
    ruleType: 'HARD' | 'SOFT' = 'HARD',
  ) => ({
    id: 'r-daily',
    name: 'Daily cap',
    ruleType,
    category: 'CONTRACT_COMPLIANCE',
    config: { maxDailyHours },
  });

  it('evaluateContractCompliance emits dailyOvertime for a day over a <12h configured cap', () => {
    const v = evaluateContractCompliance(dailyRule(10), [
      {
        employeeId: 'e1',
        date: '2026-08-03',
        startTime: '08:00',
        endTime: '19:30',
        breakMinutes: 30,
        contractHours: 35,
      }, // 11h net > 10h configured
    ]);
    expect(v).toContainEqual(
      expect.objectContaining({
        messageKey: 'violations.contractCompliance.dailyOvertime',
        affectedDate: '2026-08-03',
      }),
    );
  });

  it('a >=12h configured cap is inert (redundant with the statutory 12h)', () => {
    const v = evaluateContractCompliance(dailyRule(12), [
      {
        employeeId: 'e1',
        date: '2026-08-03',
        startTime: '07:00',
        endTime: '21:00',
        breakMinutes: 0,
        contractHours: 35,
      }, // 14h net — statutory territory, not this rule's
    ]);
    expect(v).toHaveLength(0);
  });

  it('a daily-only rule does NOT trigger the weekly fallback evaluation (R-guard)', () => {
    const v = evaluateContractCompliance(dailyRule(10), [
      {
        employeeId: 'e1',
        date: '2026-08-03',
        startTime: '08:00',
        endTime: '17:00',
        breakMinutes: 0,
        contractHours: 5,
      }, // 9h day under 10h cap; way over contractHours — must NOT emit weekly
    ]);
    expect(v).toHaveLength(0);
  });

  it('violatesHardContractIncremental trips on the configured daily cap', () => {
    expect(
      violatesHardContractIncremental(dailyRule(10), {
        weekMinutes: 0,
        monthMinutes: 0,
        candidateMinutes: 5 * 60,
        contractHours: 35,
        dayMinutes: 6 * 60, // 6h + 5h = 11h > 10h configured
      }),
    ).toBe(true);
    expect(
      violatesHardContractIncremental(dailyRule(12), {
        weekMinutes: 0,
        monthMinutes: 0,
        candidateMinutes: 5 * 60,
        contractHours: 35,
        dayMinutes: 6 * 60, // >=12h configured: inert
      }),
    ).toBe(false);
  });
});
