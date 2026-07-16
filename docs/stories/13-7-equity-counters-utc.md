# Story: 13-7-equity-counters-utc — Equity Counters: UTC & Single Source

**Epic:** Epic 13 — Planning Integrity & Solver Fidelity
**Status:** ready-for-dev
**Branch:** feature/KON-133-13-7-equity-counters-utc
**Ticket:** KON-133 (Linear · project Pawly · milestone Epic 13 · no blockers · Wave 1, `depends_on: []`)
**Origin:** Audit finding T8 (2026-07-14 multi-agent audit, equity auditor) — triaged HIGH/BUG on 2026-07-16 (`docs/triage-decision.md`). The persisted equity counters are the ONLY place in the planning module that classifies days in local time; everything else is UTC. It holds today solely because the deployment runs at a non-negative UTC offset.

> **Read first:** `docs/epics-context/epic-13-context.md` — §3.8 is the invariant this story enforces ("UTC everywhere: dates are UTC-midnight `YYYY-MM-DD` … 13-7 brings the persisted counters in line — do NOT introduce local-TZ Date math anywhere"), §4 carries the anchor map for T8.

## User Story

**As an** admin, **I want** persisted equity counters computed in UTC by a single shared implementation, **so that** counters match the engine's day classification on any deployment timezone and cannot drift between the Nest and Trigger runners.

## Acceptance Criteria

1. **Given** shifts stored at UTC midnight, **When** counters are recomputed — by the API service or by the nightly/monthly recalculation job — **Then** day-of-week classification and the month bounds are computed in UTC, so a Saturday shift increments `SATURDAY_WORKED` under `TZ=UTC`, `TZ=Europe/Paris` **and** `TZ=America/New_York` alike.

2. **Given** one month of identical inputs, **When** the counters are computed under any of those three timezones, **Then** the four counter values per employee are identical (timezone invariance), and the month window includes the 1st of the month while excluding the 1st of the following month.

3. **Given** the two runners that recompute counters, **When** either of them runs, **Then** both derive their values from a single shared counting implementation, and no counting logic remains duplicated between them.

4. **Given** the counter test suite, **When** it builds shift and closed-day fixtures, **Then** they are constructed the way production stores them (UTC midnight) rather than in local time, and the period-bound assertions are read in UTC — closing the blind spot where local-time fixtures masked the defect.

5. **Given** the whole change, **When** the API test suite runs, **Then** every pre-existing equity behaviour is preserved: counter values, the four-counters-per-employee shape and ordering, overtime maths, overnight-shift minutes, holiday detection, the transactional batch upsert, and `lastCalculatedAt`.

## Tasks

- [x] **Task 1 — RED: timezone-invariance spec for the pure core** [AC: 1, 2]

  Create `apps/api/src/modules/planning/equity-counting.spec.ts` with the full content below. It fails now — `./equity-counting` does not exist yet (`Cannot find module './equity-counting'`). That failure IS the RED signal.

  Note on the timezone helper: Node ≥ 16 re-reads `process.env.TZ` for every newly constructed `Date`, so mutating it inside a test changes `getDay()`/local `Date` construction without a process restart. Verified on this repo's Node 22 runtime while drafting this story.

  ```ts
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

  function withTimezone<T>(tz: string, fn: () => T): T {
    const original = process.env.TZ;
    process.env.TZ = tz;
    try {
      return fn();
    } finally {
      if (original === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = original;
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
        expect(firstOfMonth >= periodStart && firstOfMonth <= periodEnd).toBe(true);
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
          withTimezone(tz, () => utcDateKey(new Date('2026-03-02T00:00:00.000Z'))),
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
  ```

  Run: `pnpm --filter @pawly/api test -- equity-counting.spec.ts`
  Expected: RED — `Cannot find module './equity-counting' from 'modules/planning/equity-counting.spec.ts'`, exit 1.
  Commit: `git add apps/api/src/modules/planning/equity-counting.spec.ts && git commit -m "test(KON-133): RED — timezone-invariance spec for the equity counting core"`

