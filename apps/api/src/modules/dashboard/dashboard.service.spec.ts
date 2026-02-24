import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;

  const clinicId = 'clinic-123';

  const mockPrismaService = {
    employee: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    absence: {
      count: jest.fn(),
    },
    varianceEvent: {
      count: jest.fn(),
    },
    shift: {
      findMany: jest.fn(),
    },
    apprenticeMonthDeclaration: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    jest.clearAllMocks();
  });

  describe('getStats', () => {
    const setupDefaultMocks = () => {
      mockPrismaService.employee.count
        .mockResolvedValueOnce(12)  // activeEmployees
        .mockResolvedValueOnce(3)   // totalApprentices
        .mockResolvedValueOnce(1);  // apprenticesWithSchool
      mockPrismaService.employee.groupBy.mockResolvedValue([
        { jobType: 'VET', _count: { id: 5 } },
        { jobType: 'ASV', _count: { id: 4 } },
        { jobType: 'APPRENTICE', _count: { id: 3 } },
      ]);
      mockPrismaService.absence.count.mockResolvedValue(3);
      mockPrismaService.varianceEvent.count.mockResolvedValue(2);
      mockPrismaService.shift.findMany.mockResolvedValue([
        { startTime: '08:00', endTime: '18:00', breakMinutes: 60 },
        { startTime: '09:00', endTime: '17:00', breakMinutes: 30 },
      ]);
      mockPrismaService.apprenticeMonthDeclaration.count.mockResolvedValue(1);
    };

    it('should return all dashboard stats', async () => {
      setupDefaultMocks();

      const result = await service.getStats(clinicId);

      expect(result.activeEmployees).toBe(12);
      expect(result.pendingRequests).toBe(5); // 3 absences + 2 variances
      expect(result.pendingAbsences).toBe(3);
      expect(result.pendingVariances).toBe(2);
      expect(result.totalShifts).toBe(2);
      expect(result.weekNumber).toBeGreaterThan(0);
      expect(result.undeclaredApprenticeCount).toBe(1); // 3 total - 1 school - 1 no-school
      expect(result.monthLabel).toMatch(/^\d{4}-\d{2}$/);
    });

    it('should calculate gross planned hours (without subtracting breaks)', async () => {
      setupDefaultMocks();

      const result = await service.getStats(clinicId);

      // Shift 1: (18-8)*60 = 600 min, Shift 2: (17-9)*60 = 480 min
      // Total: 1080 min = 18h
      expect(result.monthlyPlannedHours).toBe(18);
    });

    it('should build job type breakdown', async () => {
      setupDefaultMocks();

      const result = await service.getStats(clinicId);

      expect(result.jobTypeBreakdown).toEqual({
        VET: 5,
        ASV: 4,
        APPRENTICE: 3,
      });
    });

    it('should execute 8 parallel queries', async () => {
      setupDefaultMocks();

      await service.getStats(clinicId);

      // employee.count called 3 times (active + total apprentices + apprentices with school)
      expect(mockPrismaService.employee.count).toHaveBeenCalledTimes(3);
      expect(mockPrismaService.employee.groupBy).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.absence.count).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.varianceEvent.count).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.shift.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.apprenticeMonthDeclaration.count).toHaveBeenCalledTimes(1);
    });

    it('should filter shifts by current month', async () => {
      setupDefaultMocks();

      await service.getStats(clinicId);

      expect(mockPrismaService.shift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinicId,
            date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should return 0 planned hours when no shifts exist', async () => {
      mockPrismaService.employee.count
        .mockResolvedValueOnce(0)  // activeEmployees
        .mockResolvedValueOnce(0)  // totalApprentices
        .mockResolvedValueOnce(0); // apprenticesWithSchool
      mockPrismaService.employee.groupBy.mockResolvedValue([]);
      mockPrismaService.absence.count.mockResolvedValue(0);
      mockPrismaService.varianceEvent.count.mockResolvedValue(0);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.apprenticeMonthDeclaration.count.mockResolvedValue(0);

      const result = await service.getStats(clinicId);

      expect(result.monthlyPlannedHours).toBe(0);
      expect(result.totalShifts).toBe(0);
      expect(result.pendingRequests).toBe(0);
    });

    it('should count undeclared apprentices using contractType and checking NO_SCHOOL_THIS_MONTH', async () => {
      setupDefaultMocks();

      await service.getStats(clinicId);

      // Second call to employee.count is for totalApprentices (contractType)
      const secondCall = mockPrismaService.employee.count.mock.calls[1][0];
      expect(secondCall.where.contractType).toBe('APPRENTICESHIP');

      // Third call to employee.count is for apprenticesWithSchool
      const thirdCall = mockPrismaService.employee.count.mock.calls[2][0];
      expect(thirdCall.where.contractType).toBe('APPRENTICESHIP');
      expect(thirdCall.where.unavailabilities).toBeDefined();

      // apprenticeMonthDeclaration.count checks for NO_SCHOOL_THIS_MONTH
      expect(mockPrismaService.apprenticeMonthDeclaration.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinicId,
            status: 'NO_SCHOOL_THIS_MONTH',
          }),
        }),
      );
    });

    it('should clamp undeclared apprentice count to 0 minimum', async () => {
      mockPrismaService.employee.count
        .mockResolvedValueOnce(5)   // activeEmployees
        .mockResolvedValueOnce(2)   // totalApprentices
        .mockResolvedValueOnce(2);  // apprenticesWithSchool (all declared via school)
      mockPrismaService.employee.groupBy.mockResolvedValue([]);
      mockPrismaService.absence.count.mockResolvedValue(0);
      mockPrismaService.varianceEvent.count.mockResolvedValue(0);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.apprenticeMonthDeclaration.count.mockResolvedValue(1); // +1 no-school (overlap edge)

      const result = await service.getStats(clinicId);

      // 2 - 2 - 1 = -1 → clamped to 0
      expect(result.undeclaredApprenticeCount).toBe(0);
    });
  });
});
