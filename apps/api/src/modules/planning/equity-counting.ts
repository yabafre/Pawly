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
