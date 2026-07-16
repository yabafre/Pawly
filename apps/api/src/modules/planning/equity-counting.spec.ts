import {
  calculateShiftMinutes,
  computeEquityCounters,
  utcDateKey,
  utcDaysInMonth,
  utcMonthBounds,
  type EquityCounterRow,
  type EquityCounterName,
  type EquityShiftInput,
} from './equity-counting';

/**
 * Story 13-7 (KON-133) — audit finding T8.
 *
 * The counting core must be timezone-INVARIANT: production stores Shift.date at UTC
 * midnight and the engine classifies days with getUTCDay(), so the persisted counters
 * must agree regardless of the deployment TZ.
 *
 * Why three timezones and not just `UTC`:
 *   - UTC             (offset 0)  — the AC's literal case.
 *   - Europe/Paris    (offset +1/+2) — today's production; must not regress.
 *   - America/New_York(offset -4/-5) — the case that actually FAILS with the old
 *     local-time code: a UTC-midnight Saturday reads back as Friday (getDay() === 5),
 *     the 1st of the month falls outside local bounds, and the 1st of the NEXT month
 *     leaks in. A UTC-only test would pass against the buggy code and prove nothing.
 */
const TIMEZONES = ['UTC', 'Europe/Paris', 'America/New_York'] as const;

/**
 * Jest's sandbox hands each test file a COPY of process.env, so assigning TZ on it
 * never reaches Node's real env setter — and it is that setter which fires the
 * DateTimeConfigurationChangeNotification that flushes V8's timezone cache. Writing to
 * the sandbox copy is therefore a silent no-op: all three arms below would run under the
 * machine's own TZ and pass against the very local-time code this story removes.
 * process.getBuiltinModule is the one accessor Jest does not shim, so it yields the real
 * process whose env setter does fire the notification. Verified on Node 22 under this
 * repo's Jest runner: with the pre-13-7 logic restored, the America/New_York arm goes red.
 */
const realProcess: NodeJS.Process = (
  process as unknown as {
    getBuiltinModule: (id: string) => NodeJS.Process;
  }
).getBuiltinModule('node:process');

function withTimezone<T>(tz: string, fn: () => T): T {
  const original = realProcess.env.TZ;
  realProcess.env.TZ = tz;
  try {
    return fn();
  } finally {
    // A leaked TZ would poison every later spec sharing this worker.
    if (original === undefined) {
      delete realProcess.env.TZ;
    } else {
      realProcess.env.TZ = original;
    }
  }
}

const employee = { id: 'emp-1', contractHours: 35 };

function shiftOn(
  dateISO: string,
  startTime = '08:00',
  endTime = '12:00',
): EquityShiftInput {
  return { employeeId: 'emp-1', date: new Date(dateISO), startTime, endTime };
}

function countOf(rows: EquityCounterRow[], type: EquityCounterName): number {
  const row = rows.find((r) => r.counterType === type);
  if (!row) throw new Error(`no ${type} row`);
  return row.count;
}

