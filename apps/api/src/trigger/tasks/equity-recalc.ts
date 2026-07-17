import { schedules, logger } from '@trigger.dev/sdk';
import { getPrisma } from '../lib/prisma';
import {
  computeEquityCounters,
  utcDateKey,
  utcMonthBounds,
} from '../../modules/planning/equity-counting';

async function recalculateForClinic(
  clinicId: string,
  year: number,
  month: number,
): Promise<number> {
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
        logger.error(`Failed for clinic "${clinic.name}"`, {
          clinicId: clinic.id,
          error: String(error),
        });
      }
    }

    logger.info('Nightly recalculation complete', {
      totalCounters,
      clinics: clinics.length,
    });
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
        logger.error(`Failed for clinic "${clinic.name}"`, {
          clinicId: clinic.id,
          error: String(error),
        });
      }
    }

    logger.info('Monthly finalization complete', {
      totalCounters,
      clinics: clinics.length,
    });
    return { totalCounters };
  },
});