- [x] **Task 2 — GREEN: create the pure counting core** [AC: 1, 2, 3]

  Create `apps/api/src/modules/planning/equity-counting.ts` with the full content below. No NestJS, no Prisma, no I/O — it mirrors the pure-module pattern of `french-labor-law.ts` and `rule-engine.ts` in the same directory.

  ```ts
  /**
   * Equity counter counting core — Story 13-7 (KON-133).
   *
   * Single source of truth for turning one month of shifts into the four persisted
   * EquityCounter values. Consumed by BOTH runners that recompute them:
   *   - EquityCounterService.recalculateForPeriod (NestJS)
   *   - equity-nightly-recalc / equity-monthly-final (Trigger.dev tasks)
   * Before this module the Trigger task hand-duplicated the logic and said so in a
   * WARNING header — the two copies were free to drift (audit finding T8).
   *
   * UTC everywhere. Shift.date is stored at UTC midnight and the whole planning module
   * classifies days with getUTCDay() (planning-generation.service.ts, rule-engine.ts,
   * local-repair.ts, solver-model.ts). This module does the same, so persisted counters
   * agree with the engine on ANY deployment timezone. Local-time date maths — getDay(),
   * new Date(y, m, d) — is banned here: at a negative UTC offset it reads a UTC-midnight
   * Saturday back as Friday and slides the month window by a day. Before this story that
   * was the live behaviour, held together only by Europe/Paris being UTC+1/+2.
   *
   * Pure module — no NestJS, no Prisma, no I/O — mirroring french-labor-law.ts and
   * rule-engine.ts.
   */

  /**
   * Structural mirror of Prisma's `EquityCounterType` enum. Declared locally rather than
   * imported from @prisma/client to keep this module free of Prisma (the Trigger bundle
   * treats @prisma/client as external). The union is assignable to the Prisma enum type,
   * so callers need no cast.
   */
  export type EquityCounterName =
    | 'SATURDAY_WORKED'
    | 'WEEKEND_TOTAL'
    | 'HOLIDAY_WORKED'
    | 'OVERTIME_HOURS';

  export interface EquityEmployeeInput {
    id: string;
    contractHours: number;
  }

  export interface EquityShiftInput {
    employeeId: string;
    /** Stored at UTC midnight — read it with getUTC* accessors only. */
    date: Date;
    /** 'HH:mm' */
    startTime: string;
    /** 'HH:mm' */
    endTime: string;
  }

  export interface EquityCountingInput {
    year: number;
    /** 1-based, as persisted on EquityCounter.month. */
    month: number;
    employees: EquityEmployeeInput[];
    shifts: EquityShiftInput[];
    /** UTC date keys ('YYYY-MM-DD') of the clinic's closed days — see utcDateKey. */
    closedDayKeys: Set<string>;
    overtimeThresholdPercent: number;
  }

  export interface EquityCounterRow {
    employeeId: string;
    counterType: EquityCounterName;
    count: number;
  }

  /**
   * UTC bounds of a 1-based month, for `date: { gte, lte }` queries against UTC-midnight
   * Shift.date values. Includes the 1st at 00:00:00.000Z and ends on the last day at
   * 23:59:59.999Z, so the 1st of the next month can never leak in.
   */
  export function utcMonthBounds(
    year: number,
    month: number,
  ): { periodStart: Date; periodEnd: Date } {
    return {
      periodStart: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
      periodEnd: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
    };
  }

  /** 'YYYY-MM-DD' in UTC — the key shape used to match shifts against closed days. */
  export function utcDateKey(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /** Number of days in a 1-based month, computed in UTC. */
  export function utcDaysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  /** Shift duration in minutes from 'HH:mm' strings, wrapping overnight shifts. */
  export function calculateShiftMinutes(
    startTime: string,
    endTime: string,
  ): number {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return endMinutes >= startMinutes
      ? endMinutes - startMinutes
      : 1440 - startMinutes + endMinutes;
  }

  /**
   * Compute the four equity counters for every employee, from shifts already loaded for
   * the (year, month) period. Emits exactly four rows per employee, in employee order and
   * always SATURDAY_WORKED → WEEKEND_TOTAL → HOLIDAY_WORKED → OVERTIME_HOURS, so the
   * caller's batch upsert stays deterministic.
   *
   * OVERTIME_HOURS holds MINUTES, not hours — preserved from the original implementation
   * (the name predates it and is persisted in the EquityCounterType enum).
   */
  export function computeEquityCounters(
    input: EquityCountingInput,
  ): EquityCounterRow[] {
    const {
      year,
      month,
      employees,
      shifts,
      closedDayKeys,
      overtimeThresholdPercent,
    } = input;

    const weeksInMonthCount = utcDaysInMonth(year, month) / 7;
    const counters: EquityCounterRow[] = [];

    for (const employee of employees) {
      const employeeShifts = shifts.filter((s) => s.employeeId === employee.id);

      let saturdayCount = 0;
      let weekendCount = 0;
      let holidayCount = 0;
      let totalShiftMinutes = 0;

      for (const shift of employeeShifts) {
        const dayOfWeek = shift.date.getUTCDay(); // 0=Sunday, 6=Saturday

        if (dayOfWeek === 6) {
          saturdayCount++;
          weekendCount++;
        } else if (dayOfWeek === 0) {
          weekendCount++;
        }

        if (closedDayKeys.has(utcDateKey(shift.date))) {
          holidayCount++;
        }

        totalShiftMinutes += calculateShiftMinutes(
          shift.startTime,
          shift.endTime,
        );
      }

      const contractLimitMinutes =
        employee.contractHours * 60 * weeksInMonthCount;
      const adjustedLimitMinutes =
        contractLimitMinutes * (1 + overtimeThresholdPercent / 100);
      const overtimeMinutes = Math.max(
        0,
        Math.round(totalShiftMinutes - adjustedLimitMinutes),
      );

      counters.push(
        {
          employeeId: employee.id,
          counterType: 'SATURDAY_WORKED',
          count: saturdayCount,
        },
        {
          employeeId: employee.id,
          counterType: 'WEEKEND_TOTAL',
          count: weekendCount,
        },
        {
          employeeId: employee.id,
          counterType: 'HOLIDAY_WORKED',
          count: holidayCount,
        },
        {
          employeeId: employee.id,
          counterType: 'OVERTIME_HOURS',
          count: overtimeMinutes,
        },
      );
    }

    return counters;
  }
  ```

  Run: `pnpm --filter @pawly/api test -- equity-counting.spec.ts`
  Expected: GREEN — `Tests: 25 passed, 25 total`, exit 0.
  Commit: `git add apps/api/src/modules/planning/equity-counting.ts && git commit -m "feat(KON-133): extract the equity counting core as a pure UTC module"`

