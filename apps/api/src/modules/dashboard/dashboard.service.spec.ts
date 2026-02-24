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
        .mockResolvedValueOnce(12) // activeEmployees
        .mockResolvedValueOnce(2); // undeclaredApprenticeCount
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
      expect(result.undeclaredApprenticeCount).toBe(2);
      expect(result.monthLabel).toMatch(/^\d{4}-\d{2}$/);
    });

    it('should calculate net planned hours (gross - breaks)', async () => {
      setupDefaultMocks();

      const result = await service.getStats(clinicId);

      // Shift 1: (18-8)*60 - 60 = 540 min, Shift 2: (17-9)*60 - 30 = 450 min
      // Total: 990 min = 16.5h → rounded to 17h
      expect(result.monthlyPlannedHours).toBe(17);
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

    it('should execute 6 parallel queries', async () => {
      setupDefaultMocks();

      await service.getStats(clinicId);

      // employee.count called twice (active + undeclared apprentices)
      expect(mockPrismaService.employee.count).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.employee.groupBy).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.absence.count).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.varianceEvent.count).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.shift.findMany).toHaveBeenCalledTimes(1);
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
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrismaService.employee.groupBy.mockResolvedValue([]);
      mockPrismaService.absence.count.mockResolvedValue(0);
      mockPrismaService.varianceEvent.count.mockResolvedValue(0);
      mockPrismaService.shift.findMany.mockResolvedValue([]);

      const result = await service.getStats(clinicId);

      expect(result.monthlyPlannedHours).toBe(0);
      expect(result.totalShifts).toBe(0);
      expect(result.pendingRequests).toBe(0);
    });

    it('should count undeclared apprentices without school unavailabilities', async () => {
      setupDefaultMocks();

      await service.getStats(clinicId);

      // Second call to employee.count is for undeclared apprentices
      const secondCall = mockPrismaService.employee.count.mock.calls[1][0];
      expect(secondCall.where.jobType).toBe('APPRENTICE');
      expect(secondCall.where.NOT).toBeDefined();
    });
  });
});
