// WARNING: Business logic duplicated from SchedulerService (scheduler.service.ts) + EmployeeService.
// Any changes to school reminder logic MUST be applied in both places.
// TODO: Extract shared pure functions to eliminate duplication (Phase 2).
import { schedules, logger } from '@trigger.dev/sdk';
import { getPrisma } from '../lib/prisma';
import { sendEmailTask } from './send-email';

function getNextMonth(): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parseInt(parts.find((p) => p.type === 'year')!.value);
  const month = parseInt(parts.find((p) => p.type === 'month')!.value);

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

export const schoolReminderTask = schedules.task({
  id: 'school-reminder',
  cron: {
    pattern: '0 9 25 * *',
    timezone: 'Europe/Paris',
  },
  run: async () => {
    const nextMonth = getNextMonth();
    logger.info('Running school days reminder', { month: nextMonth });

    // Get active clinic IDs
    const activeSubscriptions = await getPrisma().subscription.findMany({
      where: { status: { in: ['active', 'trialing'] } },
      select: { clinicId: true },
    });

    const clinicIds = activeSubscriptions.map((s) => s.clinicId);
    if (clinicIds.length === 0) {
      logger.info('No active clinics found');
      return { processed: 0 };
    }

    // Find apprentices without school day declarations
    const [year, m] = nextMonth.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, m - 1, 1));
    const monthEnd = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));

    const apprentices = await getPrisma().employee.findMany({
      where: {
        clinicId: { in: clinicIds },
        jobType: 'APPRENTICE',
        isActive: true,
        email: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        unavailabilities: {
          where: {
            type: 'SCHOOL',
            startDate: { gte: monthStart },
            endDate: { lte: monthEnd },
          },
          select: { id: true },
        },
      },
    });

    const undeclared = apprentices.filter((a) => a.unavailabilities.length === 0);

    const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3000';
    const dashboardUrl = `${webAppUrl}/dashboard/school-days`;

    // Trigger send-email task for each apprentice
    for (const apprentice of undeclared) {
      await sendEmailTask.trigger({
        type: 'school-reminder',
        to: apprentice.email!,
        data: {
          name: `${apprentice.firstName} ${apprentice.lastName}`,
          month: nextMonth,
          dashboardUrl,
        },
      });
    }

    logger.info('School reminder complete', { processed: undeclared.length });
    return { processed: undeclared.length };
  },
});
