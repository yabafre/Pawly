import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/prisma/prisma.service';
import { PresenceConfirmationService } from './presence-confirmation.service';

@Injectable()
export class PresenceConfirmationScheduler {
  private readonly logger = new Logger(PresenceConfirmationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceConfirmationService: PresenceConfirmationService,
  ) {}

  /**
   * Daily no-show detection at midnight Paris time.
   * Finds all unconfirmed shifts from yesterday and creates NO_SHOW VarianceEvents.
   */
  @Cron('0 0 0 * * *', { timeZone: 'Europe/Paris' })
  async handleNoShowDetection(): Promise<void> {
    try {
      // Compute yesterday in Paris local time (not UTC)
      // The cron fires at midnight Paris, but new Date() returns UTC
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

      this.logger.log(`Starting no-show detection for ${dateStr}`);

      // Find clinics with PUBLISHED periods for yesterday's month
      const publishedPeriods = await this.prisma.planningPeriodStatus.findMany({
        where: { month: monthStr, status: 'PUBLISHED' },
        select: { clinicId: true },
      });

      let totalNoShows = 0;

      for (const period of publishedPeriods) {
        const count = await this.presenceConfirmationService.detectNoShows(
          period.clinicId,
          dateStr,
        );
        totalNoShows += count;
      }

      this.logger.log(
        `No-show detection completed: ${totalNoShows} no-show(s) across ${publishedPeriods.length} clinic(s)`,
      );
    } catch (error) {
      this.logger.error(
        `No-show detection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