- [x] **Task 3 — Consume the core from EquityCounterService** [AC: 1, 3, 5]

  In `apps/api/src/modules/planning/equity-counter.service.ts`, add this import below the existing `import type { EquityCounterType } from '@prisma/client';`:

  ```ts
  import {
    computeEquityCounters,
    utcDateKey,
    utcMonthBounds,
  } from './equity-counting';
  ```

  Then replace the whole `recalculateForPeriod` method (its JSDoc block included) with the version below, and DELETE the private `calculateShiftMinutes` method at the end of the class (it now lives in `equity-counting.ts`; the class keeps only Prisma I/O, the batch upsert and logging).

  ```ts
  /**
   * Full recalculation of all counters for a clinic/period from source-of-truth.
   * Bounds and counting are UTC and shared with the equity-recalc Trigger task via
   * equity-counting.ts (Story 13-7). Uses a Prisma transaction for atomic batch upsert.
   */
  async recalculateForPeriod(
    clinicId: string,
    year: number,
    month: number,
  ): Promise<{ countersUpdated: number }> {
    const { periodStart, periodEnd } = utcMonthBounds(year, month);

    // Fetch all active employees for this clinic
    const employees = await this.prisma.employee.findMany({
      where: { clinicId, isActive: true },
      select: { id: true, contractHours: true },
    });

    // Fetch all shifts for this clinic+period
    const shifts = await this.prisma.shift.findMany({
      where: {
        clinicId,
        date: { gte: periodStart, lte: periodEnd },
      },
      select: {
        employeeId: true,
        date: true,
        startTime: true,
        endTime: true,
      },
    });

    // Fetch clinic closed days for holiday detection
    const closedDays = await this.prisma.clinicClosedDay.findMany({
      where: {
        clinicId,
        date: { gte: periodStart, lte: periodEnd },
      },
      select: { date: true },
    });

    const closedDayKeys = new Set(closedDays.map((cd) => utcDateKey(cd.date)));

    // Fetch CONTRACT_COMPLIANCE rule for overtime threshold
    const contractRule = await this.prisma.planningRule.findFirst({
      where: {
        clinicId,
        category: 'CONTRACT_COMPLIANCE',
        isActive: true,
      },
      select: { config: true },
    });

    const overtimeThresholdPercent = contractRule
      ? (((contractRule.config as Record<string, unknown>)
          .overtimeThresholdPercent as number) ?? 0)
      : 0;

    const counters = computeEquityCounters({
      year,
      month,
      employees,
      shifts,
      closedDayKeys,
      overtimeThresholdPercent,
    });

    const now = new Date();

    // Batch upsert in a transaction
    const result = await this.prisma.$transaction(
      counters.map((c) =>
        this.prisma.equityCounter.upsert({
          where: {
            clinicId_employeeId_counterType_year_month: {
              clinicId,
              employeeId: c.employeeId,
              counterType: c.counterType,
              year,
              month,
            },
          },
          create: {
            clinicId,
            employeeId: c.employeeId,
            counterType: c.counterType,
            year,
            month,
            count: c.count,
            lastCalculatedAt: now,
          },
          update: {
            count: c.count,
            lastCalculatedAt: now,
          },
        }),
      ),
    );

    this.logger.log(
      `Recalculated ${result.length} equity counters for clinic ${clinicId} (${year}-${String(month).padStart(2, '0')})`,
    );

    return { countersUpdated: result.length };
  }
  ```

  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json`
  Expected: no output, exit 0. (`EquityCounterName` is assignable to Prisma's `EquityCounterType` — both are the same string union — so the upsert needs no cast.)
  Commit: `git add apps/api/src/modules/planning/equity-counter.service.ts && git commit -m "fix(KON-133): compute persisted equity counters in UTC via the shared core"`

- [x] **Task 4 — Rebuild the service spec on production-shaped dates** [AC: 4, 5]

  Two mechanical edits to `apps/api/src/modules/planning/equity-counter.service.spec.ts`.

  **(a)** The spec builds 13 mock dates in local time — `new Date(2026, 2, 7)` — which is not what production stores. Rewrite every one of them to UTC midnight with this exact command (macOS `sed`; it captures the day argument, so it handles the literal days and the `day` loop variable on line 635 alike):

  ```bash
  sed -i '' -E 's/new Date\(2026, 2, ([A-Za-z0-9]+)\)/new Date(Date.UTC(2026, 2, \1))/g' apps/api/src/modules/planning/equity-counter.service.spec.ts
  ```

  Verify the rewrite left nothing behind — this must print nothing and exit 1:

  ```bash
  grep -n "new Date(2026, 2, " apps/api/src/modules/planning/equity-counter.service.spec.ts
  ```

  **(b)** The period-bound assertions read the bounds in local time, which passes for the wrong reason. Replace the body of the `it('fetches shifts within the period date range', ...)` test with the version below:

  ```ts
    it('fetches shifts within the period date range', async () => {
      await service.recalculateForPeriod(clinicId, 2026, 3);

      const callArgs = mockPrismaService.shift.findMany.mock.calls[0][0];
      expect(callArgs.where.clinicId).toBe(clinicId);
      const gte = callArgs.where.date.gte;
      const lte = callArgs.where.date.lte;
      // March 2026, in UTC: production stores Shift.date at UTC midnight, so the window
      // must be UTC too — reading these bounds with local getters would pass under
      // Europe/Paris while the window silently slid a day (Story 13-7, audit T8).
      expect(gte.toISOString()).toBe('2026-03-01T00:00:00.000Z');
      expect(lte.toISOString()).toBe('2026-03-31T23:59:59.999Z');
    });
  ```

  Run: `pnpm --filter @pawly/api test -- equity-counter.service.spec.ts`
  Expected: GREEN — `Tests: 45 passed, 45 total`, exit 0. If a Saturday/Sunday/holiday assertion goes red here, the counting core is wrong, not the spec — fix `equity-counting.ts`, never the expectation.
  Commit: `git add apps/api/src/modules/planning/equity-counter.service.spec.ts && git commit -m "test(KON-133): build equity mocks at UTC midnight like production stores them"`

- [x] **Task 5 — Consume the core from the Trigger task and delete the duplication** [AC: 3]

  In `apps/api/src/trigger/tasks/equity-recalc.ts`, replace everything from line 1 down to the end of the `recalculateForClinic` function (i.e. the `WARNING` header, the local `calculateShiftMinutes`, and the whole counting body — the file's first 124 lines) with the block below. Leave `equityNightlyRecalcTask` and `equityMonthlyFinalTask` untouched.

  The relative import path is deliberate: the Trigger bundler does not resolve the `@/` tsconfig alias, which is why `batch-email-publish.ts` already reaches into `../../common/metrics` and `../../modules/mail/mail-i18n` the same way.

  ```ts
  import { schedules, logger } from '@trigger.dev/sdk';
  import { getPrisma } from '../lib/prisma';
  import {
    computeEquityCounters,
    utcDateKey,
    utcMonthBounds,
  } from '../../modules/planning/equity-counting';

  async function recalculateForClinic(clinicId: string, year: number, month: number): Promise<number> {
    const { periodStart, periodEnd } = utcMonthBounds(year, month);

    const employees = await getPrisma().employee.findMany({
      where: { clinicId, isActive: true },
      select: { id: true, contractHours: true },
    });

    const shifts = await getPrisma().shift.findMany({
      where: {
        clinicId,
        date: { gte: periodStart, lte: periodEnd },
      },
      select: { employeeId: true, date: true, startTime: true, endTime: true },
    });

    const closedDays = await getPrisma().clinicClosedDay.findMany({
      where: { clinicId, date: { gte: periodStart, lte: periodEnd } },
      select: { date: true },
    });

    const closedDayKeys = new Set(closedDays.map((cd) => utcDateKey(cd.date)));

    const contractRule = await getPrisma().planningRule.findFirst({
      where: { clinicId, category: 'CONTRACT_COMPLIANCE', isActive: true },
      select: { config: true },
    });

    const overtimeThresholdPercent = contractRule
      ? ((contractRule.config as Record<string, unknown>).overtimeThresholdPercent as number) ?? 0
      : 0;

    const counters = computeEquityCounters({
      year,
      month,
      employees,
      shifts,
      closedDayKeys,
      overtimeThresholdPercent,
    });

    const now = new Date();

    const result = await getPrisma().$transaction(
      counters.map((c) =>
        getPrisma().equityCounter.upsert({
          where: {
            clinicId_employeeId_counterType_year_month: {
              clinicId,
              employeeId: c.employeeId,
              counterType: c.counterType,
              year,
              month,
            },
          },
          create: {
            clinicId,
            employeeId: c.employeeId,
            counterType: c.counterType,
            year,
            month,
            count: c.count,
            lastCalculatedAt: now,
          },
          update: {
            count: c.count,
            lastCalculatedAt: now,
          },
        }),
      ),
    );

    return result.length;
  }
  ```

  Confirm the duplication is really gone — each of these must print nothing and exit 1:

  ```bash
  grep -n "Business logic duplicated\|getDay()\|new Date(year, month" apps/api/src/trigger/tasks/equity-recalc.ts
  ```

  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json`
  Expected: no output, exit 0.
  Commit: `git add apps/api/src/trigger/tasks/equity-recalc.ts && git commit -m "refactor(KON-133): drop the duplicated equity logic from the Trigger task"`

