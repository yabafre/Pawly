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

    return this.prisma.$transaction(async (tx) => {
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
          color: st.color,
        })),
      });

      return { onboardingCompleted: true };
    });
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
}
