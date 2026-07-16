import {
  evaluateMoveViolations,
  timesOverlap,
  type MoveEvalContext,
  type MoveEvalShift,
} from './move-validation';

const shiftAt = (
  date: string,
  startTime: string,
  endTime: string,
  overrides: Partial<MoveEvalShift> = {},
): MoveEvalShift => ({
  id: `s-${date}-${startTime}`,
  employeeId: 'emp-2',
  date,
  startTime,
  endTime,
  breakMinutes: 0,
  shiftTypeCode: 'SURGERY',
  ...overrides,
});

// 2026-03-02 is a Monday, 2026-03-07 a Saturday.
const baseCtx = (
  overrides: Partial<MoveEvalContext> = {},
): MoveEvalContext => ({
  shift: shiftAt('2026-03-02', '08:00', '12:00', {
    id: 'shift-1',
    employeeId: 'emp-1',
  }),
  target: { employeeId: 'emp-2', date: '2026-03-02' },
  employee: {
    id: 'emp-2',
    firstName: 'Bob',
    lastName: 'Dupont',
    jobType: 'ASV',
    contractHours: 35,
  },
  operationalConfig: {
    workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    closedDays: [],
  },
  unavailabilities: [],
  sameDayShifts: [],
  weekShifts: [],
  monthShifts: [],
  quarterExtraShifts: [],
  statutoryWindowShifts: [],
  rules: [],
  ...overrides,
});

describe('timesOverlap', () => {
  it('detects an overlap on the same day', () => {
    expect(timesOverlap('08:00', '12:00', '10:00', '14:00')).toBe(true);
  });

  it('treats back-to-back shifts as non-overlapping', () => {
    expect(timesOverlap('08:00', '12:00', '12:00', '18:00')).toBe(false);
  });
});

describe('evaluateMoveViolations', () => {
  it('returns no violations for a clean move', () => {
    const result = evaluateMoveViolations(baseCtx());
    expect(result.hard).toHaveLength(0);
    expect(result.soft).toHaveLength(0);
  });

  it('short-circuits with HARD EMPLOYEE when the target employee is missing', () => {
    const result = evaluateMoveViolations(baseCtx({ employee: null }));
    expect(result.hard).toEqual([
      { rule: 'EMPLOYEE', message: 'Target employee not found or inactive' },
    ]);
  });

  it('flags HARD NON_WORK_DAY when the target day is outside workDays', () => {
    const result = evaluateMoveViolations(
      baseCtx({ target: { employeeId: 'emp-2', date: '2026-03-07' } }),
    );
    expect(result.hard).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'NON_WORK_DAY' }),
      ]),
    );
  });

  it('flags HARD CLOSED_DAY when the target date is closed', () => {
    const result = evaluateMoveViolations(
      baseCtx({
        operationalConfig: {
          workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
          closedDays: [{ date: '2026-03-02' }],
        },
      }),
    );
    expect(result.hard).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'CLOSED_DAY' })]),
    );
  });

  it('flags HARD UNAVAILABILITY for a full-period unavailability', () => {
    const result = evaluateMoveViolations(
      baseCtx({
        unavailabilities: [{ type: 'VACATION', reason: null, daysOfWeek: [] }],
      }),
    );
    expect(result.hard).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'UNAVAILABILITY' }),
      ]),
    );
  });

  it('flags HARD OVERLAP against an existing shift on the target date', () => {
    const result = evaluateMoveViolations(
      baseCtx({ sameDayShifts: [shiftAt('2026-03-02', '10:00', '14:00')] }),
    );
    expect(result.hard).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'OVERLAP',
          message: 'Shift overlaps with existing shift (10:00-14:00)',
        }),
      ]),
    );
  });

  it('flags HARD DAILY_WORK when the move pushes the day past the 10h statutory limit', () => {
    // 13:00-20:00 (7h) already held + the moved 08:00-12:00 (4h) = 11h > 10h.
    // Amplitude 08:00->20:00 = 12h stays under the 13h limit, so DAILY_WORK fires alone.
    const result = evaluateMoveViolations(
      baseCtx({
        statutoryWindowShifts: [shiftAt('2026-03-02', '13:00', '20:00')],
      }),
    );
    expect(result.hard).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'CONTRACT_COMPLIANCE',
          message: 'Statutory limit exceeded: DAILY_WORK',
        }),
      ]),
    );
  });

  it('sees a statutory breach that straddles the month frontier (the +/-8 day window)', () => {
    // Move onto Mon 2026-03-02, with Feb 24..Mar 01 already worked => a 7th consecutive day.
    const worked = [
      '2026-02-24',
      '2026-02-25',
      '2026-02-26',
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
    ].map((d) => shiftAt(d, '08:00', '12:00'));
    const result = evaluateMoveViolations(
      baseCtx({ statutoryWindowShifts: worked }),
    );
    expect(result.hard).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Statutory limit exceeded: CONSECUTIVE_DAYS',
        }),
      ]),
    );
  });

  it('routes a SOFT contract rule to soft and a HARD one to hard', () => {
    const week = [
      shiftAt('2026-03-03', '08:00', '18:00'),
      shiftAt('2026-03-04', '08:00', '18:00'),
      shiftAt('2026-03-05', '08:00', '18:00'),
      shiftAt('2026-03-06', '08:00', '18:00'),
    ];
    const rule = {
      id: 'r-1',
      name: 'Weekly cap',
      category: 'CONTRACT_COMPLIANCE',
      config: { maxWeeklyHours: 35 },
    };
    const soft = evaluateMoveViolations(
      baseCtx({
        weekShifts: week,
        rules: [{ ...rule, ruleType: 'SOFT' as const }],
      }),
    );
    expect(soft.soft).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'CONTRACT_COMPLIANCE' }),
      ]),
    );
    expect(soft.hard).toHaveLength(0);

    const hard = evaluateMoveViolations(
      baseCtx({
        weekShifts: week,
        rules: [{ ...rule, ruleType: 'HARD' as const }],
      }),
    );
    expect(hard.hard).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'CONTRACT_COMPLIANCE' }),
      ]),
    );
  });

  it('counts quarterly rotation across the quarter pool, monthly across the month only', () => {
    const rule = {
      id: 'r-2',
      name: 'Saturday rotation',
      ruleType: 'HARD' as const,
      category: 'ROTATION_EQUITY',
      config: {
        targetDay: 'saturday',
        maxPerPeriod: 2,
        trackingPeriod: 'quarterly',
      },
    };
    // Target Saturday 2026-03-07; 1 Saturday this month + 1 earlier in the quarter = 2 => cap reached.
    const result = evaluateMoveViolations(
      baseCtx({
        target: { employeeId: 'emp-2', date: '2026-03-07' },
        operationalConfig: {
          workDays: [
            'MONDAY',
            'TUESDAY',
            'WEDNESDAY',
            'THURSDAY',
            'FRIDAY',
            'SATURDAY',
          ],
          closedDays: [],
        },
        monthShifts: [shiftAt('2026-03-14', '08:00', '12:00')],
        quarterExtraShifts: [shiftAt('2026-01-10', '08:00', '12:00')],
        rules: [rule],
      }),
    );
    expect(result.hard).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'ROTATION_EQUITY' }),
      ]),
    );
  });
});
