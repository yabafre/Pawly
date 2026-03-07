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

  const closedDaySet = new Set(
    closedDays.map((cd) => cd.date.toISOString().split('T')[0]),
  );

  const contractRule = await getPrisma().planningRule.findFirst({
    where: { clinicId, category: 'CONTRACT_COMPLIANCE', isActive: true },
    select: { config: true },
  });

  const overtimeThresholdPercent = contractRule
    ? ((contractRule.config as Record<string, unknown>).overtimeThresholdPercent as number) ?? 0
    : 0;

  const now = new Date();
  const counters: Array<{
    employeeId: string;
    counterType: 'SATURDAY_WORKED' | 'WEEKEND_TOTAL' | 'HOLIDAY_WORKED' | 'OVERTIME_HOURS';
    count: number;
  }> = [];

  for (const employee of employees) {
    const employeeShifts = shifts.filter((s) => s.employeeId === employee.id);

    let saturdayCount = 0;
    let weekendCount = 0;
    let holidayCount = 0;
    let totalShiftMinutes = 0;

    for (const shift of employeeShifts) {
      const shiftDate = new Date(shift.date);
      const dayOfWeek = shiftDate.getDay();

      if (dayOfWeek === 6) { saturdayCount++; weekendCount++; }
      else if (dayOfWeek === 0) { weekendCount++; }

      const dateKey = shiftDate.toISOString().split('T')[0];
      if (closedDaySet.has(dateKey)) { holidayCount++; }

      totalShiftMinutes += calculateShiftMinutes(shift.startTime, shift.endTime);
    }

    const daysInMonthCount = new Date(year, month, 0).getDate();
    const weeksInMonthCount = daysInMonthCount / 7;
    const contractLimitMinutes = employee.contractHours * 60 * weeksInMonthCount;
    const adjustedLimitMinutes = contractLimitMinutes * (1 + overtimeThresholdPercent / 100);
    const overtimeMinutes = Math.max(0, Math.round(totalShiftMinutes - adjustedLimitMinutes));

    counters.push(
      { employeeId: employee.id, counterType: 'SATURDAY_WORKED', count: saturdayCount },
      { employeeId: employee.id, counterType: 'WEEKEND_TOTAL', count: weekendCount },
      { employeeId: employee.id, counterType: 'HOLIDAY_WORKED', count: holidayCount },
      { employeeId: employee.id, counterType: 'OVERTIME_HOURS', count: overtimeMinutes },
    );
  }

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

export const equityNightlyRecalcTask = schedules.task({
  id: 'equity-nightly-recalc',
  cron: {
    pattern: '0 2 * * *',
    timezone: 'Europe/Paris',
  },
  run: async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    logger.info('Starting nightly equity counter recalculation', {
      period: `${year}-${String(month).padStart(2, '0')}`,
    });

    const clinics = await getPrisma().clinic.findMany({
      select: { id: true, name: true },
    });

    let totalCounters = 0;
    for (const clinic of clinics) {
      try {
        const count = await recalculateForClinic(clinic.id, year, month);
        totalCounters += count;
      } catch (error) {
        logger.error(`Failed for clinic "${clinic.name}"`, { clinicId: clinic.id, error: String(error) });
      }
    }

    logger.info('Nightly recalculation complete', { totalCounters, clinics: clinics.length });
    return { totalCounters };
  },
});

export const equityMonthlyFinalTask = schedules.task({
  id: 'equity-monthly-final',
  cron: {
    pattern: '0 3 1 * *',
    timezone: 'Europe/Paris',
  },
  run: async () => {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth(); // 0-based → previous month (1-based)

    if (month === 0) {
      month = 12;
      year -= 1;
    }

    logger.info('Starting monthly finalization', {
      period: `${year}-${String(month).padStart(2, '0')}`,
    });

    const clinics = await getPrisma().clinic.findMany({
      select: { id: true, name: true },
    });

    let totalCounters = 0;
    for (const clinic of clinics) {
      try {
        const count = await recalculateForClinic(clinic.id, year, month);
        totalCounters += count;
      } catch (error) {
        logger.error(`Failed for clinic "${clinic.name}"`, { clinicId: clinic.id, error: String(error) });
      }
    }

    logger.info('Monthly finalization complete', { totalCounters, clinics: clinics.length });
    return { totalCounters };
  },
});
