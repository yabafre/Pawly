import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
  ListEmployeesInput,
  CreateUnavailabilityInput,
  UpdateUnavailabilityInput,
  ListUnavailabilitiesInput,
  HardRuleRangeInput,
} from '@pawly/validators';

type UnavailabilityRecord = {
  id: string;
  type: string;
  startDate: Date;
  endDate: Date;
  reason: string | null;
  daysOfWeek: number[];
  employeeId: string;
};

type HardRuleProjection = {
  ruleType: 'HARD';
  source: 'ONE_TIME' | 'RECURRING';
  constraintId: string;
  employeeId: string;
  type: string;
  startDate: Date;
  endDate: Date;
  reason: string | null;
};

@Injectable()
export class EmployeeService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(clinicId: string, filters?: ListEmployeesInput) {
    return this.prisma.employee.findMany({
      where: {
        clinicId,
        ...(filters?.includeInactive ? {} : { isActive: true }),
        ...(filters?.jobType ? { jobType: filters.jobType } : {}),
        ...(filters?.search
          ? {
              OR: [
                {
                  firstName: {
                    contains: filters.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  lastName: {
                    contains: filters.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { lastName: 'asc' },
    });
  }

  async findById(clinicId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, clinicId },
    });

    if (!employee) {
      throw new NotFoundException(`Employee ${id} not found`);
    }

    return employee;
  }

  async create(clinicId: string, data: CreateEmployeeInput) {
    const forceClearEndDate = data.contractType === 'CDI';

    return this.prisma.employee.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        phone: data.phone || null,
        jobType: data.jobType,
        contractType: data.contractType,
        contractHours: data.contractHours,
        color: data.color,
        hireDate: data.hireDate ? new Date(data.hireDate) : null,
        endDate:
          forceClearEndDate || !data.endDate ? null : new Date(data.endDate),
        clinicId,
      },
    });
  }

  async update(clinicId: string, data: UpdateEmployeeInput) {
    const { id, ...updateData } = data;
    const forceClearEndDate = updateData.contractType === 'CDI';

    // Verify employee belongs to clinic
    await this.findById(clinicId, id);

    return this.prisma.employee.update({
      where: { id },
      data: {
        ...(updateData.firstName !== undefined && {
          firstName: updateData.firstName,
        }),
        ...(updateData.lastName !== undefined && {
          lastName: updateData.lastName,
        }),
        ...(updateData.email !== undefined && {
          email: updateData.email || null,
        }),
        ...(updateData.phone !== undefined && {
          phone: updateData.phone || null,
        }),
        ...(updateData.jobType !== undefined && {
          jobType: updateData.jobType,
        }),
        ...(updateData.contractType !== undefined && {
          contractType: updateData.contractType,
          ...(forceClearEndDate && { endDate: null }),
        }),
        ...(updateData.contractHours !== undefined && {
          contractHours: updateData.contractHours,
        }),
        ...(updateData.color !== undefined && { color: updateData.color }),
        ...(updateData.hireDate !== undefined && {
          hireDate: updateData.hireDate ? new Date(updateData.hireDate) : null,
        }),
        ...(updateData.endDate !== undefined &&
          !forceClearEndDate && {
            endDate: updateData.endDate ? new Date(updateData.endDate) : null,
          }),
      },
    });
  }

  async toggleActive(clinicId: string, id: string) {
    const employee = await this.findById(clinicId, id);

    return this.prisma.employee.update({
      where: { id },
      data: { isActive: !employee.isActive },
    });
  }

  async listConstraints(clinicId: string, filters: ListUnavailabilitiesInput) {
    await this.findById(clinicId, filters.employeeId);

    return this.prisma.unavailability.findMany({
      where: {
        clinicId,
        employeeId: filters.employeeId,
      },
      orderBy: [{ startDate: 'asc' }, { endDate: 'asc' }],
    });
  }

  async createConstraint(clinicId: string, data: CreateUnavailabilityInput) {
    await this.findById(clinicId, data.employeeId);

    return this.prisma.unavailability.create({
      data: {
        clinicId,
        employeeId: data.employeeId,
        type: data.type,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        reason: data.reason || null,
        daysOfWeek: data.daysOfWeek,
      },
    });
  }

