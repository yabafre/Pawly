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
import type { EquityContext } from '@pawly/validators';
import type { CounterWithEmployee } from './equity-counter.service';
import {
  findStatutoryViolations,
  STATUTORY_RULE_NAME,
  type StatutoryShift,
  type StatutoryViolation,
  type StatutoryViolationKind,
} from './french-labor-law';

type HardViolation = {
  ruleId: string;
  ruleName: string;
  category: PlanningRuleCategory;
  message: string;
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  affectedEmployeeId?: string;
  affectedDate?: string;
  severity: 'blocking';
};

type SoftViolation = {
  ruleId: string;
  ruleName: string;
  category: PlanningRuleCategory;
  message: string;
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  affectedEmployeeId?: string;
  affectedDate?: string;
  severity: 'warning';
  equityContext?: EquityContext;
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
    options?: { equityCounters?: CounterWithEmployee[] },
  ): Promise<{
    hardViolations: HardViolation[];
    softViolations: SoftViolation[];
    rules: Array<{
      id: string;
      name: string;
      category: string;
      ruleType: string;
      config: unknown;
      priority: number;
    }>;
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
          this.evaluateStaffingMinimum(
            rule,
            config,
            validShifts,
            hardViolations,
            softViolations,
          );
          break;
        case 'SKILL_REQUIREMENT':
          this.evaluateSkillRequirement(
            rule,
            config,
            validShifts,
            hardViolations,
            softViolations,
          );
          break;
        case 'ROTATION_EQUITY':
          this.evaluateRotationEquity(
            rule,
            config,
            validShifts,
            softViolations,
            options?.equityCounters,
          );
          break;
        case 'CONTRACT_COMPLIANCE':
          this.evaluateContractCompliance(
            rule,
            config,
            validShifts,
            softViolations,
            options?.equityCounters,
          );
          break;
      }
    }

    // Story 11-3 — statutory French labor-law HARD limits, ALWAYS enforced (independent of
    // configured rules). Surfaces in the Planning Health Bar and blocks publication.
    this.evaluateStatutoryLimits(validShifts, hardViolations);

    return { hardViolations, softViolations, rules };
  }

  private static readonly STATUTORY_MESSAGE_KEY: Record<
    StatutoryViolationKind,
    string
  > = {
    DAILY_WORK: 'violations.statutory.dailyWork',
    DAILY_AMPLITUDE: 'violations.statutory.dailyAmplitude',
    WEEKLY_REST: 'violations.statutory.weeklyRest',
    CONSECUTIVE_DAYS: 'violations.statutory.consecutiveDays',
  };

  private evaluateStatutoryLimits(
    shifts: Array<{
      date: Date;
      startTime: string;
      endTime: string;
      breakMinutes: number;
      employee: { id: string };
    }>,
    hardViolations: HardViolation[],
  ) {
    const byEmployee = new Map<string, StatutoryShift[]>();
    for (const s of shifts) {
      const arr = byEmployee.get(s.employee.id) ?? [];
      arr.push({
        date: s.date.toISOString().split('T')[0],
        startTime: s.startTime,
        endTime: s.endTime,
        breakMinutes: s.breakMinutes,
      });
      byEmployee.set(s.employee.id, arr);
    }

    for (const [employeeId, empShifts] of byEmployee) {
      for (const v of findStatutoryViolations(empShifts)) {
        hardViolations.push(this.statutoryToHardViolation(v, employeeId));
      }
    }
  }

  private statutoryToHardViolation(
    v: StatutoryViolation,
    employeeId: string,
  ): HardViolation {
    const isDaily = v.kind === 'DAILY_WORK' || v.kind === 'DAILY_AMPLITUDE';
    const actual = isDaily ? Math.round((v.actual / 60) * 10) / 10 : v.actual;
    const limit = isDaily ? v.limit / 60 : v.limit;
    return {
      ruleId: `statutory:${v.kind.toLowerCase()}`,
      ruleName: STATUTORY_RULE_NAME,
      category: 'CONTRACT_COMPLIANCE',
      message: `Statutory ${v.kind} limit exceeded on ${v.date} (${actual} > ${limit})`,
      messageKey: PlanningService.STATUTORY_MESSAGE_KEY[v.kind],
      messageParams: { date: v.date, actual, limit },
      affectedEmployeeId: employeeId,
      affectedDate: v.date,
      severity: 'blocking',
    };
  }

  private evaluateStaffingMinimum(
    rule: { id: string; name: string; category: string; ruleType: string },
    config: Record<string, unknown>,
    shifts: Array<{
      date: Date;
      shiftTypeCode: string;
      employee: { id: string; jobType: string };
    }>,
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
    shifts: Array<{
      date: Date;
      shiftTypeCode: string;
      employee: { id: string; jobType: string };
    }>,
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
      const assignedJobTypes = new Set(
        dateShifts.map((s) => s.employee.jobType),
      );
      const missingTypes = requiredJobTypes.filter(
        (jt) => !assignedJobTypes.has(jt),
      );

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
    equityCounters?: CounterWithEmployee[],
  ) {
    const targetDay = config.targetDay as string;
    const maxPerPeriod = config.maxPerPeriod as number;
    const trackingPeriod = config.trackingPeriod as string | undefined;

    // Map day name to ISO day number
    const dayNameToIso: Record<string, number> = {
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
      sunday: 7,
    };
    const targetIsoDay = dayNameToIso[targetDay];
    if (!targetIsoDay) return;

    // Map targetDay to equity counter type for clinic average
    // Note: only SATURDAY_WORKED has a dedicated counter; sunday falls through
    // to shift-data average (WEEKEND_TOTAL includes both sat+sun, not sunday-only)
    const dayToCounterType: Record<string, string> = {
      saturday: 'SATURDAY_WORKED',
    };
    const counterType = dayToCounterType[targetDay];

    // Count per employee + collect shift dates for date spreading
    const countByEmployee = new Map<string, number>();
    const datesByEmployee = new Map<string, string[]>();
    for (const shift of shifts) {
      const shiftDate = new Date(shift.date);
      const day = shiftDate.getUTCDay();
      const isoDay = day === 0 ? 7 : day;
      if (isoDay !== targetIsoDay) continue;

      const current = countByEmployee.get(shift.employee.id) || 0;
      countByEmployee.set(shift.employee.id, current + 1);

      const dateStr = shiftDate.toISOString().split('T')[0];
      const dates = datesByEmployee.get(shift.employee.id) || [];
      dates.push(dateStr);
      datesByEmployee.set(shift.employee.id, dates);
    }

    // Compute clinic average from equity counters or shift data
    let clinicAverage = 0;
    if (equityCounters && counterType) {
      const relevantCounters = equityCounters.filter(
        (c) => c.counterType === counterType,
      );
      if (relevantCounters.length > 0) {
        clinicAverage =
          relevantCounters.reduce((sum, c) => sum + c.count, 0) /
          relevantCounters.length;
      }
    } else {
      const allCounts = Array.from(countByEmployee.values());
      if (allCounts.length > 0) {
        clinicAverage = allCounts.reduce((a, b) => a + b, 0) / allCounts.length;
      }
    }

    for (const [employeeId, count] of countByEmployee) {
      if (count > maxPerPeriod) {
        const dates = datesByEmployee.get(employeeId) || [];
        const trend: EquityContext['trend'] =
          count > clinicAverage + 0.5
            ? 'above_average'
            : count < clinicAverage - 0.5
              ? 'below_average'
              : 'average';

        const equityContext: EquityContext = {
          counterType: counterType || `${targetDay.toUpperCase()}_SHIFTS`,
          currentCount: count,
          maxPerPeriod,
          clinicAverage: Math.round(clinicAverage * 10) / 10,
          trend,
        };

        // Spread violation across each affected date (subtask 1.4)
        for (const dateStr of dates) {
          softViolations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            category: rule.category as PlanningRuleCategory,
            message: `Employee has ${count} ${targetDay} shifts, exceeds maximum of ${maxPerPeriod} per ${trackingPeriod || 'period'}`,
            messageKey: 'violations.rotationEquity.exceeded',
            messageParams: {
              currentCount: count,
              maxPerPeriod,
              targetDay,
              trackingPeriod: trackingPeriod || 'monthly',
            },
            affectedEmployeeId: employeeId,
            affectedDate: dateStr,
            severity: 'warning',
            equityContext,
          });
        }
      }
    }
  }

  private evaluateContractCompliance(
    rule: { id: string; name: string; category: string },
    config: Record<string, unknown>,
    shifts: Array<{
      startTime: string;
      endTime: string;
      employee: { id: string; contractHours: number };
    }>,
    softViolations: SoftViolation[],
    equityCounters?: CounterWithEmployee[],
  ) {
    const maxMonthlyHours = config.maxMonthlyHours as number | undefined;

    if (!maxMonthlyHours) return;

    // Sum hours per employee
    const hoursByEmployee = new Map<
      string,
      { total: number; contractHours: number }
    >();
    for (const shift of shifts) {
      const minutes = this.calculateShiftMinutes(
        shift.startTime,
        shift.endTime,
      );
      const current = hoursByEmployee.get(shift.employee.id) || {
        total: 0,
        contractHours: shift.employee.contractHours,
      };
      current.total += minutes;
      hoursByEmployee.set(shift.employee.id, current);
    }

    // Compute clinic average hours
    let clinicAverageHours = 0;
    if (equityCounters) {
      const overtimeCounters = equityCounters.filter(
        (c) => c.counterType === 'OVERTIME_HOURS',
      );
      if (overtimeCounters.length > 0) {
        const avgHistoricalOvertime =
          overtimeCounters.reduce((sum, c) => sum + c.count, 0) /
          overtimeCounters.length /
          60;
        const allEmployeeHours = Array.from(hoursByEmployee.values());
        if (allEmployeeHours.length > 0) {
          const currentAvg =
            allEmployeeHours.reduce((sum, h) => sum + h.total / 60, 0) /
            allEmployeeHours.length;
          clinicAverageHours = currentAvg + avgHistoricalOvertime;
        }
      } else {
        const allEmployeeHours = Array.from(hoursByEmployee.values());
        if (allEmployeeHours.length > 0) {
          clinicAverageHours =
            allEmployeeHours.reduce((sum, h) => sum + h.total / 60, 0) /
            allEmployeeHours.length;
        }
      }
    } else {
      const allEmployeeHours = Array.from(hoursByEmployee.values());
      if (allEmployeeHours.length > 0) {
        clinicAverageHours =
          allEmployeeHours.reduce((sum, h) => sum + h.total / 60, 0) /
          allEmployeeHours.length;
      }
    }

    for (const [employeeId, data] of hoursByEmployee) {
      const totalHours = Math.round(data.total / 60);
      if (totalHours > maxMonthlyHours) {
        const overtimeMinutes = Math.round(data.total - maxMonthlyHours * 60);
        const trend: EquityContext['trend'] =
          totalHours > clinicAverageHours + 2
            ? 'above_average'
            : totalHours < clinicAverageHours - 2
              ? 'below_average'
              : 'average';

        softViolations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category as PlanningRuleCategory,
          message: `Employee total ${totalHours}h exceeds maximum ${maxMonthlyHours}h`,
          messageKey: 'violations.contractCompliance.overtime',
          messageParams: {
            currentMonthlyHours: totalHours,
            maxMonthlyHours,
          },
          affectedEmployeeId: employeeId,
          severity: 'warning',
          equityContext: {
            counterType: 'OVERTIME_HOURS',
            currentCount: totalHours,
            maxPerPeriod: maxMonthlyHours,
            clinicAverage: Math.round(clinicAverageHours * 10) / 10,
            trend,
          },
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
