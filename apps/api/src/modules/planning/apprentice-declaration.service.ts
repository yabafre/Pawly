import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { ApprenticeDeclarationRow } from '@pawly/validators';

@Injectable()
export class ApprenticeDeclarationService {
  private readonly logger = new Logger(ApprenticeDeclarationService.name);
  private static readonly MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

  constructor(private readonly prisma: PrismaService) {}

  async listForMonth(
    clinicId: string,
    month: string,
  ): Promise<ApprenticeDeclarationRow[]> {
    const [year, monthNum] = month.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

    // Find all active apprentices
    const apprentices = await this.prisma.employee.findMany({
      where: {
        clinicId,
        isActive: true,
        contractType: 'APPRENTICESHIP',
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    if (apprentices.length === 0) return [];

    const apprenticeIds = apprentices.map((a) => a.id);

    // Check for SCHOOL unavailabilities in this month
    const schoolUnavailabilities = await this.prisma.unavailability.findMany({
      where: {
        clinicId,
        employeeId: { in: apprenticeIds },
        type: 'SCHOOL',
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
      select: { employeeId: true },
    });
    const hasSchoolDays = new Set(schoolUnavailabilities.map((u) => u.employeeId));

    // Check for NO_SCHOOL_THIS_MONTH declarations
    const declarations = await this.prisma.apprenticeMonthDeclaration.findMany({
      where: {
        clinicId,
        employeeId: { in: apprenticeIds },
        month,
        status: 'NO_SCHOOL_THIS_MONTH',
      },
      select: { employeeId: true },
    });
    const hasNoSchool = new Set(declarations.map((d) => d.employeeId));

    return apprentices.map((apprentice) => {
      let status: ApprenticeDeclarationRow['status'];
      if (hasSchoolDays.has(apprentice.id)) {
        status = 'SCHOOL_DAYS_PROVIDED';
      } else if (hasNoSchool.has(apprentice.id)) {
        status = 'NO_SCHOOL_THIS_MONTH';
      } else {
        status = 'MISSING';
      }

      return {
        employeeId: apprentice.id,
        firstName: apprentice.firstName,
        lastName: apprentice.lastName,
        status,
      };
    });
  }

  /**
   * Both foreign keys are satisfied independently, so an upsert on the
   * composite key happily persists a row pointing at another clinic's
   * employee. Resolving the employee inside the caller's clinic first is what
   * every other id-taking planning procedure already does — and it also stops
   * the answer from revealing whether a foreign id exists.
   */
  private async assertEmployeeInClinic(clinicId: string, employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, clinicId },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
  }

  async upsertNoSchool(
    clinicId: string,
    employeeId: string,
    month: string,
  ): Promise<{ id: string }> {
    await this.assertEmployeeInClinic(clinicId, employeeId);

    const result = await this.prisma.apprenticeMonthDeclaration.upsert({
      where: {
        clinicId_employeeId_month: { clinicId, employeeId, month },
      },
      create: {
        clinicId,
        employeeId,
        month,
        status: 'NO_SCHOOL_THIS_MONTH',
      },
      update: {
        status: 'NO_SCHOOL_THIS_MONTH',
      },
    });
    return { id: result.id };
  }

  async deleteDeclaration(
    clinicId: string,
    employeeId: string,
    month: string,
  ): Promise<{ deleted: boolean }> {
    await this.assertEmployeeInClinic(clinicId, employeeId);

    try {
      await this.prisma.apprenticeMonthDeclaration.delete({
        where: {
          clinicId_employeeId_month: { clinicId, employeeId, month },
        },
      });
      return { deleted: true };
    } catch {
      return { deleted: false };
    }
  }

  async getUndeclaredApprentices(
    clinicId: string,
    month: string,
  ): Promise<Array<{ id: string; firstName: string; lastName: string }>> {
    const rows = await this.listForMonth(clinicId, month);
    return rows
      .filter((r) => r.status === 'MISSING')
      .map((r) => ({
        id: r.employeeId,
        firstName: r.firstName,
        lastName: r.lastName,
      }));
  }
}