- [x] **Task 6 — Full planning suite + no local-time regression** [AC: 1, 3, 5]

  Prove nothing else in the planning module regressed, and that the two local-time sites the audit flagged are gone for good.

  ```bash
  grep -rn "\.getDay()" apps/api/src/modules/planning apps/api/src/trigger/tasks --include=*.ts
  ```

  Expected: prints nothing, exit 1. (`getDay()` had exactly two call sites in this scope before this story — `equity-counter.service.ts:226` and `equity-recalc.ts:69`. Both are now `getUTCDay()` inside the shared core.)

  ```bash
  pnpm --filter @pawly/api test -- src/modules/planning
  ```

  Expected: GREEN, every planning spec passing, exit 0 — including `planning-generation.service.spec.ts` and `planning.service.spec.ts`, which consume the counters this story now recomputes.

  Commit: `git add -u apps/api/src && git commit -m "test(KON-133): green planning suite after the UTC equity counting move"`

## Dev Notes

### The bug, measured

`Shift.date` is stored at UTC midnight. Probed on this repo's Node 22 runtime while drafting, with the shift `2026-03-07T00:00:00.000Z` (a Saturday) and the CURRENT local-time bounds `new Date(2026, 2, 1)` … `new Date(2026, 3, 0, 23, 59, 59, 999)`:

