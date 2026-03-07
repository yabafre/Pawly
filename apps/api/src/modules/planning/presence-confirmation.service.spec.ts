import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PresenceConfirmationService } from './presence-confirmation.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('PresenceConfirmationService', () => {
  let service: PresenceConfirmationService;

  const clinicId = 'clinic-123';
  const employeeId = 'emp-1';
  const shiftId = 'shift-1';

  // Yesterday for tests to always be in the past
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const shiftDate = new Date(
    Date.UTC(
      yesterday.getUTCFullYear(),
      yesterday.getUTCMonth(),
      yesterday.getUTCDate(),
    ),
  );
  const shiftMonth = `${shiftDate.getUTCFullYear()}-${String(shiftDate.getUTCMonth() + 1).padStart(2, '0')}`;

  const mockShift = {
    id: shiftId,
    employeeId,
    clinicId,
    date: shiftDate,
    startTime: '08:30',
    endTime: '18:30',
    isConfirmed: false,
  };

  const mockPrismaService = {
    shift: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    planningPeriodStatus: {
      findUnique: jest.fn(),
    },
    varianceEvent: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresenceConfirmationService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<PresenceConfirmationService>(PresenceConfirmationService);
    jest.clearAllMocks();

    // Default: $transaction executes callback with the mock prisma
    mockPrismaService.$transaction.mockImplementation((cb) => cb(mockPrismaService));
  });

  // ── confirmPresence ─────────────────────────────────────────────────

  describe('confirmPresence', () => {
    beforeEach(() => {
      mockPrismaService.shift.findUnique.mockResolvedValue(mockShift);
      mockPrismaService.planningPeriodStatus.findUnique.mockResolvedValue({
        status: 'PUBLISHED',
      });
      mockPrismaService.shift.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.varianceEvent.create.mockResolvedValue({});
    });

    it('should confirm a shift and create a VarianceEvent', async () => {
      const actualTime = new Date(
        Date.UTC(
          shiftDate.getUTCFullYear(),
          shiftDate.getUTCMonth(),
          shiftDate.getUTCDate(),
          8, 30, 0,
        ),
      );

      const result = await service.confirmPresence(
        clinicId,
        employeeId,
        shiftId,
        actualTime.toISOString(),
      );

      expect(result.shiftId).toBe(shiftId);
      expect(result.isConfirmed).toBe(true);
      expect(result.varianceType).toBe('CLOCK_IN_DEVIATION');
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should compute deltaMinutes = 0 when within 15min threshold', async () => {
      const actualTime = new Date(
        Date.UTC(
          shiftDate.getUTCFullYear(),
          shiftDate.getUTCMonth(),
          shiftDate.getUTCDate(),
          8, 40, 0,
        ),
      ); // 10 min late, within threshold

      const result = await service.confirmPresence(
        clinicId,
        employeeId,
        shiftId,
        actualTime.toISOString(),
      );

      expect(result.deltaMinutes).toBe(0); // normalized to 0
    });

    it('should compute positive deltaMinutes when late beyond threshold', async () => {
      const actualTime = new Date(
        Date.UTC(
          shiftDate.getUTCFullYear(),
          shiftDate.getUTCMonth(),
          shiftDate.getUTCDate(),
          9, 0, 0,
        ),
      ); // 30 min late

      const result = await service.confirmPresence(
        clinicId,
        employeeId,
        shiftId,
        actualTime.toISOString(),
      );

      expect(result.deltaMinutes).toBe(30);
    });

    it('should compute negative deltaMinutes when early beyond threshold', async () => {
      const actualTime = new Date(
        Date.UTC(
          shiftDate.getUTCFullYear(),
          shiftDate.getUTCMonth(),
          shiftDate.getUTCDate(),
          8, 0, 0,
        ),
      ); // 30 min early

      const result = await service.confirmPresence(
        clinicId,
        employeeId,
        shiftId,
        actualTime.toISOString(),
      );

      expect(result.deltaMinutes).toBe(-30);
    });

    it('should use current time when actualStartTime is not provided', async () => {
      const result = await service.confirmPresence(
        clinicId,
        employeeId,
        shiftId,
      );

      expect(result.shiftId).toBe(shiftId);
      expect(result.isConfirmed).toBe(true);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException when shift not found', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue(null);

      await expect(
        service.confirmPresence(clinicId, employeeId, shiftId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when shift belongs to different employee', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue({
        ...mockShift,
        employeeId: 'other-emp',
      });

      await expect(
        service.confirmPresence(clinicId, employeeId, shiftId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when shift belongs to different clinic', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue({
        ...mockShift,
        clinicId: 'other-clinic',
      });

      await expect(
        service.confirmPresence(clinicId, employeeId, shiftId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return idempotent success when shift already confirmed', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue({
        ...mockShift,
        isConfirmed: true,
      });

      const result = await service.confirmPresence(clinicId, employeeId, shiftId);

      expect(result.isConfirmed).toBe(true);
      expect(result.deltaMinutes).toBe(0);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for future shift', async () => {
      const futureDate = new Date();
      futureDate.setUTCDate(futureDate.getUTCDate() + 5);

      mockPrismaService.shift.findUnique.mockResolvedValue({
        ...mockShift,
        date: futureDate,
      });

      await expect(
        service.confirmPresence(clinicId, employeeId, shiftId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when planning period is DRAFT', async () => {
      mockPrismaService.planningPeriodStatus.findUnique.mockResolvedValue({
        status: 'DRAFT',
      });

      await expect(
        service.confirmPresence(clinicId, employeeId, shiftId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no period status exists', async () => {
      mockPrismaService.planningPeriodStatus.findUnique.mockResolvedValue(null);

      await expect(
        service.confirmPresence(clinicId, employeeId, shiftId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle race condition gracefully (updateMany count=0)', async () => {
      mockPrismaService.shift.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.confirmPresence(clinicId, employeeId, shiftId);

      expect(result.isConfirmed).toBe(true);
      expect(result.deltaMinutes).toBe(0);
    });

    it('should use $transaction callback form (not array)', async () => {
      await service.confirmPresence(clinicId, employeeId, shiftId);

      expect(mockPrismaService.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it('should create VarianceEvent with CLOCK_IN_DEVIATION type', async () => {
      const actualTime = new Date(
        Date.UTC(
          shiftDate.getUTCFullYear(),
          shiftDate.getUTCMonth(),
          shiftDate.getUTCDate(),
          9, 0, 0,
        ),
      );

      await service.confirmPresence(
        clinicId,
        employeeId,
        shiftId,
        actualTime.toISOString(),
      );

      expect(mockPrismaService.varianceEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'CLOCK_IN_DEVIATION',
          shiftId,
          clinicId,
          status: 'PENDING',
        }),
      });
    });

    it('should query PlanningPeriodStatus with correct month', async () => {
      await service.confirmPresence(clinicId, employeeId, shiftId);

      expect(
        mockPrismaService.planningPeriodStatus.findUnique,
      ).toHaveBeenCalledWith({
        where: { clinicId_month: { clinicId, month: shiftMonth } },
      });
    });
  });

  // ── detectNoShows ───────────────────────────────────────────────────

  describe('detectNoShows', () => {
    const targetDate = `${shiftDate.getUTCFullYear()}-${String(shiftDate.getUTCMonth() + 1).padStart(2, '0')}-${String(shiftDate.getUTCDate()).padStart(2, '0')}`;

    beforeEach(() => {
      mockPrismaService.planningPeriodStatus.findUnique.mockResolvedValue({
        status: 'PUBLISHED',
      });
    });

    it('should create NO_SHOW events for unconfirmed shifts via createMany', async () => {
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          id: 'shift-a',
          startTime: '08:30',
          clinicId,
          date: shiftDate,
          varianceEvents: [],
        },
        {
          id: 'shift-b',
          startTime: '14:00',
          clinicId,
          date: shiftDate,
          varianceEvents: [],
        },
      ]);
      mockPrismaService.varianceEvent.createMany.mockResolvedValue({ count: 2 });

      const count = await service.detectNoShows(clinicId, targetDate);

      expect(count).toBe(2);
      expect(mockPrismaService.varianceEvent.createMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.varianceEvent.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ shiftId: 'shift-a', type: 'NO_SHOW' }),
          expect.objectContaining({ shiftId: 'shift-b', type: 'NO_SHOW' }),
        ]),
        skipDuplicates: true,
      });
    });

    it('should create VarianceEvent with type NO_SHOW via batch insert', async () => {
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          id: 'shift-a',
          startTime: '08:30',
          clinicId,
          date: shiftDate,
          varianceEvents: [],
        },
      ]);
      mockPrismaService.varianceEvent.createMany.mockResolvedValue({ count: 1 });

      await service.detectNoShows(clinicId, targetDate);

      expect(mockPrismaService.varianceEvent.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            type: 'NO_SHOW',
            deltaMinutes: 0,
            status: 'PENDING',
            shiftId: 'shift-a',
            clinicId,
          }),
        ],
        skipDuplicates: true,
      });
    });

    it('should skip shifts that already have NO_SHOW events (idempotent)', async () => {
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          id: 'shift-a',
          startTime: '08:30',
          clinicId,
          date: shiftDate,
          varianceEvents: [{ id: 'existing-event' }],
        },
      ]);

      const count = await service.detectNoShows(clinicId, targetDate);

      expect(count).toBe(0);
      expect(mockPrismaService.varianceEvent.createMany).not.toHaveBeenCalled();
    });

    it('should return 0 when period is not PUBLISHED', async () => {
      mockPrismaService.planningPeriodStatus.findUnique.mockResolvedValue({
        status: 'DRAFT',
      });

      const count = await service.detectNoShows(clinicId, targetDate);

      expect(count).toBe(0);
      expect(mockPrismaService.shift.findMany).not.toHaveBeenCalled();
    });

    it('should return 0 when no period status exists', async () => {
      mockPrismaService.planningPeriodStatus.findUnique.mockResolvedValue(null);

      const count = await service.detectNoShows(clinicId, targetDate);

      expect(count).toBe(0);
    });

    it('should return 0 when no unconfirmed shifts found', async () => {
      mockPrismaService.shift.findMany.mockResolvedValue([]);

      const count = await service.detectNoShows(clinicId, targetDate);

      expect(count).toBe(0);
    });

    it('should query shifts with isConfirmed false filter', async () => {
      mockPrismaService.shift.findMany.mockResolvedValue([]);

      await service.detectNoShows(clinicId, targetDate);

      expect(mockPrismaService.shift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinicId,
            isConfirmed: false,
          }),
        }),
      );
    });
  });
});
