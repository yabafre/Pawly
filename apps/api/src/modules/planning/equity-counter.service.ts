import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClinicService } from '@/modules/clinic/clinic.service';
import type { EquityCounterType } from '@prisma/client';
import {
  computeEquityCounters,
  utcDateKey,
  utcMonthBounds,
} from './equity-counting';

export interface CounterWithEmployee {
  id: string;
  counterType: EquityCounterType;
  count: number;
  year: number;
  month: number;
  lastCalculatedAt: Date | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    color: string;
    jobType: string;
    contractHours: number;
  };
}

export interface QuarterlySummaryRow {
  employeeId: string;
  counterType: EquityCounterType;
  _sum: { count: number | null };
}

@Injectable()
export class EquityCounterService {
  private readonly logger = new Logger(EquityCounterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicService: ClinicService,
  ) {}

  /**
   * Get equity counters for a period with employee data.
   * Supports multi-month queries (e.g., pass [1,2,3] for Q1).
   */
  async getCountersForPeriod(
    clinicId: string,
    year: number,
    months: number[],
    counterTypes?: EquityCounterType[],
  ): Promise<CounterWithEmployee[]> {
    return this.prisma.equityCounter.findMany({
      where: {
        clinicId,
        year,
        month: { in: months },
        ...(counterTypes?.length ? { counterType: { in: counterTypes } } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            color: true,
            jobType: true,
            contractHours: true,
          },
        },
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { counterType: 'asc' }],
    });
  }

  /**
   * Get equity counters over a rolling window of `windowMonths` calendar months
   * ending at the month immediately BEFORE (year, month) — i.e. the range
   * [(year,month) − windowMonths … (year,month) − 1]. Unlike getCountersForPeriod
   * (single `year`), this window crosses the year boundary, so a January target
   * still sees December (and the rest) of the previous year. Story 11-7 — used by
   * the generator so equity never resets on 1 January and reflects a true
   * 12-month history. The target month itself is excluded (callers score against
   * prior load only — "exclude current month to avoid circular scoring").
   */
  async getCountersForWindow(
    clinicId: string,
    year: number,
    month: number,
    windowMonths = 12,
    counterTypes?: EquityCounterType[],
  ): Promise<CounterWithEmployee[]> {
    // A non-positive window has no prior months to load. Return early rather than
    // issue a findMany with an empty `OR: []`, whose Prisma match semantics are
    // ambiguous (Story 11-7 review hardening). Not reachable via the generator
    // (it passes the constant EQUITY_WINDOW_MONTHS = 12), but keeps the method
    // safe if ever called with a variable window.
    if (windowMonths <= 0) return [];
    // Absolute 0-based month index of the target; the preceding month is endAbs-1.
    const endAbs = year * 12 + (month - 1);
    const pairs: { year: number; month: number }[] = [];
    for (let i = 1; i <= windowMonths; i++) {
      const abs = endAbs - i; // endAbs-1 (prev month) … endAbs-windowMonths
      pairs.push({ year: Math.floor(abs / 12), month: (abs % 12) + 1 });
    }

    return this.prisma.equityCounter.findMany({
      where: {
        clinicId,
        OR: pairs.map((p) => ({ year: p.year, month: p.month })),
        ...(counterTypes?.length ? { counterType: { in: counterTypes } } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            color: true,
            jobType: true,
            contractHours: true,
          },
        },
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { counterType: 'asc' }],
    });
  }

  /**
   * Get quarterly summary using database-level aggregation.
   */
  async getQuarterlySummary(
    clinicId: string,
    year: number,
    quarter: number,
  ): Promise<QuarterlySummaryRow[]> {
    const startMonth = (quarter - 1) * 3 + 1;
    const months = [startMonth, startMonth + 1, startMonth + 2];

    const result = await this.prisma.equityCounter.groupBy({
      by: ['employeeId', 'counterType'],
      where: {
        clinicId,
        year,
        month: { in: months },
      },
      _sum: { count: true },
    });

    return result as QuarterlySummaryRow[];
  }

  /**
   * Full recalculation of all counters for a clinic/period from source-of-truth.
   * Bounds and counting are UTC and shared with the equity-recalc Trigger task via
   * equity-counting.ts (Story 13-7). Uses a Prisma transaction for atomic batch upsert.
   */
  async recalculateForPeriod(
    clinicId: string,
    year: number,
    month: number,
  ): Promise<{ countersUpdated: number }> {
    const { periodStart, periodEnd } = utcMonthBounds(year, month);

    // Fetch all active employees for this clinic
    const employees = await this.prisma.employee.findMany({
      where: { clinicId, isActive: true },
      select: { id: true, contractHours: true },
    });

    // Fetch all shifts for this clinic+period
    const shifts = await this.prisma.shift.findMany({
      where: {
        clinicId,
        date: { gte: periodStart, lte: periodEnd },
      },
      select: {
        employeeId: true,
        date: true,
        startTime: true,
        endTime: true,
      },
    });

    // Fetch clinic closed days for holiday detection
    const closedDays = await this.prisma.clinicClosedDay.findMany({
      where: {
        clinicId,
        date: { gte: periodStart, lte: periodEnd },
      },
      select: { date: true },
    });

    const closedDayKeys = new Set(closedDays.map((cd) => utcDateKey(cd.date)));

    // Fetch CONTRACT_COMPLIANCE rule for overtime threshold
    const contractRule = await this.prisma.planningRule.findFirst({
      where: {
        clinicId,
        category: 'CONTRACT_COMPLIANCE',
        isActive: true,
      },
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

    // Batch upsert in a transaction
    const result = await this.prisma.$transaction(
      counters.map((c) =>
        this.prisma.equityCounter.upsert({
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

    this.logger.log(
      `Recalculated ${result.length} equity counters for clinic ${clinicId} (${year}-${String(month).padStart(2, '0')})`,
    );

    return { countersUpdated: result.length };
  }

  /**
   * Recalculate counters for all clinics (used by nightly cron).
   * Continues processing other clinics on individual failure.
   */
  async recalculateAllClinics(year: number, month: number): Promise<void> {
    const clinics = await this.clinicService.listAllClinicIds();

    for (const clinic of clinics) {
      try {
        await this.recalculateForPeriod(clinic.id, year, month);
      } catch (error) {
        this.logger.error(
          `Failed to recalculate equity counters for clinic "${clinic.name}" (${clinic.id}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