| TZ | `getDay()` | 1st of month inside the window | 1st of NEXT month leaks in |
|---|---|---|---|
| Europe/Paris (+1/+2) | 6 ✅ | yes ✅ | no ✅ |
| UTC (0) | 6 ✅ | yes ✅ | no ✅ |
| America/New_York (−4/−5) | **5 ❌** | **no ❌** | **yes ❌** |
| Pacific/Auckland (+12/+13) | 6 ✅ | yes ✅ | no ✅ |

Two consequences that shape this story:

1. The audit's "holds only thanks to Europe/Paris" is precise: the defect needs a **negative** UTC offset to bite. It is latent today, not live.
2. **A `TZ=UTC` test cannot fail against the buggy code** — at offset 0 `getDay() === getUTCDay()` and the local bounds coincide with the UTC ones. The ticket's AC-3 asks for the `TZ=UTC` case; this story keeps it *and* adds `America/New_York`, which is the case that actually goes RED, plus `Europe/Paris` as the production non-regression. Agreed with Alex at the step-04 gate; KON-133's AC-3 was updated to match.

### Non-Goals — deferred / out of scope

- **The cron month selection stays local.** `equity-counter.scheduler.ts:29-30` and `equity-recalc.ts:133-135`/`:168-170` pick the target month with `new Date().getFullYear()/getMonth()` in local time. That is intentional and stays: both crons are anchored to `Europe/Paris` and the business meaning is "the clinic's current month", not "the UTC month". It is also safe — `0 2 * * *` at Europe/Paris fires at 00:00/01:00 UTC on the same calendar day, so the month never disagrees. Do not "fix" it in this story.
- **No equity horizon/bias redesign.** The 12-month window vs current month, and the tie-break/new-hire bias, are deferred: `.aped/.out-of-scope/2026-07-16-equite-horizon-et-biais.md`.
- **No `EquityCounterType` rename.** `OVERTIME_HOURS` stores MINUTES. The name is wrong but it is a persisted Prisma enum value; renaming is a migration, not this story.
- **No live equity increment change.** The generator's intra-month counter increments (Story 11-7) already run on `getUTCDay()` and are untouched.
- **No performance work.** `shifts.filter(...)` per employee is carried over as-is (O(n·m)); the move to a pure module is behaviour-preserving by design, and 50 employees × one month is the NFR9 ceiling.

### Architecture

- **Where the core lives.** `apps/api/src/modules/planning/equity-counting.ts`, next to the other pure cores of the module — `french-labor-law.ts` ("Pure module — no NestJS, no Prisma, no I/O") and `rule-engine.ts` (same header, Story 11-8). Both stayed in `apps/api` rather than moving to `packages/@pawly/*`; this story follows that precedent and does not open the domain-package question.
- **Why both runners can import it.** The NestJS service imports `./equity-counting`; the Trigger task imports `../../modules/planning/equity-counting` — a relative path, because the Trigger bundler does not resolve the `@/` tsconfig alias. `batch-email-publish.ts:4-10` already crosses into `../../modules/...` and `../../common/metrics` exactly this way, so the pattern is established, not invented here.
- **Why the type union is declared locally.** `EquityCounterName` mirrors Prisma's `EquityCounterType` instead of importing it, keeping the core Prisma-free (`@prisma/client` is `external` in `trigger.config.ts`). Prisma 7 generates the enum as a string union, so `EquityCounterName` is assignable to it with no cast at the upsert call sites.
- **Data flow is untouched.** No tRPC, no router, no server action, no UI. The counters this story recomputes feed `planning-generation.service.ts` (the `equityMap` built around `:1029-1050`) and the ROTATION_EQUITY violations in `planning.service.ts` — both read the persisted rows and are unchanged.
- **Commit prefix:** `feat(KON-133): …` / `fix(KON-133): …` / `test(KON-133): …` / `refactor(KON-133): …`. PR targets `develop`.