describe('equity-counting (pure core)', () => {
  describe.each(TIMEZONES)('timezone invariance under TZ=%s', (tz) => {
    it('counts a UTC-midnight Saturday as SATURDAY_WORKED and WEEKEND_TOTAL', () => {
      const rows = withTimezone(tz, () =>
        computeEquityCounters({
          year: 2026,
          month: 3,
          employees: [employee],
          shifts: [shiftOn('2026-03-07T00:00:00.000Z')],
          closedDayKeys: new Set<string>(),
          overtimeThresholdPercent: 0,
        }),
      );

      expect(countOf(rows, 'SATURDAY_WORKED')).toBe(1);
      expect(countOf(rows, 'WEEKEND_TOTAL')).toBe(1);
    });

    it('counts a UTC-midnight Sunday as WEEKEND_TOTAL only', () => {
      const rows = withTimezone(tz, () =>
        computeEquityCounters({
          year: 2026,
          month: 3,
          employees: [employee],
          shifts: [shiftOn('2026-03-08T00:00:00.000Z')],
          closedDayKeys: new Set<string>(),
          overtimeThresholdPercent: 0,
        }),
      );

      expect(countOf(rows, 'SATURDAY_WORKED')).toBe(0);
      expect(countOf(rows, 'WEEKEND_TOTAL')).toBe(1);
    });

    it('counts a UTC-midnight Monday as neither Saturday nor weekend', () => {
      const rows = withTimezone(tz, () =>
        computeEquityCounters({
          year: 2026,
          month: 3,
          employees: [employee],
          shifts: [shiftOn('2026-03-02T00:00:00.000Z')],
          closedDayKeys: new Set<string>(),
          overtimeThresholdPercent: 0,
        }),
      );

      expect(countOf(rows, 'SATURDAY_WORKED')).toBe(0);
      expect(countOf(rows, 'WEEKEND_TOTAL')).toBe(0);
    });

    it('derives UTC month bounds that include the 1st and exclude the next month', () => {
      const { periodStart, periodEnd } = withTimezone(tz, () =>
        utcMonthBounds(2026, 3),
      );

      expect(periodStart.toISOString()).toBe('2026-03-01T00:00:00.000Z');
      expect(periodEnd.toISOString()).toBe('2026-03-31T23:59:59.999Z');

      const firstOfMonth = new Date('2026-03-01T00:00:00.000Z');
      const firstOfNextMonth = new Date('2026-04-01T00:00:00.000Z');
      expect(firstOfMonth >= periodStart && firstOfMonth <= periodEnd).toBe(
        true,
      );
      expect(
        firstOfNextMonth >= periodStart && firstOfNextMonth <= periodEnd,
      ).toBe(false);
    });

    it('matches a closed day by its UTC date key', () => {
      const rows = withTimezone(tz, () =>
        computeEquityCounters({
          year: 2026,
          month: 3,
          employees: [employee],
          shifts: [shiftOn('2026-03-02T00:00:00.000Z')],
          closedDayKeys: new Set(['2026-03-02']),
          overtimeThresholdPercent: 0,
        }),
      );

      expect(countOf(rows, 'HOLIDAY_WORKED')).toBe(1);
    });

    it('derives the UTC date key of a UTC-midnight date', () => {
      expect(
        withTimezone(tz, () =>
          utcDateKey(new Date('2026-03-02T00:00:00.000Z')),
        ),
      ).toBe('2026-03-02');
    });

    it('counts the days of a month in UTC', () => {
      expect(withTimezone(tz, () => utcDaysInMonth(2026, 3))).toBe(31);
      expect(withTimezone(tz, () => utcDaysInMonth(2026, 2))).toBe(28);
    });
  });

  describe('counter values (behaviour preserved from EquityCounterService)', () => {
    it('emits the four counters per employee, in a stable order', () => {
      const rows = computeEquityCounters({
        year: 2026,
        month: 3,
        employees: [employee, { id: 'emp-2', contractHours: 35 }],
        shifts: [],
        closedDayKeys: new Set<string>(),
        overtimeThresholdPercent: 0,
      });

      expect(rows).toEqual<EquityCounterRow[]>([
        { employeeId: 'emp-1', counterType: 'SATURDAY_WORKED', count: 0 },
        { employeeId: 'emp-1', counterType: 'WEEKEND_TOTAL', count: 0 },
        { employeeId: 'emp-1', counterType: 'HOLIDAY_WORKED', count: 0 },
        { employeeId: 'emp-1', counterType: 'OVERTIME_HOURS', count: 0 },
        { employeeId: 'emp-2', counterType: 'SATURDAY_WORKED', count: 0 },
        { employeeId: 'emp-2', counterType: 'WEEKEND_TOTAL', count: 0 },
        { employeeId: 'emp-2', counterType: 'HOLIDAY_WORKED', count: 0 },
        { employeeId: 'emp-2', counterType: 'OVERTIME_HOURS', count: 0 },
      ]);
    });

    it('computes overtime minutes beyond the adjusted contract limit', () => {
      // contractHours 1 → limit = 60 * (31/7) = 265.714… minutes for March 2026.
      // One 08:00→18:00 shift = 600 minutes → round(600 − 265.714…) = 334.
      const rows = computeEquityCounters({
        year: 2026,
        month: 3,
        employees: [{ id: 'emp-1', contractHours: 1 }],
        shifts: [shiftOn('2026-03-02T00:00:00.000Z', '08:00', '18:00')],
        closedDayKeys: new Set<string>(),
        overtimeThresholdPercent: 0,
      });

      expect(countOf(rows, 'OVERTIME_HOURS')).toBe(334);
    });

    it('applies the overtime threshold percentage to the contract limit', () => {
      // Same inputs at a 10% tolerance → round(600 − 265.714… × 1.1) = 308.
      const rows = computeEquityCounters({
        year: 2026,
        month: 3,
        employees: [{ id: 'emp-1', contractHours: 1 }],
        shifts: [shiftOn('2026-03-02T00:00:00.000Z', '08:00', '18:00')],
        closedDayKeys: new Set<string>(),
        overtimeThresholdPercent: 10,
      });

      expect(countOf(rows, 'OVERTIME_HOURS')).toBe(308);
    });

    it('never reports negative overtime', () => {
      const rows = computeEquityCounters({
        year: 2026,
        month: 3,
        employees: [employee],
        shifts: [shiftOn('2026-03-02T00:00:00.000Z')],
        closedDayKeys: new Set<string>(),
        overtimeThresholdPercent: 0,
      });

      expect(countOf(rows, 'OVERTIME_HOURS')).toBe(0);
    });

    it('only counts the shifts of the employee being scored', () => {
      const rows = computeEquityCounters({
        year: 2026,
        month: 3,
        employees: [employee, { id: 'emp-2', contractHours: 35 }],
        shifts: [
          { ...shiftOn('2026-03-07T00:00:00.000Z'), employeeId: 'emp-2' },
        ],
        closedDayKeys: new Set<string>(),
        overtimeThresholdPercent: 0,
      });

      const emp1 = rows.filter((r) => r.employeeId === 'emp-1');
      const emp2 = rows.filter((r) => r.employeeId === 'emp-2');
      expect(countOf(emp1, 'SATURDAY_WORKED')).toBe(0);
      expect(countOf(emp2, 'SATURDAY_WORKED')).toBe(1);
    });
  });

  describe('calculateShiftMinutes', () => {
    it('measures a same-day shift', () => {
      expect(calculateShiftMinutes('08:00', '12:00')).toBe(240);
    });

    it('measures an overnight shift by wrapping past midnight', () => {
      expect(calculateShiftMinutes('22:00', '06:00')).toBe(480);
    });
  });
});
