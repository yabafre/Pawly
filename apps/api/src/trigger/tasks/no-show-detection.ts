// WARNING: Business logic duplicated from PresenceConfirmationService (presence-confirmation.service.ts).
// Any changes to no-show detection rules MUST be applied in both places.
// TODO: Extract shared pure functions to eliminate duplication (Phase 2).
import { schedules, logger } from '@trigger.dev/sdk';
import { getPrisma } from '../lib/prisma';

export const noShowDetectionTask = schedules.task({
  id: 'no-show-detection',
  cron: {
    pattern: '0 0 * * *',
    timezone: 'Europe/Paris',
  },
  run: async () => {
    // Compute yesterday in Paris local time
    const parisNow = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }),
    );
    const parisYesterday = new Date(parisNow);
    parisYesterday.setDate(parisYesterday.getDate() - 1);

    const year = parisYesterday.getFullYear();
    const month = parisYesterday.getMonth() + 1;
    const day = parisYesterday.getDate();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    logger.info('Starting no-show detection', { date: dateStr });

    // Find clinics with PUBLISHED periods for yesterday's month
    const publishedPeriods = await getPrisma().planningPeriodStatus.findMany({
      where: { month: monthStr, status: 'PUBLISHED' },
      select: { clinicId: true },
    });

    let totalNoShows = 0;

    for (const period of publishedPeriods) {
      const clinicId = period.clinicId;

      // Find unconfirmed shifts for yesterday
      const dayStart = new Date(Date.UTC(year, month - 1, day));
      const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

      const unconfirmedShifts = await getPrisma().shift.findMany({
        where: {
          clinicId,
          date: { gte: dayStart, lte: dayEnd },
          isConfirmed: false,
        },
        select: {
          id: true,
          startTime: true,
          clinicId: true,
          date: true,
          varianceEvents: { select: { id: true }, where: { type: 'NO_SHOW' } },
        },
      });

      // Filter shifts that already have a NO_SHOW event (idempotent)
      const shiftsToProcess = unconfirmedShifts.filter(
        (s) => s.varianceEvents.length === 0,
      );

      if (shiftsToProcess.length === 0) continue;

      const targetDate = new Date(Date.UTC(year, month - 1, day));

      await getPrisma().varianceEvent.createMany({
        data: shiftsToProcess.map((shift) => {
          const [h, m] = shift.startTime.split(':').map(Number);
          const plannedTime = new Date(
            Date.UTC(
              targetDate.getUTCFullYear(),
              targetDate.getUTCMonth(),
              targetDate.getUTCDate(),
              h, m, 0,
            ),
          );
          return {
            type: 'NO_SHOW' as const,
            plannedTime,
            actualTime: plannedTime,
            deltaMinutes: 0,
            shiftId: shift.id,
            clinicId,
            status: 'PENDING' as const,
          };
        }),
        skipDuplicates: true,
      });

      totalNoShows += shiftsToProcess.length;
    }

    logger.info('No-show detection complete', { totalNoShows, clinics: publishedPeriods.length });
    return { totalNoShows };
  },
});
