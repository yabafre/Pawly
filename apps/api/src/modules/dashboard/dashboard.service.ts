import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { DashboardStats, TodayEmployee } from '@pawly/types';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(clinicId: string): Promise<DashboardStats> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

    // Today boundaries for "who's working today"
    const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
    const todayEnd = new Date(`${todayStr}T23:59:59.999Z`);

    const [
      clinic,
      activeEmployees,
      employeesByJobType,
      pendingAbsences,
      pendingVariances,
      monthShifts,
      totalApprentices,
      apprenticesWithSchool,
      noSchoolDeclarations,
      todayShifts,
      template,
    ] = await Promise.all([
      this.prisma.clinic.findUniqueOrThrow({
        where: { id: clinicId },
        select: { name: true },
      }),
      this.prisma.employee.count({
        where: { clinicId, isActive: true },
      }),
      this.prisma.employee.groupBy({
        by: ['jobType'],
        where: { clinicId, isActive: true },
        _count: { id: true },
      }),
      this.prisma.absence.count({
        where: { clinicId, status: 'PENDING' },
      }),
      this.prisma.varianceEvent.count({
        where: { clinicId, status: 'PENDING' },
      }),
      this.prisma.shift.findMany({
        where: { clinicId, date: { gte: monthStart, lte: monthEnd } },
        select: { startTime: true, endTime: true, breakMinutes: true, shiftTypeCode: true, date: true, planningTemplateId: true },
      }),
      this.prisma.employee.count({
        where: { clinicId, isActive: true, contractType: 'APPRENTICESHIP' },
      }),
      this.prisma.employee.count({
        where: {
          clinicId,
          isActive: true,
          contractType: 'APPRENTICESHIP',
          unavailabilities: {
            some: {
              type: 'SCHOOL',
              startDate: { lte: monthEnd },
              endDate: { gte: monthStart },
            },
          },
        },
      }),
      this.prisma.apprenticeMonthDeclaration.count({
        where: { clinicId, month: monthStr, status: 'NO_SCHOOL_THIS_MONTH' },
      }),
      this.prisma.shift.findMany({
        where: { clinicId, date: { gte: todayStart, lte: todayEnd } },
        select: {
          startTime: true,
          endTime: true,
          employee: {
            select: { id: true, firstName: true, lastName: true, jobType: true },
          },
        },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.planningTemplate.findFirst({
        where: { clinicId },
        select: { id: true, data: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const undeclaredApprenticeCount = Math.max(
      0,
      totalApprentices - apprenticesWithSchool - noSchoolDeclarations,
    );

    let totalPlannedMinutes = 0;
    for (const shift of monthShifts) {
      const [startH, startM] = shift.startTime.split(':').map(Number);
      const [endH, endM] = shift.endTime.split(':').map(Number);
      const grossMinutes = (endH * 60 + endM) - (startH * 60 + startM);
      totalPlannedMinutes += grossMinutes;
    }

    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

    const jobTypeBreakdown: Record<string, number> = {};
    for (const group of employeesByJobType) {
      jobTypeBreakdown[group.jobType] = group._count.id;
    }

    // Coverage: use template linked to generated shifts, fallback to most recent
    const usedTemplateId = monthShifts.find((s) => s.planningTemplateId)?.planningTemplateId;
    let coverageTemplate = template;
    if (usedTemplateId && template && usedTemplateId !== template.id) {
      const linked = await this.prisma.planningTemplate.findUnique({
        where: { id: usedTemplateId },
        select: { id: true, data: true },
      });
      if (linked) coverageTemplate = linked;
    }
    const coveragePercent = this.computeCoverage(coverageTemplate?.data, monthShifts);

    // Today's employees (deduplicate by employee id, keep earliest shift)
    const seenEmployees = new Map<string, TodayEmployee>();
    for (const shift of todayShifts) {
      if (!seenEmployees.has(shift.employee.id)) {
        seenEmployees.set(shift.employee.id, {
          id: shift.employee.id,
          firstName: shift.employee.firstName,
          lastName: shift.employee.lastName,
          jobType: shift.employee.jobType,
          startTime: shift.startTime,
          endTime: shift.endTime,
        });
      }
    }

    return {
      clinicName: clinic.name,
      activeEmployees,
      jobTypeBreakdown,
      pendingRequests: pendingAbsences + pendingVariances,
      pendingAbsences,
      pendingVariances,
      monthlyPlannedHours: Math.round(totalPlannedMinutes / 60),
      totalShifts: monthShifts.length,
      weekNumber,
      undeclaredApprenticeCount,
      monthLabel: monthStr,
      coveragePercent,
      todayEmployees: Array.from(seenEmployees.values()),
    };
  }

  private computeCoverage(
    templateData: unknown,
    monthShifts: Array<{ date: Date; shiftTypeCode: string }>,
  ): number | null {
    if (!templateData || typeof templateData !== 'object') return null;

    // Prisma returns JSON as-is; TemplateData shape: { days: [{ dayOfWeek, slots: [{ requiredStaff }] }] }
    const data = templateData as { days?: Array<{ dayOfWeek: number; slots?: Array<{ shiftTypeCode: string; requiredStaff: number }> }> };
    if (!data.days || !Array.isArray(data.days) || data.days.length === 0) return null;

    // Build a map of dayOfWeek → total required staff
    const requiredByDow = new Map<number, number>();
    for (const day of data.days) {
      let total = 0;
      for (const slot of day.slots ?? []) {
        total += slot.requiredStaff ?? 0;
      }
      if (total > 0) {
        requiredByDow.set(day.dayOfWeek, total);
      }
    }

    if (requiredByDow.size === 0) return null;

    // Count total required slots and filled slots for the month
    let totalRequired = 0;
    const shiftsByDate = new Map<string, number>();
    for (const shift of monthShifts) {
      const dateStr = shift.date.toISOString().split('T')[0];
      shiftsByDate.set(dateStr, (shiftsByDate.get(dateStr) ?? 0) + 1);
    }

    // Iterate through each day of the month
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let totalFilled = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(Date.UTC(year, month, d));
      // JS getUTCDay: 0=Sun → convert to ISO: 1=Mon..7=Sun
      const isoDow = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
      const required = requiredByDow.get(isoDow);
      if (required) {
        totalRequired += required;
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const filled = shiftsByDate.get(dateStr) ?? 0;
        totalFilled += Math.min(filled, required);
      }
    }

    if (totalRequired === 0) return null;
    return Math.round((totalFilled / totalRequired) * 100);
  }
}
