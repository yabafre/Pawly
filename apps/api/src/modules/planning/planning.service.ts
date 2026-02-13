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
    _input: ValidateShiftsInput,
  ): Promise<{
    hardViolations: HardViolation[];
    softViolations: SoftViolation[];
  }> {
    // Load active planning rules for this clinic
    const rules = await this.prisma.planningRule.findMany({
      where: { clinicId, isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    // In this story (5.5), we return the rule structure for Health Bar preview.
    // Full shift evaluation logic will be implemented in Story 6.2.
    const hardViolations: HardViolation[] = [];
    const softViolations: SoftViolation[] = [];

    for (const rule of rules) {
      // Placeholder: no actual shifts to evaluate yet.
      // When Epic 6 adds shift data, this will evaluate each rule against actual assignments.
      if (rule.ruleType === 'HARD') {
        // Hard rules will produce blocking violations when shifts violate them
        this.logger.debug(
          `HARD rule "${rule.name}" (${rule.category}) loaded for evaluation`,
        );
      } else {
        // Soft rules will produce warnings
        this.logger.debug(
          `SOFT rule "${rule.name}" (${rule.category}) loaded for evaluation`,
        );
      }
    }

    return { hardViolations, softViolations };
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
