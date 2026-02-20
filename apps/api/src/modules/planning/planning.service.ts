import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClinicService } from '@/modules/clinic/clinic.service';
import type { Prisma } from '@prisma/client';
import type {
  CreatePlanningRuleInput,
  UpdatePlanningRuleInput,
  ListPlanningRulesInput,
  TogglePlanningRuleInput,
  ValidateShiftsInput,
  StaffingMinimumConfig,
  SkillRequirementConfig,
  PlanningRuleCategory,
} from '@pawly/validators';
import {
  staffingMinimumConfigSchema,
  rotationEquityConfigSchema,
  skillRequirementConfigSchema,
  contractComplianceConfigSchema,
} from '@pawly/validators';

type HardViolation = {
  ruleId: string;
  ruleName: string;
  category: PlanningRuleCategory;
  message: string;
  affectedEmployeeId?: string;
  affectedDate?: string;
  severity: 'blocking';
};

type SoftViolation = {
  ruleId: string;
  ruleName: string;
  category: PlanningRuleCategory;
  message: string;
  affectedEmployeeId?: string;
  affectedDate?: string;
  severity: 'warning';
};

@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicService: ClinicService,
  ) {}

  async createRule(clinicId: string, input: CreatePlanningRuleInput) {
    await this.validateConfig(clinicId, input.category, input.config);

    return this.prisma.planningRule.create({
      data: {
        clinicId,
        name: input.name,
        description: input.description || null,
        ruleType: input.ruleType,
        category: input.category,
        isActive: input.isActive,
        config: input.config as Prisma.InputJsonValue,
        priority: input.priority,
      },
    });
  }

  async updateRule(clinicId: string, input: UpdatePlanningRuleInput) {
    const { id, ...updateData } = input;
    await this.findRuleById(clinicId, id);
    await this.validateConfig(clinicId, updateData.category, updateData.config);

    return this.prisma.planningRule.update({
      where: { id },
      data: {
        name: updateData.name,
        description: updateData.description || null,
        ruleType: updateData.ruleType,
        category: updateData.category,
        isActive: updateData.isActive,
        config: updateData.config as Prisma.InputJsonValue,
        priority: updateData.priority,
      },
    });
  }

  async deleteRule(clinicId: string, ruleId: string) {
    const { count } = await this.prisma.planningRule.deleteMany({
      where: { id: ruleId, clinicId },
    });

    if (count === 0) {
      throw new NotFoundException(`Planning rule ${ruleId} not found`);
    }

    return { id: ruleId };
  }

  async listRules(clinicId: string, filters?: ListPlanningRulesInput) {
    return this.prisma.planningRule.findMany({
      where: {
        clinicId,
        ...(filters?.category ? { category: filters.category } : {}),
        ...(filters?.ruleType ? { ruleType: filters.ruleType } : {}),
        ...(filters?.isActive !== undefined
          ? { isActive: filters.isActive }
          : {}),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async getRuleById(clinicId: string, ruleId: string) {
    return this.findRuleById(clinicId, ruleId);
  }

  async toggleRule(clinicId: string, input: TogglePlanningRuleInput) {
    await this.findRuleById(clinicId, input.id);

    return this.prisma.planningRule.update({
      where: { id: input.id },
      data: { isActive: input.isActive },
    });
  }

  async validateShiftsAgainstRules(
    clinicId: string,
    input: ValidateShiftsInput,
  ): Promise<{
    hardViolations: HardViolation[];
    softViolations: SoftViolation[];
  }> {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    // Load active planning rules for this clinic, ordered by priority DESC
    const rules = await this.prisma.planningRule.findMany({
      where: { clinicId, isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    // Load shifts in the date range with employee data
    const shifts = await this.prisma.shift.findMany({
      where: {
        clinicId,
        date: { gte: startDate, lte: endDate },
      },
      include: {
        employee: {
          select: { id: true, jobType: true, contractHours: true },
        },
      },
    });

    // Filter out shifts without shiftTypeCode (pre-migration data safety)
    const validShifts = shifts.filter((s) => s.shiftTypeCode);

    const hardViolations: HardViolation[] = [];
    const softViolations: SoftViolation[] = [];

    for (const rule of rules) {
      const config = rule.config as Record<string, unknown>;

      switch (rule.category) {
        case 'STAFFING_MINIMUM':
          this.evaluateStaffingMinimum(rule, config, validShifts, hardViolations, softViolations);
          break;
        case 'SKILL_REQUIREMENT':
          this.evaluateSkillRequirement(rule, config, validShifts, hardViolations, softViolations);
          break;
        case 'ROTATION_EQUITY':
          this.evaluateRotationEquity(rule, config, validShifts, softViolations);
          break;
        case 'CONTRACT_COMPLIANCE':
          this.evaluateContractCompliance(rule, config, validShifts, softViolations);
          break;
      }
    }

    return { hardViolations, softViolations };
  }

  private evaluateStaffingMinimum(
    rule: { id: string; name: string; category: string; ruleType: string },
    config: Record<string, unknown>,
    shifts: Array<{ date: Date; shiftTypeCode: string; employee: { id: string; jobType: string } }>,
    hardViolations: HardViolation[],
    softViolations: SoftViolation[],
  ) {
    const shiftTypeCode = config.shiftTypeCode as string;
    const minStaff = config.minStaff as number;
    const jobTypes = config.jobTypes as string[] | undefined;

    // Group shifts by date
    const shiftsByDate = new Map<string, typeof shifts>();
    for (const shift of shifts) {
      if (shift.shiftTypeCode !== shiftTypeCode) continue;
      const dateKey = shift.date.toISOString().split('T')[0];
      const group = shiftsByDate.get(dateKey) || [];
      group.push(shift);
      shiftsByDate.set(dateKey, group);
    }

    for (const [dateKey, dateShifts] of shiftsByDate) {
      const matchingShifts = jobTypes
        ? dateShifts.filter((s) => jobTypes.includes(s.employee.jobType))
        : dateShifts;

      if (matchingShifts.length < minStaff) {
        const violation = {
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category as PlanningRuleCategory,
          message: `Only ${matchingShifts.length} staff assigned for ${shiftTypeCode} on ${dateKey}, minimum ${minStaff} required`,
          affectedDate: dateKey,
        };

        if (rule.ruleType === 'HARD') {
          hardViolations.push({ ...violation, severity: 'blocking' as const });
        } else {
          softViolations.push({ ...violation, severity: 'warning' as const });
        }
      }
    }
  }

  private evaluateSkillRequirement(
    rule: { id: string; name: string; category: string; ruleType: string },
    config: Record<string, unknown>,
    shifts: Array<{ date: Date; shiftTypeCode: string; employee: { id: string; jobType: string } }>,
    hardViolations: HardViolation[],
    softViolations: SoftViolation[],
  ) {
    const shiftTypeCode = config.shiftTypeCode as string;
    const requiredJobTypes = config.requiredJobTypes as string[];

    // Group shifts by date
    const shiftsByDate = new Map<string, typeof shifts>();
    for (const shift of shifts) {
      if (shift.shiftTypeCode !== shiftTypeCode) continue;
      const dateKey = shift.date.toISOString().split('T')[0];
      const group = shiftsByDate.get(dateKey) || [];
      group.push(shift);
      shiftsByDate.set(dateKey, group);
    }

    for (const [dateKey, dateShifts] of shiftsByDate) {
      const assignedJobTypes = new Set(dateShifts.map((s) => s.employee.jobType));
      const missingTypes = requiredJobTypes.filter((jt) => !assignedJobTypes.has(jt));

      if (missingTypes.length > 0) {
        const violation = {
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category as PlanningRuleCategory,
          message: `Missing required job type(s) ${missingTypes.join(', ')} for ${shiftTypeCode} on ${dateKey}`,
          affectedDate: dateKey,
        };

        if (rule.ruleType === 'HARD') {
          hardViolations.push({ ...violation, severity: 'blocking' as const });
        } else {
          softViolations.push({ ...violation, severity: 'warning' as const });
        }
      }
    }
  }

  private evaluateRotationEquity(
    rule: { id: string; name: string; category: string },
    config: Record<string, unknown>,
    shifts: Array<{ date: Date; employee: { id: string } }>,
    softViolations: SoftViolation[],
  ) {
    const targetDay = config.targetDay as string;
    const maxPerPeriod = config.maxPerPeriod as number;

    // Map day name to ISO day number
    const dayNameToIso: Record<string, number> = {
      monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
      friday: 5, saturday: 6, sunday: 7,
    };
    const targetIsoDay = dayNameToIso[targetDay];
    if (!targetIsoDay) return;

    // Count per employee
    const countByEmployee = new Map<string, number>();
    for (const shift of shifts) {
      const shiftDate = new Date(shift.date);
      const day = shiftDate.getUTCDay();
      const isoDay = day === 0 ? 7 : day;
      if (isoDay !== targetIsoDay) continue;

      const current = countByEmployee.get(shift.employee.id) || 0;
      countByEmployee.set(shift.employee.id, current + 1);
    }

    for (const [employeeId, count] of countByEmployee) {
      if (count > maxPerPeriod) {
        softViolations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category as PlanningRuleCategory,
          message: `Employee has ${count} ${targetDay} shifts, exceeds maximum of ${maxPerPeriod} per period`,
          affectedEmployeeId: employeeId,
          severity: 'warning',
        });
      }
    }
  }

  private evaluateContractCompliance(
    rule: { id: string; name: string; category: string },
    config: Record<string, unknown>,
    shifts: Array<{ startTime: string; endTime: string; employee: { id: string; contractHours: number } }>,
    softViolations: SoftViolation[],
  ) {
    const maxMonthlyHours = config.maxMonthlyHours as number | undefined;

    if (!maxMonthlyHours) return;

    // Sum hours per employee
    const hoursByEmployee = new Map<string, { total: number; contractHours: number }>();
    for (const shift of shifts) {
      const minutes = this.calculateShiftMinutes(shift.startTime, shift.endTime);
      const current = hoursByEmployee.get(shift.employee.id) || {
        total: 0,
        contractHours: shift.employee.contractHours,
      };
      current.total += minutes;
      hoursByEmployee.set(shift.employee.id, current);
    }

    for (const [employeeId, data] of hoursByEmployee) {
      const totalHours = Math.round(data.total / 60);
      if (totalHours > maxMonthlyHours) {
        softViolations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category as PlanningRuleCategory,
          message: `Employee total ${totalHours}h exceeds maximum ${maxMonthlyHours}h`,
          affectedEmployeeId: employeeId,
          severity: 'warning',
        });
      }
    }
  }

  private calculateShiftMinutes(startTime: string, endTime: string): number {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return endMinutes >= startMinutes
      ? endMinutes - startMinutes
      : 1440 - startMinutes + endMinutes;
  }

  private async findRuleById(clinicId: string, ruleId: string) {
    const rule = await this.prisma.planningRule.findFirst({
      where: { id: ruleId, clinicId },
    });

    if (!rule) {
      throw new NotFoundException(`Planning rule ${ruleId} not found`);
    }

    return rule;
  }

  private async validateConfig(
    clinicId: string,
    category: string,
    config: unknown,
  ) {
    // Validate config shape matches the category
    switch (category) {
      case 'STAFFING_MINIMUM': {
        const parsed = staffingMinimumConfigSchema.safeParse(config);
        if (!parsed.success) {
          throw new BadRequestException(
            `Invalid staffing minimum config: ${parsed.error.message}`,
          );
        }
        await this.validateShiftTypeCode(
          clinicId,
          (parsed.data as StaffingMinimumConfig).shiftTypeCode,
        );
        break;
      }
      case 'ROTATION_EQUITY': {
        const parsed = rotationEquityConfigSchema.safeParse(config);
        if (!parsed.success) {
          throw new BadRequestException(
            `Invalid rotation equity config: ${parsed.error.message}`,
          );
        }
        break;
      }
      case 'SKILL_REQUIREMENT': {
        const parsed = skillRequirementConfigSchema.safeParse(config);
        if (!parsed.success) {
          throw new BadRequestException(
            `Invalid skill requirement config: ${parsed.error.message}`,
          );
        }
        await this.validateShiftTypeCode(
          clinicId,
          (parsed.data as SkillRequirementConfig).shiftTypeCode,
        );
        break;
      }
      case 'CONTRACT_COMPLIANCE': {
        const parsed = contractComplianceConfigSchema.safeParse(config);
        if (!parsed.success) {
          throw new BadRequestException(
            `Invalid contract compliance config: ${parsed.error.message}`,
          );
        }
        break;
      }
      default:
        throw new BadRequestException(`Unknown rule category: ${category}`);
    }
  }

  private async validateShiftTypeCode(clinicId: string, shiftTypeCode: string) {
    const shiftTypes = await this.clinicService.listShiftTypes(clinicId);
    const exists = shiftTypes.some((st) => st.code === shiftTypeCode);

    if (!exists) {
      throw new BadRequestException(
        `Shift type code "${shiftTypeCode}" does not exist for this clinic`,
      );
    }
  }
}
