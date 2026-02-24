import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { ListVarianceEventsInput, ExportVarianceInput } from '@pawly/validators';

@Injectable()
export class VarianceService {
  constructor(private readonly prisma: PrismaService) {}

  async listVarianceEvents(clinicId: string, filters: ListVarianceEventsInput) {
    const where: Record<string, unknown> = { clinicId };

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.type) {
      where.type = filters.type;
    }
    if (filters.employeeId) {
      where.shift = { employeeId: filters.employeeId };
    }
    if (filters.month) {
      const [year, month] = filters.month.split('-').map(Number);
      const monthStart = new Date(Date.UTC(year, month - 1, 1));
      const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      where.plannedTime = { gte: monthStart, lte: monthEnd };
    }

    return this.prisma.varianceEvent.findMany({
      where,
      include: {
        shift: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                jobType: true,
              },
            },
          },
        },
      },
      orderBy: { plannedTime: 'desc' },
    });
  }

  async reviewVariance(
    clinicId: string,
    userId: string,
    varianceId: string,
    action: 'approve' | 'reject',
    exceptionNote?: string,
  ) {
    // Fast-fail: check existence and ownership
    const variance = await this.prisma.varianceEvent.findFirst({
      where: { id: varianceId, clinicId },
    });

    if (!variance) {
      throw new NotFoundException(`Variance event ${varianceId} not found`);
    }

    if (variance.status !== 'PENDING') {
      throw new ConflictException('Variance event already reviewed');
    }

    // Atomic compare-and-swap: UPDATE only if still PENDING (race-safe)
    const result = await this.prisma.varianceEvent.updateMany({
      where: { id: varianceId, clinicId, status: 'PENDING' },
      data: {
        status: action === 'approve' ? 'APPROVED' : 'REJECTED',
        reviewedBy: userId,
        reviewedAt: new Date(),
        exceptionNote: action === 'reject' ? (exceptionNote || null) : null,
      },
    });

    if (result.count === 0) {
      throw new ConflictException('Variance event already reviewed');
    }

    return this.prisma.varianceEvent.findFirstOrThrow({
      where: { id: varianceId },
    });
  }

  async getVarianceStats(clinicId: string, month?: string) {
    const now = new Date();
    const [year, monthNum] = month
      ? month.split('-').map(Number)
      : [now.getFullYear(), now.getMonth() + 1];
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));
    const where = { clinicId, plannedTime: { gte: monthStart, lte: monthEnd } };

    const [countByType, countByStatus, totals] = await Promise.all([
      this.prisma.varianceEvent.groupBy({
        by: ['type'],
        where,
        _count: { id: true },
        _avg: { deltaMinutes: true },
      }),
      this.prisma.varianceEvent.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.varianceEvent.aggregate({
        where,
        _count: { id: true },
        _sum: { deltaMinutes: true },
        _avg: { deltaMinutes: true },
      }),
    ]);

    return { countByType, countByStatus, totals };
  }

  async countPendingVarianceEvents(clinicId: string) {
    return this.prisma.varianceEvent.count({
      where: { clinicId, status: 'PENDING' },
    });
  }

  async exportVarianceCsv(clinicId: string, filters: ExportVarianceInput) {
    const [year, month] = filters.month.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const where: Record<string, unknown> = {
      clinicId,
      plannedTime: { gte: monthStart, lte: monthEnd },
    };
    if (filters.employeeId) {
      where.shift = { employeeId: filters.employeeId };
    }

    const events = await this.prisma.varianceEvent.findMany({
      where,
      include: {
        shift: {
          include: {
            employee: {
              select: {
                firstName: true,
                lastName: true,
                jobType: true,
              },
            },
          },
        },
      },
      orderBy: { plannedTime: 'asc' },
    });

    const escCsv = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const header =
      'Employé,Poste,Date,Type de shift,Type d\'écart,Heure planifiée,Heure réelle,Écart (min),Statut,Note';

    const typeLabels: Record<string, string> = {
      CLOCK_IN_DEVIATION: 'Retard arrivée',
      CLOCK_OUT_DEVIATION: 'Écart départ',
      NO_SHOW: 'Absence non confirmée',
      EARLY_DEPARTURE: 'Départ anticipé',
    };

    const statusLabels: Record<string, string> = {
      PENDING: 'En attente',
      APPROVED: 'Approuvé',
      REJECTED: 'Rejeté',
    };

    const rows = events.map((e) => {
      const emp = e.shift.employee;
      const name = `${emp.lastName} ${emp.firstName}`;
      const date = e.plannedTime.toISOString().split('T')[0];
      const planned = e.plannedTime.toISOString().slice(11, 16);
      const actual = e.actualTime.toISOString().slice(11, 16);
      return [
        name,
        emp.jobType,
        date,
        e.shift.shiftTypeCode,
        typeLabels[e.type] || e.type,
        planned,
        actual,
        String(e.deltaMinutes),
        statusLabels[e.status] || e.status,
        e.exceptionNote || '',
      ]
        .map(escCsv)
        .join(',');
    });

    return [header, ...rows].join('\n');
  }
}
