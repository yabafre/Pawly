import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { generateSlug } from '@/common/utils/slug';
import type {
  UpdateClinicNameInput,
  UpdateWorkDaysInput,
  UpdateWorkHoursInput,
  CreateShiftTypesInput,
  CompleteOnboardingInput,
  UpdateClinicOperationalConfigInput,
  CreateShiftTypeInput,
  UpdateShiftTypeInput,
} from '@pawly/validators';

@Injectable()
export class ClinicService {
  private readonly logger = new Logger(ClinicService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getClinicById(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      include: { config: true, shiftTypes: true },
    });

    if (!clinic) {
      throw new NotFoundException(`Clinic ${clinicId} not found`);
    }

    return clinic;
  }

  async updateClinicName(clinicId: string, data: UpdateClinicNameInput) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!clinic) {
      throw new NotFoundException(`Clinic ${clinicId} not found`);
    }

    return this.prisma.clinic.update({
      where: { id: clinicId },
      data: {
        name: data.clinicName,
        slug: generateSlug(data.clinicName),
      },
    });
  }

  async upsertClinicConfig(
    clinicId: string,
    data: UpdateWorkDaysInput & UpdateWorkHoursInput,
  ) {
    return this.prisma.clinicConfig.upsert({
      where: { clinicId },
      create: {
        clinicId,
        workDays: data.workDays,
        defaultStartTime: data.defaultStartTime,
        defaultEndTime: data.defaultEndTime,
      },
      update: {
        workDays: data.workDays,
        defaultStartTime: data.defaultStartTime,
        defaultEndTime: data.defaultEndTime,
      },
    });
  }

  async createShiftTypes(clinicId: string, data: CreateShiftTypesInput) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Delete existing shift types for this clinic
        await tx.clinicShiftType.deleteMany({
          where: { clinicId },
        });

        // Create new shift types
        return tx.clinicShiftType.createMany({
          data: data.shiftTypes.map((st) => ({
            clinicId,
            name: st.name,
            code: st.code,
            startTime: st.startTime,
            endTime: st.endTime,
            breakMinutes: st.breakMinutes ?? 0,
            color: st.color,
          })),
        });
      });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'Duplicate shift type code found. Each shift type must have a unique code.',
        );
      }
      this.logger.error(`Failed to create shift types for clinic ${clinicId}`, err);
      throw err;
    }
  }

  async completeOnboarding(clinicId: string, data: CompleteOnboardingInput) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!clinic) {
      throw new NotFoundException(`Clinic ${clinicId} not found`);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Update clinic name + slug
        await tx.clinic.update({
          where: { id: clinicId },
          data: {
            name: data.clinicName,
            slug: generateSlug(data.clinicName),
            onboardingCompleted: true,
          },
        });

        // Upsert clinic config
        await tx.clinicConfig.upsert({
          where: { clinicId },
          create: {
            clinicId,
            workDays: data.workDays,
            defaultStartTime: data.defaultStartTime,
            defaultEndTime: data.defaultEndTime,
          },
          update: {
            workDays: data.workDays,
            defaultStartTime: data.defaultStartTime,
            defaultEndTime: data.defaultEndTime,
          },
        });

        // Delete existing + create shift types
        await tx.clinicShiftType.deleteMany({ where: { clinicId } });
        await tx.clinicShiftType.createMany({
          data: data.shiftTypes.map((st) => ({
            clinicId,
            name: st.name,
            code: st.code,
            startTime: st.startTime,
            endTime: st.endTime,
            breakMinutes: st.breakMinutes ?? 0,
            color: st.color,
          })),
        });

        return { onboardingCompleted: true };
      });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        const meta = (err as { meta?: { target?: string[] } }).meta;
        const target = meta?.target ?? [];
        if (target.includes('slug')) {
          throw new ConflictException(
            'A clinic with this name already exists. Please choose a different name.',
          );
        }
        throw new ConflictException(
          'Duplicate shift type code found. Each shift type must have a unique code.',
        );
      }
      this.logger.error(`Failed to complete onboarding for clinic ${clinicId}`, err);
      throw err;
    }
  }

  async getOnboardingStatus(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      include: { config: true, shiftTypes: true },
    });

    if (!clinic) {
      throw new NotFoundException(`Clinic ${clinicId} not found`);
    }

    return {
      onboardingCompleted: clinic.onboardingCompleted,
      clinicName: clinic.name,
      config: clinic.config,
      shiftTypes: clinic.shiftTypes,
    };
  }

  async getOperationalConfig(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      include: {
        config: true,
        closedDays: { orderBy: { date: 'asc' } },
        specialDays: { orderBy: { date: 'asc' } },
      },
    });

    if (!clinic) {
      throw new NotFoundException(`Clinic ${clinicId} not found`);
    }

    if (!clinic.config) {
      throw new NotFoundException(`Clinic configuration for ${clinicId} not found`);
    }

    return {
      workDays: clinic.config.workDays,
      defaultStartTime: clinic.config.defaultStartTime,
      defaultEndTime: clinic.config.defaultEndTime,
      closedDays: clinic.closedDays.map((entry) => ({
        id: entry.id,
        date: entry.date.toISOString().slice(0, 10),
        reason: entry.reason,
      })),
      specialDays: clinic.specialDays.map((entry) => ({
        id: entry.id,
        date: entry.date.toISOString().slice(0, 10),
        startTime: entry.startTime,
        endTime: entry.endTime,
        label: entry.label,
      })),
    };
  }

  /**
   * List all clinic IDs and names (used by system-level cron jobs).
   */
  async listAllClinicIds(): Promise<{ id: string; name: string }[]> {
    return this.prisma.clinic.findMany({
      select: { id: true, name: true },
    });
  }

  // ─── Shift Type CRUD ──────────────────────────────────────────────

  async listShiftTypes(clinicId: string) {
    return this.prisma.clinicShiftType.findMany({
      where: { clinicId },
      orderBy: { name: 'asc' },
    });
  }

  async createSingleShiftType(clinicId: string, data: CreateShiftTypeInput) {
    try {
      return await this.prisma.clinicShiftType.create({
        data: {
          clinicId,
          name: data.name,
          code: data.code,
          startTime: data.startTime,
          endTime: data.endTime,
          breakMinutes: data.breakMinutes ?? 0,
          color: data.color,
        },
      });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'A shift type with this code already exists for this clinic.',
        );
      }
      throw err;
    }
  }

  async updateSingleShiftType(
    clinicId: string,
    id: string,
    data: Omit<UpdateShiftTypeInput, 'id'>,
  ) {
    try {
      const result = await this.prisma.clinicShiftType.updateMany({
        where: { id, clinicId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.code !== undefined && { code: data.code }),
          ...(data.startTime !== undefined && { startTime: data.startTime }),
          ...(data.endTime !== undefined && { endTime: data.endTime }),
          ...(data.breakMinutes !== undefined && { breakMinutes: data.breakMinutes }),
          ...(data.color !== undefined && { color: data.color }),
        },
      });

      if (result.count === 0) {
        throw new NotFoundException(`Shift type ${id} not found for this clinic`);
      }

      return this.prisma.clinicShiftType.findUnique({ where: { id } });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'A shift type with this code already exists for this clinic.',
        );
      }
      throw err;
    }
  }

  async deleteSingleShiftType(clinicId: string, id: string) {
    // Check if any planning rules reference this shift type code
    const shiftType = await this.prisma.clinicShiftType.findFirst({
      where: { id, clinicId },
    });

    if (!shiftType) {
      throw new NotFoundException(`Shift type ${id} not found for this clinic`);
    }

    const referencingRules = await this.prisma.planningRule.findMany({
      where: { clinicId },
      select: { id: true, name: true, config: true },
    });

    const blockedBy = referencingRules.filter((rule) => {
      const config = rule.config as Record<string, unknown> | null;
      return config && (config as Record<string, unknown>).shiftTypeCode === shiftType.code;
    });

    if (blockedBy.length > 0) {
      const ruleNames = blockedBy.map((r) => r.name).join(', ');
      throw new ConflictException(
        `Cannot delete shift type "${shiftType.name}": referenced by planning rules: ${ruleNames}`,
      );
    }

    await this.prisma.clinicShiftType.deleteMany({
      where: { id, clinicId },
    });

    return { deleted: true };
  }

  async updateOperationalConfig(
    clinicId: string,
    data: UpdateClinicOperationalConfigInput,
  ) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true },
    });

    if (!clinic) {
      throw new NotFoundException(`Clinic ${clinicId} not found`);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.clinicConfig.upsert({
          where: { clinicId },
          create: {
            clinicId,
            workDays: data.workDays,
            defaultStartTime: data.defaultStartTime,
            defaultEndTime: data.defaultEndTime,
          },
          update: {
            workDays: data.workDays,
            defaultStartTime: data.defaultStartTime,
            defaultEndTime: data.defaultEndTime,
          },
        });

        await tx.clinicClosedDay.deleteMany({ where: { clinicId } });
        if (data.closedDays.length > 0) {
          await tx.clinicClosedDay.createMany({
            data: data.closedDays.map((entry) => ({
              clinicId,
              date: new Date(`${entry.date}T00:00:00.000Z`),
              reason: entry.reason?.trim() ? entry.reason.trim() : null,
            })),
          });
        }

        await tx.clinicSpecialDay.deleteMany({ where: { clinicId } });
        if (data.specialDays.length > 0) {
          await tx.clinicSpecialDay.createMany({
            data: data.specialDays.map((entry) => ({
              clinicId,
              date: new Date(`${entry.date}T00:00:00.000Z`),
              startTime: entry.startTime,
              endTime: entry.endTime,
              label: entry.label?.trim() ? entry.label.trim() : null,
            })),
          });
        }
      });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'Duplicate date found in operational configuration. Each date can only appear once per clinic.',
        );
      }
      this.logger.error(`Failed to update operational config for clinic ${clinicId}`, err);
      throw err;
    }

    return this.getOperationalConfig(clinicId);
  }
}