### Existing code at write time (Step-0 verbatim quotes — re-verify the symbol, line numbers may drift)

`apps/api/src/modules/planning/equity-counting.ts` — **existing code: none, this is a new file.** Nothing in `apps/api/src` exports `computeEquityCounters`, `utcMonthBounds`, `utcDateKey` or `utcDaysInMonth` today; Task 2 creates all four.

`apps/api/src/modules/planning/equity-counting.spec.ts` — **existing code: none, this is a new file.** Task 1 creates it.

The three files below already exist. Quotes are verbatim as of 2026-07-16 (commit `9a182fc`).

`apps/api/src/modules/planning/equity-counter.service.ts:152-158` (current) — local month bounds:

```ts
  async recalculateForPeriod(
    clinicId: string,
    year: number,
    month: number,
  ): Promise<{ countersUpdated: number }> {
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);
```

`apps/api/src/modules/planning/equity-counter.service.ts:224-246` (current) — local day classification:

```ts
      for (const shift of employeeShifts) {
        const shiftDate = new Date(shift.date);
        const dayOfWeek = shiftDate.getDay(); // 0=Sunday, 6=Saturday

        if (dayOfWeek === 6) {
          saturdayCount++;
          weekendCount++;
        } else if (dayOfWeek === 0) {
          weekendCount++;
        }

        // Holiday detection: check if shift date is a closed day
        const dateKey = shiftDate.toISOString().split('T')[0];
        if (closedDaySet.has(dateKey)) {
          holidayCount++;
        }

        // Calculate shift duration in minutes
        totalShiftMinutes += this.calculateShiftMinutes(
          shift.startTime,
          shift.endTime,
        );
      }
```

`apps/api/src/modules/planning/equity-counter.service.ts:249-258` (current) — overtime maths, preserved verbatim in the core:

```ts
      // Calculate overtime: excess minutes beyond adjusted contract limit
      const daysInMonthCount = new Date(year, month, 0).getDate();
      const weeksInMonthCount = daysInMonthCount / 7;
      const contractLimitMinutes =
        employee.contractHours * 60 * weeksInMonthCount;
      const adjustedLimitMinutes =
        contractLimitMinutes * (1 + overtimeThresholdPercent / 100);
      const overtimeMinutes = Math.max(
        0,
        Math.round(totalShiftMinutes - adjustedLimitMinutes),
      );
```

`apps/api/src/modules/planning/equity-counter.service.ts:339-351` (current) — the private helper this story deletes (it moves to the core):

```ts
  /**
   * Calculate shift duration in minutes from HH:mm time strings.
   */
  private calculateShiftMinutes(startTime: string, endTime: string): number {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    // Handle overnight shifts
    return endMinutes >= startMinutes
      ? endMinutes - startMinutes
      : 1440 - startMinutes + endMinutes;
  }
```

`apps/api/src/trigger/tasks/equity-recalc.ts:1-19` (current) — the header that admits the duplication, and the same local bounds. Its third line is the promise this story keeps:

<!-- aped-lint-disable -->
```ts
// WARNING: Business logic duplicated from EquityCounterService (equity-counter.service.ts).
// Any changes to equity calculation rules MUST be applied in both places.
// TODO: Extract shared pure functions to eliminate duplication (Phase 2).
import { schedules, logger } from '@trigger.dev/sdk';
import { getPrisma } from '../lib/prisma';

function calculateShiftMinutes(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  return endMinutes >= startMinutes
    ? endMinutes - startMinutes
    : 1440 - startMinutes + endMinutes;
}

async function recalculateForClinic(clinicId: string, year: number, month: number): Promise<number> {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);
```
<!-- aped-lint-enable -->

`apps/api/src/trigger/tasks/equity-recalc.ts:67-78` (current) — the duplicated local classification:

```ts
    for (const shift of employeeShifts) {
      const shiftDate = new Date(shift.date);
      const dayOfWeek = shiftDate.getDay();

      if (dayOfWeek === 6) { saturdayCount++; weekendCount++; }
      else if (dayOfWeek === 0) { weekendCount++; }

      const dateKey = shiftDate.toISOString().split('T')[0];
      if (closedDaySet.has(dateKey)) { holidayCount++; }

      totalShiftMinutes += calculateShiftMinutes(shift.startTime, shift.endTime);
    }
```

`apps/api/src/modules/planning/equity-counter.service.spec.ts:357-371` (current) — the assertion that reads bounds in local time:

