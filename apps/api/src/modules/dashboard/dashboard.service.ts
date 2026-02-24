import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(clinicId: string) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    const [
      activeEmployees,
      employeesByJobType,
      pendingAbsences,
      pendingVariances,
      monthShifts,
      undeclaredApprenticeCount,
    ] = await Promise.all([
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
        select: { startTime: true, endTime: true, breakMinutes: true },
      }),
      this.prisma.employee.count({
        where: {
          clinicId,
          isActive: true,
          jobType: 'APPRENTICE',
          NOT: {
            unavailabilities: {
              some: {
                type: 'SCHOOL',
                startDate: { lte: monthEnd },
                endDate: { gte: monthStart },
              },
            },
          },
        },
      }),
    ]);

    let totalPlannedMinutes = 0;
    for (const shift of monthShifts) {
      const [startH, startM] = shift.startTime.split(':').map(Number);
      const [endH, endM] = shift.endTime.split(':').map(Number);
      const grossMinutes = (endH * 60 + endM) - (startH * 60 + startM);
      totalPlannedMinutes += grossMinutes - shift.breakMinutes;
    }

    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

    const jobTypeBreakdown: Record<string, number> = {};
    for (const group of employeesByJobType) {
      jobTypeBreakdown[group.jobType] = group._count.id;
    }

    return {
      activeEmployees,
      jobTypeBreakdown,
      pendingRequests: pendingAbsences + pendingVariances,
      pendingAbsences,
      pendingVariances,
      monthlyPlannedHours: Math.round(totalPlannedMinutes / 60),
      totalShifts: monthShifts.length,
      weekNumber,
      undeclaredApprenticeCount,
      monthLabel: `${year}-${String(month + 1).padStart(2, '0')}`,
    };
  }
}
