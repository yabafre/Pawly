import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type {
  EmployeeScheduleData,
  EmployeeShift,
  EmployeeUnavailability,
  EmployeeWeeklySummary,
  EmployeeShiftTypeInfo,
} from '@pawly/types';

function formatDateYMD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function eachDayOfInterval(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    days.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getISOWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

@Injectable()
export class EmployeeScheduleService {
  private readonly logger = new Logger(EmployeeScheduleService.name);
  private static readonly MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

  constructor(private readonly prisma: PrismaService) {}

  async getEmployeeSchedule(
    clinicId: string,
    employeeId: string,
    month?: string,
  ): Promise<EmployeeScheduleData> {
    const now = new Date();
    const resolvedMonth =
      month ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (!EmployeeScheduleService.MONTH_REGEX.test(resolvedMonth)) {
      throw new BadRequestException(
        `Invalid month format: ${resolvedMonth}. Expected YYYY-MM`,
      );
    }

    const [year, monthNum] = resolvedMonth.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(
      Date.UTC(year, monthNum, 0, 23, 59, 59, 999),
    );

    const [employee, shifts, unavailabilities, periodStatus, shiftTypes] =
      await Promise.all([
        this.prisma.employee.findUniqueOrThrow({
          where: { id: employeeId, clinicId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jobType: true,
            contractHours: true,
            color: true,
          },
        }),
        this.prisma.shift.findMany({
          where: {
            clinicId,
            employeeId,
            date: { gte: monthStart, lte: monthEnd },
          },
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        }),
        this.prisma.unavailability.findMany({
          where: {
            clinicId,
            employeeId,
            startDate: { lte: monthEnd },
            endDate: { gte: monthStart },
          },
        }),
        this.prisma.planningPeriodStatus.findUnique({
          where: {
            clinicId_month: { clinicId, month: resolvedMonth },
          },
        }),
        this.prisma.clinicShiftType.findMany({
          where: { clinicId },
        }),
      ]);

    const mappedShifts: EmployeeShift[] = shifts.map((s) => ({
      id: s.id,
      date: formatDateYMD(s.date),
      startTime: s.startTime,
      endTime: s.endTime,
      shiftTypeCode: s.shiftTypeCode,
      breakMinutes: s.breakMinutes,
      isConfirmed: s.isConfirmed,
      source: s.source as 'GENERATED' | 'MANUAL',
    }));

    const expandedUnavailabilities = this.expandUnavailabilities(
      unavailabilities,
      monthStart,
      monthEnd,
    );

    const mappedShiftTypes: EmployeeShiftTypeInfo[] = shiftTypes.map(
      (st) => ({
        code: st.code,
        label: st.name,
        color: st.color,
        breakMinutes: st.breakMinutes,
      }),
    );

    const weeklySummary = this.computeWeeklySummary(
      mappedShifts,
      employee.contractHours,
    );

    return {
      month: resolvedMonth,
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        jobType: employee.jobType,
        contractHours: employee.contractHours,
        color: employee.color,
      },
      shifts: mappedShifts,
      unavailabilities: expandedUnavailabilities,
      publicationStatus: {
        status: periodStatus?.status ?? 'DRAFT',
        publishedAt: periodStatus?.publishedAt?.toISOString() ?? null,
      },
      weeklySummary,
      shiftTypes: mappedShiftTypes,
    };
  }

  async getEmployeeShiftTypes(
    clinicId: string,
  ): Promise<EmployeeShiftTypeInfo[]> {
    const shiftTypes = await this.prisma.clinicShiftType.findMany({
      where: { clinicId },
    });

    return shiftTypes.map((st) => ({
      code: st.code,
      label: st.name,
      color: st.color,
      breakMinutes: st.breakMinutes,
    }));
  }

  private expandUnavailabilities(
    unavailabilities: Array<{
      type: string;
      startDate: Date;
      endDate: Date;
      reason: string | null;
      daysOfWeek: number[];
    }>,
    monthStart: Date,
    monthEnd: Date,
  ): EmployeeUnavailability[] {
    const result: EmployeeUnavailability[] = [];

    for (const ua of unavailabilities) {
      const rangeStart =
        ua.startDate > monthStart ? ua.startDate : monthStart;
      const rangeEnd = ua.endDate < monthEnd ? ua.endDate : monthEnd;

      const days = eachDayOfInterval(rangeStart, rangeEnd);

      for (const day of days) {
        const isoDayOfWeek = day.getUTCDay() === 0 ? 7 : day.getUTCDay();

        if (
          ua.daysOfWeek.length === 0 ||
          ua.daysOfWeek.includes(isoDayOfWeek)
        ) {
          result.push({
            date: formatDateYMD(day),
            type: ua.type as EmployeeUnavailability['type'],
            reason: ua.reason ?? undefined,
          });
        }
      }
    }

    return result;
  }

  private computeWeeklySummary(
    shifts: EmployeeShift[],
    contractHours: number,
  ): EmployeeWeeklySummary[] {
    const weekMap = new Map<
      string,
      { weekNumber: number; totalMinutes: number; shiftCount: number }
    >();

    for (const shift of shifts) {
      const shiftDate = new Date(shift.date);
      const weekNumber = getISOWeekNumber(shiftDate);
      const weekYear = getISOWeekYear(shiftDate);
      const weekKey = `${weekYear}-W${weekNumber}`;

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, { weekNumber, totalMinutes: 0, shiftCount: 0 });
      }
      const week = weekMap.get(weekKey)!;

      const [startH, startM] = shift.startTime.split(':').map(Number);
      const [endH, endM] = shift.endTime.split(':').map(Number);
      let shiftMinutes = endH * 60 + endM - (startH * 60 + startM);
      if (shiftMinutes < 0) shiftMinutes += 1440; // midnight overflow

      week.totalMinutes += shiftMinutes;
      week.shiftCount += 1;
    }

    const contractMinutes = contractHours * 60;

    return Array.from(weekMap.values())
      .sort((a, b) => a.weekNumber - b.weekNumber)
      .map((data) => ({
        weekNumber: data.weekNumber,
        totalMinutes: data.totalMinutes,
        shiftCount: data.shiftCount,
        contractMinutes,
      }));
  }
}
