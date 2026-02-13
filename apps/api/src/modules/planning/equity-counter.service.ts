import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClinicService } from '@/modules/clinic/clinic.service';
import type { EquityCounterType } from '@prisma/client';

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
   * Uses a Prisma transaction for atomic batch upsert.
   */
  async recalculateForPeriod(
    clinicId: string,
    year: number,
    month: number,
  ): Promise<{ countersUpdated: number }> {
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

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

    const closedDaySet = new Set(
      closedDays.map((cd) => cd.date.toISOString().split('T')[0]),
    );

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
      ? ((contractRule.config as Record<string, unknown>)
          .overtimeThresholdPercent as number) ?? 0
      : 0;

    // Calculate counters per employee
    const now = new Date();
    const counters: {
      employeeId: string;
      counterType: EquityCounterType;
      count: number;
    }[] = [];

    for (const employee of employees) {
      const employeeShifts = shifts.filter(
        (s) => s.employeeId === employee.id,
      );

      let saturdayCount = 0;
      let weekendCount = 0;
      let holidayCount = 0;
      let totalShiftMinutes = 0;

      for (const shift of employeeShifts) {
        const shiftDate = new Date(shift.date);
        const dayOfWeek = shiftDate.getDay(); // 0=Sunday, 6=Saturday

        if (dayOfWeek === 6) {
          saturdayCount++;
          weekendCount++;
        } else if (dayOfWeek === 0) {
          weekendCount++;
        }

        // Holiday detection: check if shift date is a closed day
        const dateKey = shiftDate.toISOString().split('T')[0];
        if (closedDaySet.has(dateKey)) {
          holidayCount++;
        }

        // Calculate shift duration in minutes
        totalShiftMinutes += this.calculateShiftMinutes(
          shift.startTime,
          shift.endTime,
        );
      }

      // Calculate overtime: excess minutes beyond adjusted contract limit
      const WEEKS_PER_MONTH = 4.33;
      const contractLimitMinutes =
        employee.contractHours * 60 * WEEKS_PER_MONTH;
      const adjustedLimitMinutes =
        contractLimitMinutes * (1 + overtimeThresholdPercent / 100);
      const overtimeMinutes = Math.max(
        0,
        Math.round(totalShiftMinutes - adjustedLimitMinutes),
      );

      counters.push(
        { employeeId: employee.id, counterType: 'SATURDAY_WORKED', count: saturdayCount },
        { employeeId: employee.id, counterType: 'WEEKEND_TOTAL', count: weekendCount },
        { employeeId: employee.id, counterType: 'HOLIDAY_WORKED', count: holidayCount },
        { employeeId: employee.id, counterType: 'OVERTIME_HOURS', count: overtimeMinutes },
      );
    }

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

  /**
   * Calculate shift duration in minutes from HH:mm time strings.
   */
  private calculateShiftMinutes(startTime: string, endTime: string): number {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    // Handle overnight shifts
    return endMinutes >= startMinutes
      ? endMinutes - startMinutes
      : 1440 - startMinutes + endMinutes;
  }
}
