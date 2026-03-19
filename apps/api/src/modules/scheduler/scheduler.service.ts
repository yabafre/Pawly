import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/prisma/prisma.service';
import { EmployeeService } from '@/modules/employee/employee.service';
import { MailService } from '@/modules/mail/mail.service';
import type { MailLocale } from '@/modules/mail/mail-i18n';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeService: EmployeeService,
    private readonly mailService: MailService,
  ) {}

  @Cron('0 9 25 * *', {
    name: 'schoolDaysReminder',
    timeZone: 'Europe/Paris',
  })
  async handleSchoolDaysReminder() {
    if (process.env.TRIGGER_SECRET_KEY) {
      this.logger.log('Cron handled by Trigger.dev — skipping');
      return;
    }
    if (process.env.CRON_ENABLED === 'false') {
      this.logger.log('Cron disabled on this instance, skipping');
      return;
    }

    this.logger.log('Running school days reminder cron job');

    const nextMonth = this.getNextMonth();

    const activeSubscriptions = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['active', 'trialing'] },
      },
      select: { clinicId: true },
    });

    const clinicIds = activeSubscriptions.map((s) => s.clinicId);

    if (clinicIds.length === 0) {
      this.logger.log('No active clinics found, skipping');
      return;
    }

    const allUndeclared =
      await this.employeeService.listAllUndeclaredApprentices(
        clinicIds,
        nextMonth,
      );

    for (const apprentice of allUndeclared) {
      if (!apprentice.email) continue;

      try {
        const locale = ((apprentice as any).user?.locale as MailLocale) ?? 'fr';
        await this.mailService.sendSchoolDaysReminder(
          apprentice.email,
          `${apprentice.firstName} ${apprentice.lastName}`,
          nextMonth,
          locale,
        );
        this.logger.log(
          `Sent school days reminder to ${apprentice.email} for ${nextMonth}`,
        );
      } catch (err) {
        this.logger.error(
          `Error sending reminder to ${apprentice.email}`,
          err,
        );
      }
    }

    this.logger.log(
      `School days reminder cron job completed: ${allUndeclared.length} apprentices processed`,
    );
  }

  private getNextMonth(): string {
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
}
