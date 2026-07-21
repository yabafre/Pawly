/**
 * Story 13-7 (KON-133) — audit finding T8, aped-review AC-1 coverage.
 *
 * The Nest service and this Trigger task are the two runners that recompute the
 * persisted equity counters, and the whole point of T8 is that they must not drift.
 * equity-counter.service.spec.ts already exercises the service end-to-end and
 * equity-counting.spec.ts proves the shared core is UTC-invariant, but nothing ran
 * the Trigger runner itself — its UTC conformance was proven only by inspection
 * (it imports the same core). This spec closes that gap: it drives the real public
 * entry point (equityNightlyRecalcTask.run) and asserts the runner classifies days
 * and derives month bounds in UTC, and that its upserted rows equal the shared core's
 * output for the same inputs.
 */
jest.mock('@trigger.dev/sdk', () => ({
  schedules: { task: (config: unknown) => config },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockPrisma = {
  clinic: { findMany: jest.fn() },
  employee: { findMany: jest.fn() },
  shift: { findMany: jest.fn() },
  clinicClosedDay: { findMany: jest.fn() },
  planningRule: { findFirst: jest.fn() },
  equityCounter: { upsert: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('../lib/prisma', () => ({
  getPrisma: () => mockPrisma,
}));

import { equityNightlyRecalcTask } from './equity-recalc';
import {
  computeEquityCounters,
  type EquityCounterRow,
} from '../../modules/planning/equity-counting';

const runNightly = (
  equityNightlyRecalcTask as unknown as {
    run: () => Promise<{ totalCounters: number }>;
  }
).run;

/**
 * Mutate the REAL process env TZ (via getBuiltinModule — the accessor Jest does not
 * shim, proven in equity-counting.spec.ts) so V8's local-time cache is flushed for the
 * duration of the async call, then restore. A leaked TZ would poison later specs.
 */
const realProcess: NodeJS.Process = (
  process as unknown as {
    getBuiltinModule: (id: string) => NodeJS.Process;
  }
).getBuiltinModule('node:process');

async function withTimezone<T>(tz: string, fn: () => Promise<T>): Promise<T> {
  const original = realProcess.env.TZ;
  realProcess.env.TZ = tz;
  try {
    return await fn();
  } finally {
    if (original === undefined) {
      delete realProcess.env.TZ;
    } else {
      realProcess.env.TZ = original;
    }
  }
}

function upsertedRows(): EquityCounterRow[] {
  return mockPrisma.equityCounter.upsert.mock.calls.map((c) => ({
    employeeId: c[0].create.employeeId,
    counterType: c[0].create.counterType,
    count: c[0].create.count,
  }));
}

describe('equity-recalc Trigger runner (Story 13-7 — UTC, single shared core)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Freeze the clock inside March 2026 so the nightly task's local-month selection
    // (a documented Non-Goal, stays local) is deterministic — even under a negative
    // UTC offset, 12:00Z on the 15th is still the 15th locally, so month = 3.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));

    mockPrisma.clinic.findMany.mockResolvedValue([
      { id: 'clinic-1', name: 'Clinic A' },
    ]);
    mockPrisma.employee.findMany.mockResolvedValue([
      { id: 'emp-1', contractHours: 35 },
    ]);
    mockPrisma.shift.findMany.mockResolvedValue([]);
    mockPrisma.clinicClosedDay.findMany.mockResolvedValue([]);
    mockPrisma.planningRule.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockResolvedValue([{}, {}, {}, {}]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('classifies a UTC-midnight Saturday as SATURDAY_WORKED and queries UTC month bounds under TZ=America/New_York', async () => {
    // 2026-03-07 at UTC midnight is a Saturday. Under the old local-time logic and a
    // negative offset it would read back as Friday and the month window would slide.
    mockPrisma.shift.findMany.mockResolvedValue([
      {
        employeeId: 'emp-1',
        date: new Date('2026-03-07T00:00:00.000Z'),
        startTime: '08:00',
        endTime: '12:00',
      },
    ]);

    await withTimezone('America/New_York', () => runNightly());

    // Month bounds are UTC, not local — the 1st at 00:00:00.000Z, the last day at 23:59.
    const shiftQuery = mockPrisma.shift.findMany.mock.calls[0][0];
    expect(shiftQuery.where.date.gte.toISOString()).toBe(
      '2026-03-01T00:00:00.000Z',
    );
    expect(shiftQuery.where.date.lte.toISOString()).toBe(
      '2026-03-31T23:59:59.999Z',
    );

    // Saturday classification survives the negative offset.
    expect(mockPrisma.equityCounter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clinicId_employeeId_counterType_year_month: {
            clinicId: 'clinic-1',
            employeeId: 'emp-1',
            counterType: 'SATURDAY_WORKED',
            year: 2026,
            month: 3,
          },
        },
        create: expect.objectContaining({ count: 1 }),
        update: expect.objectContaining({ count: 1 }),
      }),
    );
  });

  it('derives its rows from the shared counting core — no drift from computeEquityCounters', async () => {
    const employees = [{ id: 'emp-1', contractHours: 35 }];
    const shifts = [
      {
        employeeId: 'emp-1',
        date: new Date('2026-03-07T00:00:00.000Z'), // Saturday
        startTime: '08:00',
        endTime: '12:00',
      },
      {
        employeeId: 'emp-1',
        date: new Date('2026-03-08T00:00:00.000Z'), // Sunday
        startTime: '09:00',
        endTime: '17:00',
      },
    ];
    mockPrisma.employee.findMany.mockResolvedValue(employees);
    mockPrisma.shift.findMany.mockResolvedValue(shifts);

    const expected = computeEquityCounters({
      year: 2026,
      month: 3,
      employees,
      shifts,
      closedDayKeys: new Set<string>(),
      overtimeThresholdPercent: 0,
    });

    await withTimezone('America/New_York', () => runNightly());

    // The Trigger runner upserts exactly what the shared core produces, in order.
    expect(upsertedRows()).toEqual(expected);
  });
});