```ts
    it('fetches shifts within the period date range', async () => {
      await service.recalculateForPeriod(clinicId, 2026, 3);

      const callArgs = mockPrismaService.shift.findMany.mock.calls[0][0];
      expect(callArgs.where.clinicId).toBe(clinicId);
      const gte = callArgs.where.date.gte;
      const lte = callArgs.where.date.lte;
      // March 2026: starts March 1, ends March 31
      expect(gte.getFullYear()).toBe(2026);
      expect(gte.getMonth()).toBe(2); // 0-based: 2 = March
      expect(gte.getDate()).toBe(1);
      expect(lte.getFullYear()).toBe(2026);
      expect(lte.getMonth()).toBe(2);
      expect(lte.getDate()).toBe(31);
    });
```

`apps/api/src/modules/planning/equity-counter.service.spec.ts:395-404` (current) — the blind spot: a local-time mock date standing in for a UTC-midnight one:

```ts
    it('detects Saturday shifts (day of week = 6)', async () => {
      // 2026-03-07 is a Saturday
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          date: new Date(2026, 2, 7), // Saturday March 7
          startTime: '08:00',
          endTime: '12:00',
        },
      ]);
```

The 13 local-time mock dates to rewrite in that spec are on lines **400, 440, 446, 491, 531, 538, 567, 635, 680, 714, 794, 833, 905** (line 635 is `new Date(2026, 2, day)` inside a loop — the Task 4 `sed` handles it).

### File decision map

- **`apps/api/src/modules/planning/equity-counting.ts`** — *new*.
  - Single responsibility: turn one month of already-loaded shifts into the four equity counter rows per employee, in UTC.
  - In: plain employee/shift/closed-day data + the overtime threshold. Out: `EquityCounterRow[]`, plus the `utcMonthBounds` / `utcDateKey` / `utcDaysInMonth` / `calculateShiftMinutes` helpers.
  - Imports nothing. Pure.

- **`apps/api/src/modules/planning/equity-counting.spec.ts`** — *new*.
  - Single responsibility: prove the core is timezone-invariant and that the counter maths is unchanged.
  - In: `./equity-counting`. Out: nothing (Jest).

- **`apps/api/src/modules/planning/equity-counter.service.ts`** — *modified*.
  - Single responsibility: Prisma I/O for equity counters — read the period's inputs, delegate the counting, upsert the rows transactionally, log.
  - In: `PrismaService`, `ClinicService`, `./equity-counting`. Out: `CounterWithEmployee[]`, `QuarterlySummaryRow[]`, `{ countersUpdated }`.

- **`apps/api/src/trigger/tasks/equity-recalc.ts`** — *modified*.
  - Single responsibility: schedule the nightly/monthly recalculation and run it for every clinic — no business logic of its own.
  - In: `@trigger.dev/sdk`, `../lib/prisma`, `../../modules/planning/equity-counting`. Out: the two `schedules.task` exports.

- **`apps/api/src/modules/planning/equity-counter.service.spec.ts`** — *modified*.
  - Single responsibility: cover `EquityCounterService` against mocks shaped like production data.
  - In: `@nestjs/testing`, the service, mocked `PrismaService`/`ClinicService`. Out: nothing (Jest).

### Testing

- **Framework:** Jest, `*.spec.ts`, `testEnvironment: node`, `rootDir: src` (`apps/api/package.json` → `jest`). Web is Vitest — irrelevant here, this story is API-only.
- **Run from the repo root, never `cd apps/api`** (CLAUDE.md). The root `pnpm test` is broken by the rtk shim — use `--filter` (project memory, Epic 11 gotcha):
  - one spec: `pnpm --filter @pawly/api test -- equity-counting.spec.ts`
  - the module: `pnpm --filter @pawly/api test -- src/modules/planning`
- **Timezone control:** `withTimezone()` mutates `process.env.TZ` around the call. Node ≥ 16 re-reads it per `Date` construction, so no process restart is needed — verified on Node 22 while drafting. Always restore in a `finally`; a leaked `TZ` would poison every later spec in the worker.
- **The RED that matters:** `describe.each(['UTC','Europe/Paris','America/New_York'])`. Only the `America/New_York` arm fails against the old local-time logic. If you find yourself with an all-green suite before Task 2 exists, the spec is not testing what it claims.
- **Lesson L2 (`docs/lessons.md`):** unit tests are not a user journey. There is no UI or user-facing flow in this story — the equity page renders whatever the counters hold — so the pre-existing planning suite (`planning-generation.service.spec.ts`, `planning.service.spec.ts`) is the integration-level guard here, which is why Task 6 runs the whole module rather than the two touched specs.
- **Lesson L4:** no third-party SDK behaviour is involved (no Context7 lookup needed). The only external contract is Prisma's generated `EquityCounterType`, read from the local schema at `apps/api/prisma/schema/EquityCounter.prisma`.

### Dependencies

