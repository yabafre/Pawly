import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { MailService } from '@/modules/mail/mail.service';
import { AuthService } from '@/modules/auth/auth.service';
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
  ListEmployeesInput,
  CreateUnavailabilityInput,
  UpdateUnavailabilityInput,
  ListUnavailabilitiesInput,
  HardRuleRangeInput,
  DeclareSchoolDaysInput,
  ListSchoolDaysInput,
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
  private readonly logger = new Logger(EmployeeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly authService: AuthService,
  ) {}

  async validateEmployeeOwnership(userId: string, employeeId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { employee: { select: { id: true } } },
    });
    if (!user?.employee || user.employee.id !== employeeId) {
      throw new ForbiddenException('You can only manage your own employee record');
    }
  }

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
    const email = data.email || null;

    // If employee has an email, create a User account and link them
    if (email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });
      if (existingUser) {
        throw new BadRequestException(
          `A user account with email ${email} already exists`,
        );
      }

      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            name: `${data.firstName} ${data.lastName}`,
            role: 'EMPLOYEE',
            clinicId,
          },
        });

        return tx.employee.create({
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            email,
            phone: data.phone || null,
            jobType: data.jobType,
            contractType: data.contractType,
            contractHours: data.contractHours,
            color: data.color,
            hireDate: data.hireDate ? new Date(data.hireDate) : null,
            endDate:
              forceClearEndDate || !data.endDate
                ? null
                : new Date(data.endDate),
            clinicId,
            userId: user.id,
          },
        });
      });

      this.authService
        .createWelcomeMagicLink(email)
        .then((url) => {
          if (url) {
            return this.mailService
              .sendEmployeeInvitationEmail(email, url, data.firstName)
              .then(() => this.logger.log(`Sent invitation email to ${email}`));
          }
        })
        .catch((err) =>
          this.logger.error('Failed to send employee invitation email', err),
        );

      return result;
    }

    // No email — create employee without User account
    return this.prisma.employee.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: null,
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
    const existingConstraint = await this.findConstraintById(clinicId, id);

    if (updateData.employeeId) {
      await this.findById(clinicId, updateData.employeeId);
    }

    const nextStartDate =
      updateData.startDate !== undefined
        ? new Date(updateData.startDate)
        : existingConstraint.startDate;
    const nextEndDate =
      updateData.endDate !== undefined
        ? new Date(updateData.endDate)
        : existingConstraint.endDate;

    if (nextEndDate < nextStartDate) {
      throw new BadRequestException(
        'End date must be after or equal to start date',
      );
    }

    return this.prisma.unavailability.update({
      where: { id },
      data: {
        ...(updateData.employeeId !== undefined && {
          employeeId: updateData.employeeId,
        }),
        ...(updateData.type !== undefined && { type: updateData.type }),
        ...(updateData.startDate !== undefined && {
          startDate: nextStartDate,
        }),
        ...(updateData.endDate !== undefined && {
          endDate: nextEndDate,
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

  async declareSchoolDays(
    clinicId: string,
    employeeId: string,
    input: DeclareSchoolDaysInput,
  ) {
    const employee = await this.findById(clinicId, employeeId);

    if (employee.jobType !== 'APPRENTICE') {
      throw new BadRequestException(
        'Only apprentice employees can declare school days',
      );
    }

    const [year, month] = input.month.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const result = await this.prisma.$transaction(async (tx) => {
      // Delete existing SCHOOL unavailabilities for this month
      await tx.unavailability.deleteMany({
        where: {
          clinicId,
          employeeId,
          type: 'SCHOOL',
          startDate: { gte: monthStart },
          endDate: { lte: monthEnd },
        },
      });

      if (input.dates.length === 0) {
        return [];
      }

      // Create new SCHOOL unavailabilities — one per date
      const records = input.dates.map((dateStr) => {
        const d = new Date(dateStr + 'T00:00:00.000Z');
        return {
          clinicId,
          employeeId,
          type: 'SCHOOL' as const,
          startDate: d,
          endDate: d,
          daysOfWeek: [],
        };
      });

      await tx.unavailability.createMany({ data: records });

      return tx.unavailability.findMany({
        where: {
          clinicId,
          employeeId,
          type: 'SCHOOL',
          startDate: { gte: monthStart },
          endDate: { lte: monthEnd },
        },
        orderBy: { startDate: 'asc' },
      });
    });

    // Fire-and-forget: notify clinic admin(s) about the declaration
    if (result.length > 0) {
      this.notifyAdminsOfSchoolDays(
        clinicId,
        `${employee.firstName} ${employee.lastName}`,
        input.month,
        result.length,
      ).catch((err) =>
        this.logger.error('Failed to send school days notification', err),
      );
    }

    return result;
  }

  private async notifyAdminsOfSchoolDays(
    clinicId: string,
    apprenticeName: string,
    month: string,
    dateCount: number,
  ) {
    const admins = await this.prisma.user.findMany({
      where: { clinicId, role: 'ADMIN' },
      select: { email: true, name: true },
    });

    for (const admin of admins) {
      await this.mailService.sendSchoolDaysNotification(
        admin.email,
        admin.name ?? undefined,
        apprenticeName,
        month,
        dateCount,
      );
    }
  }

  async resendInvitation(clinicId: string, employeeId: string) {
    const employee = await this.findById(clinicId, employeeId);

    if (!employee.email) {
      throw new BadRequestException(
        'This employee has no email address',
      );
    }

    // If employee has no User account yet (legacy data), create one and link it
    if (!employee.userId) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: employee.email },
      });

      if (existingUser) {
        // User exists but not linked — link them
        await this.prisma.employee.update({
          where: { id: employee.id },
          data: { userId: existingUser.id },
        });
      } else {
        // Create new User + link in a transaction
        await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email: employee.email!,
              name: `${employee.firstName} ${employee.lastName}`,
              role: 'EMPLOYEE',
              clinicId,
            },
          });
          await tx.employee.update({
            where: { id: employee.id },
            data: { userId: user.id },
          });
        });
      }
    }

    const magicLinkUrl = await this.authService.createWelcomeMagicLink(
      employee.email,
    );

    if (magicLinkUrl) {
      await this.mailService.sendEmployeeInvitationEmail(
        employee.email,
        magicLinkUrl,
        employee.firstName,
      );
    }

    return { message: 'Invitation resent' };
  }

  async listSchoolDays(clinicId: string, input: ListSchoolDaysInput) {
    await this.findById(clinicId, input.employeeId);

    const [year, month] = input.month.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    return this.prisma.unavailability.findMany({
      where: {
        clinicId,
        employeeId: input.employeeId,
        type: 'SCHOOL',
        startDate: { gte: monthStart },
        endDate: { lte: monthEnd },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  async listUndeclaredApprentices(clinicId: string, month: string) {
    const [year, m] = month.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, m - 1, 1));
    const monthEnd = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));

    const apprentices = await this.prisma.employee.findMany({
      where: {
        clinicId,
        jobType: 'APPRENTICE',
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        unavailabilities: {
          where: {
            type: 'SCHOOL',
            startDate: { gte: monthStart },
            endDate: { lte: monthEnd },
          },
          select: { id: true },
        },
      },
    });

    return apprentices.filter((a) => a.unavailabilities.length === 0).map(
      ({ unavailabilities: _, ...rest }) => rest,
    );
  }

  async listAllUndeclaredApprentices(clinicIds: string[], month: string) {
    const [year, m] = month.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, m - 1, 1));
    const monthEnd = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));

    const apprentices = await this.prisma.employee.findMany({
      where: {
        clinicId: { in: clinicIds },
        jobType: 'APPRENTICE',
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        clinicId: true,
        unavailabilities: {
          where: {
            type: 'SCHOOL',
            startDate: { gte: monthStart },
            endDate: { lte: monthEnd },
          },
          select: { id: true },
        },
      },
    });

    return apprentices
      .filter((a) => a.unavailabilities.length === 0)
      .map(({ unavailabilities: _, ...rest }) => rest);
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
