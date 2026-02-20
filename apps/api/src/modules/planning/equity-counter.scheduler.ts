import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EquityCounterService } from './equity-counter.service';

@Injectable()
export class EquityCounterScheduler {
  private readonly logger = new Logger(EquityCounterScheduler.name);

  constructor(
    private readonly equityCounterService: EquityCounterService,
  ) {}

  /**
   * Nightly recalculation at 2:00 AM Paris time.
   * Self-heals any drift from direct DB changes or missed events.
   */
  @Cron('0 0 2 * * *', { timeZone: 'Europe/Paris' })
  async handleNightlyRecalculation(): Promise<void> {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      this.logger.log(
        `Starting nightly equity counter recalculation for ${year}-${String(month).padStart(2, '0')}`,
      );

      await this.equityCounterService.recalculateAllClinics(year, month);

      this.logger.log('Nightly equity counter recalculation completed');
    } catch (error) {
      this.logger.error(
        `Nightly equity counter recalculation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Monthly finalization on the 1st of each month at 3:00 AM Paris time.
   * Recalculates the previous month for final accuracy.
   */
  @Cron('0 0 3 1 * *', { timeZone: 'Europe/Paris' })
  async handleMonthlyFinalization(): Promise<void> {
    try {
      const now = new Date();
      // Calculate previous month (handles year boundary)
      let year = now.getFullYear();
      let month = now.getMonth(); // getMonth() is 0-based, so this gives previous month (1-based)

      if (month === 0) {
        month = 12;
        year -= 1;
      }

      this.logger.log(
        `Starting monthly finalization for ${year}-${String(month).padStart(2, '0')}`,
      );

      await this.equityCounterService.recalculateAllClinics(year, month);

      this.logger.log('Monthly finalization completed');
    } catch (error) {
      this.logger.error(
        `Monthly finalization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