- **Story deps:** none. Epic 13 Wave 1 (`state.yaml` → `13-7-equity-counters-utc.depends_on: []`), parallel with 13-1 and 13-3. No file overlap with either: 13-1 owns `planning-generation.service.ts` manual writes, 13-3 owns `timesOverlap`/`solver-model.ts`.
- **No new packages.** No Prisma schema change, no migration, no `db:push`.
- **Deploy note:** `equity-recalc.ts` is a Trigger task, so the change only reaches production on the next `pnpm trigger:deploy:prod` (from the repo root — never `npx trigger.dev@latest`, project memory). Not this story's job; flag it at ship time.
- **Runtime:** no Node version constraint (unlike the cpsat solver's ≥ 22.12).

## File List

- `apps/api/src/modules/planning/equity-counting.ts` (new)
- `apps/api/src/modules/planning/equity-counting.spec.ts` (new)
- `apps/api/src/modules/planning/equity-counter.service.ts` (modified)
- `apps/api/src/modules/planning/equity-counter.service.spec.ts` (modified)
- `apps/api/src/trigger/tasks/equity-recalc.ts` (modified)

## Dev Agent Record

- **Model:** claude-opus-4-8[1m]
- **Started:** 2026-07-16
- **Completed:** 2026-07-16

### Summary

Extracted a pure, UTC-only counting core (`equity-counting.ts`) and made both recompute
paths — `EquityCounterService.recalculateForPeriod` and the `equity-recalc` Trigger task —
consume it, deleting the hand-duplicated logic the WARNING header flagged (audit T8). Day
classification and month bounds are now `getUTCDay()` / `Date.UTC`, so persisted counters
agree with the engine on any deployment timezone. Behaviour is preserved: 40 service tests
and the full 485-test planning suite stay green.

### Files changed

- `apps/api/src/modules/planning/equity-counting.ts` (new — pure UTC core)
- `apps/api/src/modules/planning/equity-counting.spec.ts` (new — timezone-invariance spec)
- `apps/api/src/modules/planning/equity-counter.service.ts` (delegates to the core; local `calculateShiftMinutes` deleted)
- `apps/api/src/modules/planning/equity-counter.service.spec.ts` (mocks rebuilt at UTC midnight; bounds asserted in ISO UTC)
- `apps/api/src/trigger/tasks/equity-recalc.ts` (duplication removed; imports the shared core)

### Deviations

- **Extra commit `794e8d3` — the invariance arms were silently vacant under Jest.** The
  story's `withTimezone()` mutates `process.env.TZ`, but Jest hands each spec file a *copy*
  of `process.env`, so the write never reached Node's env setter and V8's timezone cache was
  never flushed — all three arms ran under the machine TZ (Europe/Paris) and would have
  passed against the very local-time code this story removes. Fixed by mutating the real
  process via `process.getBuiltinModule('node:process')` (the one accessor Jest does not
  shim). Proven by mutation: with the pre-13-7 logic restored, the `America/New_York` arm
  goes red (5 failed); with the UTC core, 28/28 green. This is exactly the "all-green before
  Task 2 exists ⇒ the spec is not testing what it claims" failure the story's Testing note
  warned about — the story's own helper had it latent.
- **Test counts differ from the story's predictions** (author miscount, no tests dropped):
  core spec is 28 not 25 (7 cases × 3 TZ + 5 + 2); service spec is 40 not 45. Verified no
  `it(`/`describe(` was removed by the rewrite.
- **Task 3 tsc gate is not `exit 0` at the repo baseline.** 24 pre-existing `error TS` live
  in unrelated `*.spec.ts` (variance/clinic/employee/planning) whose type signatures drifted
  from their services. Confirmed identical with and without my service change (git-stash
  A/B) — my modified production files add zero new errors. Not this story's scope.
- **No Task 6 commit.** The story's `git add -u apps/api/src && commit` was to capture any
  suite-driven fixes; the suite was green with no additional changes, so an empty commit was
  correctly skipped.
- **Per-test verbatim AC quotes not added.** The story mandated the exact spec file content
  verbatim; its author used a file-level Story-13-7/T8 docblock rather than per-test AC
  quotes. Transcribing the frozen spec exactly (rather than retrofitting comments the story
  did not include) honours "implement the story spec exactly"; AC→test traceability is intact
  via the docblock and Dev Notes.
- **Environment:** the worktree shipped with only the root `node_modules` symlinked (no
  per-package installs) — `jest` was unresolved. Per Alex's decision, removed the symlink and
  ran an isolated `pnpm install` (9s, content-addressed store, no real disk duplication).

### Test output

```
$ pnpm --filter @pawly/api test -- "equity-counting.spec.ts|equity-counter.service.spec.ts"
PASS src/modules/planning/equity-counter.service.spec.ts
PASS src/modules/planning/equity-counting.spec.ts
Test Suites: 2 passed, 2 total
Tests:       68 passed, 68 total     # 28 pure core + 40 service
Exit: 0

$ pnpm --filter @pawly/api test -- src/modules/planning
Test Suites: 16 passed, 16 total
Tests:       485 passed, 485 total
Exit: 0

$ grep -rn "\.getDay()" apps/api/src/modules/planning apps/api/src/trigger/tasks --include="*.ts"
# (no matches — exit 1)
```
