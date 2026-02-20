import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClinicService } from '@/modules/clinic/clinic.service';
import type { Prisma } from '@prisma/client';
import type {
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateData,
} from '@pawly/validators';
import { JOB_TYPES } from '@pawly/validators';

@Injectable()
export class PlanningTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicService: ClinicService,
  ) {}

  async createTemplate(clinicId: string, input: CreateTemplateInput) {
    await this.validateTemplateData(clinicId, input.data);

    return this.prisma.planningTemplate.create({
      data: {
        clinicId,
        name: input.name,
        data: input.data as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updateTemplate(clinicId: string, input: UpdateTemplateInput) {
    await this.findTemplateById(clinicId, input.id);
    await this.validateTemplateData(clinicId, input.data);

    return this.prisma.planningTemplate.update({
      where: { id: input.id },
      data: {
        name: input.name,
        data: input.data as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async deleteTemplate(clinicId: string, templateId: string) {
    const { count } = await this.prisma.planningTemplate.deleteMany({
      where: { id: templateId, clinicId },
    });

    if (count === 0) {
      throw new NotFoundException(
        `Planning template ${templateId} not found`,
      );
    }

    return { id: templateId };
  }

  async listTemplates(clinicId: string) {
    return this.prisma.planningTemplate.findMany({
      where: { clinicId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getTemplateById(clinicId: string, templateId: string) {
    return this.findTemplateById(clinicId, templateId);
  }

  async duplicateTemplate(clinicId: string, templateId: string) {
    const original = await this.findTemplateById(clinicId, templateId);

    // Validate original data integrity before duplicating
    const originalData = original.data as unknown as TemplateData;
    await this.validateTemplateData(clinicId, originalData);

    return this.prisma.planningTemplate.create({
      data: {
        clinicId,
        name: `${original.name} (Copy)`,
        data: originalData as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async validateTemplateData(clinicId: string, data: TemplateData) {
    // Collect all unique shiftTypeCodes from slots
    const shiftTypeCodes = new Set<string>();
    for (const day of data.days) {
      for (const slot of day.slots) {
        shiftTypeCodes.add(slot.shiftTypeCode);
      }
    }

    // Validate shiftTypeCodes exist in clinic
    if (shiftTypeCodes.size > 0) {
      const clinicShiftTypes =
        await this.clinicService.listShiftTypes(clinicId);
      const validCodes = new Set(clinicShiftTypes.map((st) => st.code));

      for (const code of shiftTypeCodes) {
        if (!validCodes.has(code)) {
          throw new BadRequestException(
            `Shift type code "${code}" does not exist for this clinic`,
          );
        }
      }
    }

    // Validate requiredJobTypes values
    for (const day of data.days) {
      for (const slot of day.slots) {
        if (slot.requiredJobTypes) {
          for (const jt of slot.requiredJobTypes) {
            if (!JOB_TYPES.includes(jt as (typeof JOB_TYPES)[number])) {
              throw new BadRequestException(
                `Invalid job type "${jt}" in template slot`,
              );
            }
          }
        }
      }
    }
  }

  private async findTemplateById(clinicId: string, templateId: string) {
    const template = await this.prisma.planningTemplate.findFirst({
      where: { id: templateId, clinicId },
    });

    if (!template) {
      throw new NotFoundException(
        `Planning template ${templateId} not found`,
      );
    }

    return template;
  }
}
