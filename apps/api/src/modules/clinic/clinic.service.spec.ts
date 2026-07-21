import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ClinicService } from './clinic.service';
import { PrismaService } from '@/prisma/prisma.service';
import type { WorkDay } from '@pawly/validators';
import { STATUTORY_RULE_NAME } from '@/modules/planning/french-labor-law';

jest.mock('@/common/utils/slug', () => ({
  generateSlug: jest.fn(
    (name: string) => `${name.toLowerCase().replace(/\s+/g, '-')}-abcd1234`,
  ),
}));

import { generateSlug } from '@/common/utils/slug';

describe('ClinicService', () => {
  let service: ClinicService;

  const mockPrismaService = {
    clinic: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    clinicConfig: {
      upsert: jest.fn(),
    },
    clinicShiftType: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    clinicClosedDay: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    clinicSpecialDay: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    planningRule: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClinicService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ClinicService>(ClinicService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // getClinicById
  // ---------------------------------------------------------------------------
  describe('getClinicById', () => {
    const clinicId = 'clinic-uuid-1';

    it('should return the clinic with config and shiftTypes', async () => {
      const mockClinic = {
        id: clinicId,
        name: 'Happy Paws',
        slug: 'happy-paws-abcd1234',
        onboardingCompleted: false,
        config: {
          workDays: [
            'MONDAY',
            'TUESDAY',
            'WEDNESDAY',
            'THURSDAY',
            'FRIDAY',
          ] as WorkDay[],
          defaultStartTime: '08:00',
          defaultEndTime: '18:00',
        },
        shiftTypes: [
          {
            id: 'st-1',
            name: 'Morning',
            code: 'AM',
            startTime: '08:00',
            endTime: '12:00',
            color: '#00FF00',
          },
        ],
      };

      mockPrismaService.clinic.findUnique.mockResolvedValue(mockClinic);

      const result = await service.getClinicById(clinicId);

      expect(mockPrismaService.clinic.findUnique).toHaveBeenCalledWith({
        where: { id: clinicId },
        include: { config: true, shiftTypes: true },
      });
      expect(result).toEqual(mockClinic);
    });

    it('should throw NotFoundException if clinic is not found', async () => {
      mockPrismaService.clinic.findUnique.mockResolvedValue(null);

      await expect(service.getClinicById(clinicId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getClinicById(clinicId)).rejects.toThrow(
        `Clinic ${clinicId} not found`,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // updateClinicName
  // ---------------------------------------------------------------------------
  describe('updateClinicName', () => {
    const clinicId = 'clinic-uuid-2';
    const input = { clinicName: 'New Clinic Name' };

    it('should update the name and regenerate the slug', async () => {
      const existingClinic = {
        id: clinicId,
        name: 'Old Name',
        slug: 'old-name-0000ffff',
      };
      const updatedClinic = {
        id: clinicId,
        name: 'New Clinic Name',
        slug: 'new-clinic-name-abcd1234',
      };

      mockPrismaService.clinic.findUnique.mockResolvedValue(existingClinic);
      mockPrismaService.clinic.update.mockResolvedValue(updatedClinic);

      const result = await service.updateClinicName(clinicId, input);

      expect(mockPrismaService.clinic.findUnique).toHaveBeenCalledWith({
        where: { id: clinicId },
      });
      expect(generateSlug).toHaveBeenCalledWith('New Clinic Name');
      expect(mockPrismaService.clinic.update).toHaveBeenCalledWith({
        where: { id: clinicId },
        data: {
          name: 'New Clinic Name',
          slug: 'new-clinic-name-abcd1234',
        },
      });
      expect(result).toEqual(updatedClinic);
    });

    it('should throw NotFoundException if clinic is not found', async () => {
      mockPrismaService.clinic.findUnique.mockResolvedValue(null);

      await expect(service.updateClinicName(clinicId, input)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.clinic.update).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // upsertClinicConfig
  // ---------------------------------------------------------------------------
  describe('upsertClinicConfig', () => {
    const clinicId = 'clinic-uuid-3';
    const configData = {
      workDays: [
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
      ] as WorkDay[],
      defaultStartTime: '09:00',
      defaultEndTime: '17:00',
    };

    it('should create a new config on first call (upsert create path)', async () => {
      const createdConfig = { id: 'config-1', clinicId, ...configData };
      mockPrismaService.clinicConfig.upsert.mockResolvedValue(createdConfig);

      const result = await service.upsertClinicConfig(clinicId, configData);

      expect(mockPrismaService.clinicConfig.upsert).toHaveBeenCalledWith({
        where: { clinicId },
        create: {
          clinicId,
          workDays: configData.workDays,
          defaultStartTime: configData.defaultStartTime,
          defaultEndTime: configData.defaultEndTime,
          is24_7: false,
        },
        update: {
          workDays: configData.workDays,
          defaultStartTime: configData.defaultStartTime,
          defaultEndTime: configData.defaultEndTime,
          is24_7: false,
        },
      });
      expect(result).toEqual(createdConfig);
    });

    it('should update existing config on subsequent calls (upsert update path)', async () => {
      const updatedConfig = {
        id: 'config-1',
        clinicId,
        workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY'] as WorkDay[],
        defaultStartTime: '10:00',
        defaultEndTime: '16:00',
      };
      const newData = {
        workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY'] as WorkDay[],
        defaultStartTime: '10:00',
        defaultEndTime: '16:00',
      };

      mockPrismaService.clinicConfig.upsert.mockResolvedValue(updatedConfig);

      const result = await service.upsertClinicConfig(clinicId, newData);

      expect(mockPrismaService.clinicConfig.upsert).toHaveBeenCalledWith({
        where: { clinicId },
        create: {
          clinicId,
          workDays: newData.workDays,
          defaultStartTime: newData.defaultStartTime,
          defaultEndTime: newData.defaultEndTime,
          is24_7: false,
        },
        update: {
          workDays: newData.workDays,
          defaultStartTime: newData.defaultStartTime,
          defaultEndTime: newData.defaultEndTime,
          is24_7: false,
        },
      });
      expect(result).toEqual(updatedConfig);
    });

    // AC-1: a true is24_7 must persist through both the create and update paths.
    it('should persist is24_7 true to both create and update', async () => {
      mockPrismaService.clinicConfig.upsert.mockResolvedValue({});

      await service.upsertClinicConfig(clinicId, {
        ...configData,
        is24_7: true,
      });

      expect(mockPrismaService.clinicConfig.upsert).toHaveBeenCalledWith({
        where: { clinicId },
        create: expect.objectContaining({ is24_7: true }),
        update: expect.objectContaining({ is24_7: true }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getOperationalConfig
  // ---------------------------------------------------------------------------
  describe('getOperationalConfig', () => {
    // AC-4: getOperationalConfig must include is24_7 in the normalized contract.
    it('exposes is24_7 in the normalized operational config', async () => {
      mockPrismaService.clinic.findUnique.mockResolvedValue({
        id: 'clinic-1',
        config: {
          workDays: ['MONDAY'],
          defaultStartTime: '00:00',
          defaultEndTime: '00:00',
          is24_7: true,
        },
        closedDays: [],
        specialDays: [],
      });

      const result = await service.getOperationalConfig('clinic-1');

      expect(result.is24_7).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // createShiftTypes
  // ---------------------------------------------------------------------------
  describe('createShiftTypes', () => {
    const clinicId = 'clinic-uuid-4';
    const shiftTypesInput = {
      shiftTypes: [
        {
          name: 'Morning',
          code: 'AM',
          startTime: '08:00',
          endTime: '12:00',
          breakMinutes: 0,
          color: '#00FF00',
        },
        {
          name: 'Afternoon',
          code: 'PM',
          startTime: '12:00',
          endTime: '18:00',
          breakMinutes: 0,
          color: '#0000FF',
        },
      ],
    };

    it('should delete existing shift types and create new ones in a transaction', async () => {
      const createManyResult = { count: 2 };

      // The $transaction mock receives a callback; we execute it with our mock prisma
      mockPrismaService.$transaction.mockImplementation(
        async (cb: (tx: any) => Promise<any>) => {
          return cb(mockPrismaService);
        },
      );
      mockPrismaService.clinicShiftType.deleteMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.clinicShiftType.createMany.mockResolvedValue(
        createManyResult,
      );

      const result = await service.createShiftTypes(clinicId, shiftTypesInput);

      expect(mockPrismaService.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
      );
      expect(mockPrismaService.clinicShiftType.deleteMany).toHaveBeenCalledWith(
        {
          where: { clinicId },
        },
      );
      expect(mockPrismaService.clinicShiftType.createMany).toHaveBeenCalledWith(
        {
          data: [
            {
              clinicId,
              name: 'Morning',
              code: 'AM',
              startTime: '08:00',
              endTime: '12:00',
              breakMinutes: 0,
              color: '#00FF00',
            },
            {
              clinicId,
              name: 'Afternoon',
              code: 'PM',
              startTime: '12:00',
              endTime: '18:00',
              breakMinutes: 0,
              color: '#0000FF',
            },
          ],
        },
      );
      expect(result).toEqual(createManyResult);
    });

    // Story 13-3 (KON-132), aped-review M4 — AC-5 "and persisted": the validators
    // now accept an overnight shift type; prove the service writes 22:00 -> 06:00
    // through to the DB unaltered (persistence, not just acceptance).
    it('persists an overnight shift type (22:00 -> 06:00) with its times intact', async () => {
      mockPrismaService.$transaction.mockImplementation(
        async (cb: (tx: any) => Promise<any>) => cb(mockPrismaService),
      );
      mockPrismaService.clinicShiftType.deleteMany.mockResolvedValue({
        count: 0,
      });
      mockPrismaService.clinicShiftType.createMany.mockResolvedValue({
        count: 1,
      });

      await service.createShiftTypes(clinicId, {
        shiftTypes: [
          {
            name: 'Night',
            code: 'NIGHT',
            startTime: '22:00',
            endTime: '06:00',
            breakMinutes: 0,
            color: '#123456',
          },
        ],
      });

      expect(mockPrismaService.clinicShiftType.createMany).toHaveBeenCalledWith(
        {
          data: [
            {
              clinicId,
              name: 'Night',
              code: 'NIGHT',
              startTime: '22:00',
              endTime: '06:00',
              breakMinutes: 0,
              color: '#123456',
            },
          ],
        },
      );
    });

    it('should throw ConflictException on P2002 duplicate code error', async () => {
      const prismaError = {
        code: 'P2002',
        message: 'Unique constraint failed',
      };

      mockPrismaService.$transaction.mockRejectedValue(prismaError);

      await expect(
        service.createShiftTypes(clinicId, shiftTypesInput),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.createShiftTypes(clinicId, shiftTypesInput),
      ).rejects.toThrow(
        'Duplicate shift type code found. Each shift type must have a unique code.',
      );
    });

    it('should re-throw non-P2002 errors as-is', async () => {
      const genericError = new Error('Database connection lost');

      mockPrismaService.$transaction.mockRejectedValue(genericError);

      await expect(
        service.createShiftTypes(clinicId, shiftTypesInput),
      ).rejects.toThrow('Database connection lost');
    });
  });

  // ---------------------------------------------------------------------------
  // completeOnboarding
  // ---------------------------------------------------------------------------
  // Story 13-3 (KON-132), aped-review M4 — AC-5 also covers "in settings", whose
  // path is createSingleShiftType. Prove that path persists an overnight shift type
  // unaltered too (the schema change this story made is what unlocks it).
  describe('createSingleShiftType', () => {
    const clinicId = 'clinic-uuid-single';

    it('persists an overnight shift type (22:00 -> 06:00) with its times intact', async () => {
      mockPrismaService.clinicShiftType.create.mockResolvedValue({
        id: 'st-night',
      });

      await service.createSingleShiftType(clinicId, {
        name: 'Night',
        code: 'NIGHT',
        startTime: '22:00',
        endTime: '06:00',
        breakMinutes: 0,
        color: '#123456',
      });

      expect(mockPrismaService.clinicShiftType.create).toHaveBeenCalledWith({
        data: {
          clinicId,
          name: 'Night',
          code: 'NIGHT',
          startTime: '22:00',
          endTime: '06:00',
          breakMinutes: 0,
          color: '#123456',
        },
      });
    });
  });

  // Story 13-4 (KON-136), aped-review F5 — a partial PATCH cannot be validated by the pure zod
  // schema against the persisted row, so updateSingleShiftType re-reads the row and validates the
  // MERGED result. Two adversarially-reachable bypasses (widen hours w/o break; strip break) must
  // be rejected server-side; a patch that does not touch the workload must not be blocked.
  describe('updateSingleShiftType break garde-fou (aped-review F5)', () => {
    const clinicId = 'clinic-upd';

    it('rejects a patch that widens hours past 6h without supplying a break', async () => {
      mockPrismaService.clinicShiftType.findFirst.mockResolvedValue({
        id: 'st-1',
        clinicId,
        startTime: '08:00',
        endTime: '14:00', // legal now (6h net, 0 break)
        breakMinutes: 0,
      });
      await expect(
        service.updateSingleShiftType(clinicId, 'st-1', { endTime: '17:00' }),
      ).rejects.toThrow(/20-minute break/);
      expect(
        mockPrismaService.clinicShiftType.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('rejects a patch that strips the break from an already >6h type', async () => {
      mockPrismaService.clinicShiftType.findFirst.mockResolvedValue({
        id: 'st-2',
        clinicId,
        startTime: '08:00',
        endTime: '15:20', // 7h20 gross
        breakMinutes: 20, // legal now (net 7h, 20 break)
      });
      await expect(
        service.updateSingleShiftType(clinicId, 'st-2', { breakMinutes: 0 }),
      ).rejects.toThrow(/20-minute break/);
      expect(
        mockPrismaService.clinicShiftType.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('accepts a name-only patch without re-reading or blocking (workload untouched)', async () => {
      mockPrismaService.clinicShiftType.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.clinicShiftType.findUnique.mockResolvedValue({
        id: 'st-3',
      });
      await service.updateSingleShiftType(clinicId, 'st-3', {
        name: 'Renamed',
      });
      expect(
        mockPrismaService.clinicShiftType.findFirst,
      ).not.toHaveBeenCalled();
      expect(mockPrismaService.clinicShiftType.updateMany).toHaveBeenCalled();
    });

    it('accepts a workload patch whose merged result is legal', async () => {
      mockPrismaService.clinicShiftType.findFirst.mockResolvedValue({
        id: 'st-4',
        clinicId,
        startTime: '08:00',
        endTime: '15:00', // 7h gross
        breakMinutes: 0,
      });
      mockPrismaService.clinicShiftType.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.clinicShiftType.findUnique.mockResolvedValue({
        id: 'st-4',
      });
      await service.updateSingleShiftType(clinicId, 'st-4', {
        breakMinutes: 20,
      });
      expect(mockPrismaService.clinicShiftType.updateMany).toHaveBeenCalled();
    });
  });

  describe('completeOnboarding', () => {
    const clinicId = 'clinic-uuid-5';
    const onboardingData = {
      clinicName: 'Pawly Clinic',
      workDays: [
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
      ] as WorkDay[],
      defaultStartTime: '08:00',
      defaultEndTime: '18:00',
      is24_7: false,
      shiftTypes: [
        {
          name: 'Morning',
          code: 'AM',
          startTime: '08:00',
          endTime: '12:00',
          breakMinutes: 0,
          color: '#00FF00',
        },
        {
          name: 'Afternoon',
          code: 'PM',
          startTime: '12:00',
          endTime: '18:00',
          breakMinutes: 0,
          color: '#0000FF',
        },
      ],
    };

    it('should set onboardingCompleted to true and wrap all operations in a transaction', async () => {
      const existingClinic = {
        id: clinicId,
        name: 'Unnamed',
        onboardingCompleted: false,
      };

      // First call: findUnique (outside transaction)
      mockPrismaService.clinic.findUnique.mockResolvedValue(existingClinic);

      // Transaction mock: executes the callback with mockPrismaService as tx
      mockPrismaService.$transaction.mockImplementation(
        async (cb: (tx: any) => Promise<any>) => {
          return cb(mockPrismaService);
        },
      );
      mockPrismaService.clinic.update.mockResolvedValue({
        id: clinicId,
        name: 'Pawly Clinic',
        slug: 'pawly-clinic-abcd1234',
        onboardingCompleted: true,
      });
      mockPrismaService.clinicConfig.upsert.mockResolvedValue({});
      mockPrismaService.clinicShiftType.deleteMany.mockResolvedValue({
        count: 0,
      });
      mockPrismaService.clinicShiftType.createMany.mockResolvedValue({
        count: 2,
      });

      const result = await service.completeOnboarding(clinicId, onboardingData);

      // Verify clinic existence check
      expect(mockPrismaService.clinic.findUnique).toHaveBeenCalledWith({
        where: { id: clinicId },
      });

      // Verify transaction was called
      expect(mockPrismaService.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
      );

      // Verify clinic update inside transaction
      expect(mockPrismaService.clinic.update).toHaveBeenCalledWith({
        where: { id: clinicId },
        data: {
          name: 'Pawly Clinic',
          slug: 'pawly-clinic-abcd1234',
          onboardingCompleted: true,
        },
      });

      // Verify clinicConfig upsert inside transaction
      expect(mockPrismaService.clinicConfig.upsert).toHaveBeenCalledWith({
        where: { clinicId },
        create: {
          clinicId,
          workDays: onboardingData.workDays,
          defaultStartTime: onboardingData.defaultStartTime,
          defaultEndTime: onboardingData.defaultEndTime,
          is24_7: false,
        },
        update: {
          workDays: onboardingData.workDays,
          defaultStartTime: onboardingData.defaultStartTime,
          defaultEndTime: onboardingData.defaultEndTime,
          is24_7: false,
        },
      });

      // Verify shift types replacement inside transaction
      expect(mockPrismaService.clinicShiftType.deleteMany).toHaveBeenCalledWith(
        {
          where: { clinicId },
        },
      );
      expect(mockPrismaService.clinicShiftType.createMany).toHaveBeenCalledWith(
        {
          data: [
            {
              clinicId,
              name: 'Morning',
              code: 'AM',
              startTime: '08:00',
              endTime: '12:00',
              breakMinutes: 0,
              color: '#00FF00',
            },
            {
              clinicId,
              name: 'Afternoon',
              code: 'PM',
              startTime: '12:00',
              endTime: '18:00',
              breakMinutes: 0,
              color: '#0000FF',
            },
          ],
        },
      );

      expect(result).toEqual({ onboardingCompleted: true });
    });

    it('should throw NotFoundException if clinic is not found', async () => {
      mockPrismaService.clinic.findUnique.mockResolvedValue(null);

      await expect(
        service.completeOnboarding(clinicId, onboardingData),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should call generateSlug with the new clinic name', async () => {
      mockPrismaService.clinic.findUnique.mockResolvedValue({ id: clinicId });
      mockPrismaService.$transaction.mockImplementation(
        async (cb: (tx: any) => Promise<any>) => {
          return cb(mockPrismaService);
        },
      );
      mockPrismaService.clinic.update.mockResolvedValue({});
      mockPrismaService.clinicConfig.upsert.mockResolvedValue({});
      mockPrismaService.clinicShiftType.deleteMany.mockResolvedValue({
        count: 0,
      });
      mockPrismaService.clinicShiftType.createMany.mockResolvedValue({
        count: 0,
      });

      await service.completeOnboarding(clinicId, onboardingData);

      expect(generateSlug).toHaveBeenCalledWith('Pawly Clinic');
    });

    it('should throw ConflictException on P2002 duplicate shift code error', async () => {
      const prismaError = {
        code: 'P2002',
        message: 'Unique constraint failed',
        meta: { target: ['clinicId', 'code'] },
      };

      mockPrismaService.clinic.findUnique.mockResolvedValue({ id: clinicId });
      mockPrismaService.$transaction.mockRejectedValue(prismaError);

      await expect(
        service.completeOnboarding(clinicId, onboardingData),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.completeOnboarding(clinicId, onboardingData),
      ).rejects.toThrow(
        'Duplicate shift type code found. Each shift type must have a unique code.',
      );
    });

    it('should throw ConflictException with slug message on P2002 slug collision', async () => {
      const prismaError = {
        code: 'P2002',
        message: 'Unique constraint failed',
        meta: { target: ['slug'] },
      };

      mockPrismaService.clinic.findUnique.mockResolvedValue({ id: clinicId });
      mockPrismaService.$transaction.mockRejectedValue(prismaError);

      await expect(
        service.completeOnboarding(clinicId, onboardingData),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.completeOnboarding(clinicId, onboardingData),
      ).rejects.toThrow(
        'A clinic with this name already exists. Please choose a different name.',
      );
    });

    it('should re-throw non-P2002 errors from completeOnboarding transaction', async () => {
      const genericError = new Error('Database connection lost');

      mockPrismaService.clinic.findUnique.mockResolvedValue({ id: clinicId });
      mockPrismaService.$transaction.mockRejectedValue(genericError);

      await expect(
        service.completeOnboarding(clinicId, onboardingData),
      ).rejects.toThrow('Database connection lost');
    });

    // AC4 (verbatim from story 11-3): "When onboarding finishes, Then a visible,
    // non-disableable 'French labor-law limits' rule appears in the clinic's planning rules".
    const primeOnboardingMocks = () => {
      mockPrismaService.clinic.findUnique.mockResolvedValue({ id: clinicId });
      mockPrismaService.$transaction.mockImplementation(
        async (cb: (tx: any) => Promise<any>) => cb(mockPrismaService),
      );
      mockPrismaService.clinic.update.mockResolvedValue({});
      mockPrismaService.clinicConfig.upsert.mockResolvedValue({});
      mockPrismaService.clinicShiftType.deleteMany.mockResolvedValue({
        count: 0,
      });
      mockPrismaService.clinicShiftType.createMany.mockResolvedValue({
        count: 2,
      });
    };

    it('seeds the visible French labor-law statutory rule as a HARD rule', async () => {
      primeOnboardingMocks();
      mockPrismaService.planningRule.findFirst.mockResolvedValue(null); // none yet

      await service.completeOnboarding(clinicId, onboardingData);

      expect(mockPrismaService.planningRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clinicId,
          name: STATUTORY_RULE_NAME,
          ruleType: 'HARD',
          category: 'CONTRACT_COMPLIANCE',
          isActive: true,
          config: expect.objectContaining({
            minDailyRestHours: 11,
            maxWeeklyStatutoryHours: 48,
            minBreakMinutesOver6h: 20,
          }),
        }),
      });
    });

    it('does not seed a duplicate statutory rule (idempotent)', async () => {
      primeOnboardingMocks();
      mockPrismaService.planningRule.findFirst.mockResolvedValue({
        id: 'existing-statutory',
      });

      await service.completeOnboarding(clinicId, onboardingData);

      expect(mockPrismaService.planningRule.create).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getOnboardingStatus
  // ---------------------------------------------------------------------------
  describe('getOnboardingStatus', () => {
    const clinicId = 'clinic-uuid-6';

    it('should return the complete onboarding status', async () => {
      const mockClinic = {
        id: clinicId,
        name: 'Pawly Clinic',
        onboardingCompleted: true,
        config: {
          workDays: [
            'MONDAY',
            'TUESDAY',
            'WEDNESDAY',
            'THURSDAY',
            'FRIDAY',
          ] as WorkDay[],
          defaultStartTime: '08:00',
          defaultEndTime: '18:00',
        },
        shiftTypes: [
          {
            id: 'st-1',
            name: 'Morning',
            code: 'AM',
            startTime: '08:00',
            endTime: '12:00',
            color: '#00FF00',
          },
        ],
      };

      mockPrismaService.clinic.findUnique.mockResolvedValue(mockClinic);

      const result = await service.getOnboardingStatus(clinicId);

      expect(mockPrismaService.clinic.findUnique).toHaveBeenCalledWith({
        where: { id: clinicId },
        include: { config: true, shiftTypes: true },
      });
      expect(result).toEqual({
        onboardingCompleted: true,
        clinicName: 'Pawly Clinic',
        config: mockClinic.config,
        shiftTypes: mockClinic.shiftTypes,
      });
    });

    it('should return status with null config and empty shiftTypes when not yet configured', async () => {
      const mockClinic = {
        id: clinicId,
        name: 'Unnamed Clinic',
        onboardingCompleted: false,
        config: null,
        shiftTypes: [],
      };

      mockPrismaService.clinic.findUnique.mockResolvedValue(mockClinic);

      const result = await service.getOnboardingStatus(clinicId);

      expect(result).toEqual({
        onboardingCompleted: false,
        clinicName: 'Unnamed Clinic',
        config: null,
        shiftTypes: [],
      });
    });

    it('should throw NotFoundException if clinic is not found', async () => {
      mockPrismaService.clinic.findUnique.mockResolvedValue(null);

      await expect(service.getOnboardingStatus(clinicId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getOnboardingStatus(clinicId)).rejects.toThrow(
        `Clinic ${clinicId} not found`,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getOperationalConfig
  // ---------------------------------------------------------------------------
  describe('getOperationalConfig', () => {
    const clinicId = 'clinic-uuid-7';

    it('should return normalized operational config for planning consumption', async () => {
      mockPrismaService.clinic.findUnique.mockResolvedValue({
        id: clinicId,
        config: {
          workDays: ['MONDAY', 'TUESDAY'],
          defaultStartTime: '08:00',
          defaultEndTime: '18:00',
          is24_7: false,
        },
        closedDays: [
          {
            id: 'cd-1',
            date: new Date('2026-12-25T00:00:00.000Z'),
            reason: 'Holiday',
          },
        ],
        specialDays: [
          {
            id: 'sd-1',
            date: new Date('2026-12-24T00:00:00.000Z'),
            startTime: '09:00',
            endTime: '14:00',
            label: 'Half-day',
          },
        ],
      });

      const result = await service.getOperationalConfig(clinicId);

      expect(mockPrismaService.clinic.findUnique).toHaveBeenCalledWith({
        where: { id: clinicId },
        include: {
          config: true,
          closedDays: { orderBy: { date: 'asc' } },
          specialDays: { orderBy: { date: 'asc' } },
        },
      });
      expect(result).toEqual({
        workDays: ['MONDAY', 'TUESDAY'],
        defaultStartTime: '08:00',
        defaultEndTime: '18:00',
        is24_7: false,
        closedDays: [{ id: 'cd-1', date: '2026-12-25', reason: 'Holiday' }],
        specialDays: [
          {
            id: 'sd-1',
            date: '2026-12-24',
            startTime: '09:00',
            endTime: '14:00',
            label: 'Half-day',
          },
        ],
      });
    });

    it('should throw NotFoundException when clinic does not exist', async () => {
      mockPrismaService.clinic.findUnique.mockResolvedValue(null);

      await expect(service.getOperationalConfig(clinicId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // updateOperationalConfig
  // ---------------------------------------------------------------------------
  describe('updateOperationalConfig', () => {
    const clinicId = 'clinic-uuid-8';
    const payload = {
      workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY'] as WorkDay[],
      defaultStartTime: '08:30',
      defaultEndTime: '18:30',
      closedDays: [{ date: '2026-12-25', reason: 'Christmas' }],
      specialDays: [
        {
          date: '2026-12-24',
          startTime: '09:00',
          endTime: '14:00',
          label: 'Half-day',
        },
      ],
    };

    it('should upsert config and replace closed/special days in one transaction', async () => {
      mockPrismaService.clinic.findUnique.mockResolvedValue({
        id: clinicId,
        config: {
          workDays: payload.workDays,
          defaultStartTime: payload.defaultStartTime,
          defaultEndTime: payload.defaultEndTime,
        },
        closedDays: [
          {
            id: 'cd-1',
            date: new Date('2026-12-25T00:00:00.000Z'),
            reason: 'Christmas',
          },
        ],
        specialDays: [
          {
            id: 'sd-1',
            date: new Date('2026-12-24T00:00:00.000Z'),
            startTime: '09:00',
            endTime: '14:00',
            label: 'Half-day',
          },
        ],
      });
      mockPrismaService.$transaction.mockImplementation(
        async (cb: (tx: any) => Promise<any>) => {
          return cb(mockPrismaService);
        },
      );
      mockPrismaService.clinicConfig.upsert.mockResolvedValue({});
      mockPrismaService.clinicClosedDay.deleteMany.mockResolvedValue({
        count: 0,
      });
      mockPrismaService.clinicClosedDay.createMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.clinicSpecialDay.deleteMany.mockResolvedValue({
        count: 0,
      });
      mockPrismaService.clinicSpecialDay.createMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.updateOperationalConfig(clinicId, payload);

      expect(mockPrismaService.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
      );
      expect(mockPrismaService.clinicConfig.upsert).toHaveBeenCalled();
      expect(mockPrismaService.clinicClosedDay.deleteMany).toHaveBeenCalledWith(
        {
          where: { clinicId },
        },
      );
      expect(mockPrismaService.clinicClosedDay.createMany).toHaveBeenCalledWith(
        {
          data: [
            {
              clinicId,
              date: new Date('2026-12-25T00:00:00.000Z'),
              reason: 'Christmas',
            },
          ],
        },
      );
      expect(
        mockPrismaService.clinicSpecialDay.deleteMany,
      ).toHaveBeenCalledWith({
        where: { clinicId },
      });
      expect(
        mockPrismaService.clinicSpecialDay.createMany,
      ).toHaveBeenCalledWith({
        data: [
          {
            clinicId,
            date: new Date('2026-12-24T00:00:00.000Z'),
            startTime: '09:00',
            endTime: '14:00',
            label: 'Half-day',
          },
        ],
      });
      expect(result.workDays).toEqual(payload.workDays);
    });

    it('should throw NotFoundException when clinic does not exist', async () => {
      mockPrismaService.clinic.findUnique.mockResolvedValue(null);

      await expect(
        service.updateOperationalConfig(clinicId, payload),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
