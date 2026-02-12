import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/prisma/prisma.service';
import { EmployeeService } from '@/modules/employee/employee.service';
import { MailService } from '@/modules/mail/mail.service';

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
    this.logger.log('Running school days reminder cron job');

    const nextMonth = this.getNextMonth();

    // Find all clinics with active subscriptions
    const activeSubscriptions = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['active', 'trialing'] },
      },
      select: { clinicId: true },
    });

    for (const sub of activeSubscriptions) {
      try {
        const undeclared = await this.employeeService.listUndeclaredApprentices(
          sub.clinicId,
          nextMonth,
        );

        for (const apprentice of undeclared) {
          if (!apprentice.email) continue;

          await this.mailService.sendSchoolDaysReminder(
            apprentice.email,
            `${apprentice.firstName} ${apprentice.lastName}`,
            nextMonth,
          );

          this.logger.log(
            `Sent school days reminder to ${apprentice.email} for ${nextMonth}`,
          );
        }
      } catch (err) {
        this.logger.error(
          `Error processing reminders for clinic ${sub.clinicId}`,
          err,
        );
      }
    }

    this.logger.log('School days reminder cron job completed');
  }

  private getNextMonth(): string {
    const now = new Date();
    const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const month = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
    return `${year}-${String(month).padStart(2, '0')}`;
  }
}