  async updateConstraint(clinicId: string, data: UpdateUnavailabilityInput) {
    const { id, ...updateData } = data;
    await this.findConstraintById(clinicId, id);

    if (updateData.employeeId) {
      await this.findById(clinicId, updateData.employeeId);
    }

    return this.prisma.unavailability.update({
      where: { id },
      data: {
        ...(updateData.employeeId !== undefined && {
          employeeId: updateData.employeeId,
        }),
        ...(updateData.type !== undefined && { type: updateData.type }),
        ...(updateData.startDate !== undefined && {
          startDate: new Date(updateData.startDate),
        }),
        ...(updateData.endDate !== undefined && {
          endDate: new Date(updateData.endDate),
        }),
        ...(updateData.reason !== undefined && {
          reason: updateData.reason || null,
        }),
        ...(updateData.daysOfWeek !== undefined && {
          daysOfWeek: updateData.daysOfWeek,
        }),
      },
    });
  }

  async deleteConstraint(clinicId: string, id: string) {
    await this.findConstraintById(clinicId, id);

    return this.prisma.unavailability.delete({
      where: { id },
    });
  }

  async listHardRules(clinicId: string, input: HardRuleRangeInput) {
    const rangeStart = new Date(input.startDate);
    const rangeEnd = new Date(input.endDate);

    const constraints = await this.prisma.unavailability.findMany({
      where: {
        clinicId,
        ...(input.employeeIds?.length
          ? {
              employeeId: {
                in: input.employeeIds,
              },
            }
          : {}),
        startDate: { lte: rangeEnd },
        endDate: { gte: rangeStart },
      },
      orderBy: [{ employeeId: 'asc' }, { startDate: 'asc' }],
    });

    return constraints.flatMap((constraint) =>
      this.expandConstraintToHardRules(constraint, rangeStart, rangeEnd),
    );
  }

  private async findConstraintById(clinicId: string, id: string) {
    const constraint = await this.prisma.unavailability.findFirst({
      where: { id, clinicId },
    });

    if (!constraint) {
      throw new NotFoundException(`Constraint ${id} not found`);
    }

    return constraint;
  }

  private expandConstraintToHardRules(
    constraint: UnavailabilityRecord,
    rangeStart: Date,
    rangeEnd: Date,
  ): HardRuleProjection[] {
    if (!constraint.daysOfWeek.length) {
      const startDate = this.maxDate(constraint.startDate, rangeStart);
      const endDate = this.minDate(constraint.endDate, rangeEnd);

      if (startDate > endDate) return [];

      return [
        {
          ruleType: 'HARD',
          source: 'ONE_TIME',
          constraintId: constraint.id,
          employeeId: constraint.employeeId,
          type: constraint.type,
          startDate,
          endDate,
          reason: constraint.reason,
        },
      ];
    }

    const effectiveStart = this.startOfDay(
      this.maxDate(constraint.startDate, rangeStart),
    );
    const effectiveEnd = this.startOfDay(
      this.minDate(constraint.endDate, rangeEnd),
    );

    if (effectiveStart > effectiveEnd) return [];

    const recurringRules: HardRuleProjection[] = [];
    const cursor = new Date(effectiveStart);

    while (cursor <= effectiveEnd) {
      const isoWeekDay = this.toIsoWeekday(cursor);
      if (constraint.daysOfWeek.includes(isoWeekDay)) {
        const ruleStart = this.startOfDay(cursor);
        const ruleEnd = this.endOfDay(cursor);
        const clampedStart = this.maxDate(ruleStart, rangeStart);
        const clampedEnd = this.minDate(ruleEnd, rangeEnd);

        if (clampedStart <= clampedEnd) {
          recurringRules.push({
            ruleType: 'HARD',
            source: 'RECURRING',
            constraintId: constraint.id,
            employeeId: constraint.employeeId,
            type: constraint.type,
            startDate: clampedStart,
            endDate: clampedEnd,
            reason: constraint.reason,
          });
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return recurringRules;
  }

  private toIsoWeekday(date: Date) {
    const day = date.getUTCDay();
    return day === 0 ? 7 : day;
  }

  private startOfDay(date: Date) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
  }

  private endOfDay(date: Date) {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
  }

  private minDate(left: Date, right: Date) {
    return left <= right ? left : right;
  }

  private maxDate(left: Date, right: Date) {
    return left >= right ? left : right;
  }
}
