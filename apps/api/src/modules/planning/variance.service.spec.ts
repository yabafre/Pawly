import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { VarianceService } from './variance.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('VarianceService', () => {
  let service: VarianceService;

  const clinicId = 'clinic-123';
  const userId = 'user-admin-1';

  const mockVarianceEvent = {
    id: 'var-1',
    type: 'CLOCK_IN_DEVIATION',
    plannedTime: new Date('2026-02-24T08:30:00Z'),
    actualTime: new Date('2026-02-24T08:47:00Z'),
    deltaMinutes: 17,
    status: 'PENDING',
    reviewedBy: null,
    reviewedAt: null,
    exceptionNote: null,
    shiftId: 'shift-1',
    clinicId,
    createdAt: new Date(),
    updatedAt: new Date(),
    shift: {
      shiftTypeCode: 'CHIR',
      startTime: '08:30',
      endTime: '18:30',
      date: new Date('2026-02-24'),
      employee: {
        id: 'emp-1',
        firstName: 'Martin',
        lastName: 'Dupont',
        jobType: 'VET',
      },
    },
  };

  const mockPrismaService = {
    varianceEvent: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VarianceService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<VarianceService>(VarianceService);
    jest.clearAllMocks();
    // Default count mock for paginated listVarianceEvents
    mockPrismaService.varianceEvent.count.mockResolvedValue(0);
  });

  // ── listVarianceEvents ─────────────────────────────────────────────

  describe('listVarianceEvents', () => {
    it('should list all variance events for a clinic', async () => {
      mockPrismaService.varianceEvent.findMany.mockResolvedValue([mockVarianceEvent]);
      mockPrismaService.varianceEvent.count.mockResolvedValue(1);

      const result = await service.listVarianceEvents(clinicId, {});

      expect(result).toEqual({ items: [mockVarianceEvent], total: 1 });
      expect(mockPrismaService.varianceEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clinicId },
          orderBy: { plannedTime: 'desc' },
          skip: 0,
          take: 10,
        }),
      );
    });

    it('should filter by status', async () => {
      mockPrismaService.varianceEvent.findMany.mockResolvedValue([]);

      await service.listVarianceEvents(clinicId, { status: 'PENDING' });

      expect(mockPrismaService.varianceEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clinicId, status: 'PENDING' }),
        }),
      );
    });

    it('should filter by type', async () => {
      mockPrismaService.varianceEvent.findMany.mockResolvedValue([]);

      await service.listVarianceEvents(clinicId, { type: 'NO_SHOW' });

      expect(mockPrismaService.varianceEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clinicId, type: 'NO_SHOW' }),
        }),
      );
    });

    it('should filter by employeeId via shift relation', async () => {
      mockPrismaService.varianceEvent.findMany.mockResolvedValue([]);

      await service.listVarianceEvents(clinicId, { employeeId: 'emp-1' });

      expect(mockPrismaService.varianceEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinicId,
            shift: { employeeId: 'emp-1' },
          }),
        }),
      );
    });

    it('should filter by month date range', async () => {
      mockPrismaService.varianceEvent.findMany.mockResolvedValue([]);

      await service.listVarianceEvents(clinicId, { month: '2026-02' });

      const call = mockPrismaService.varianceEvent.findMany.mock.calls[0][0];
      expect(call.where.plannedTime).toBeDefined();
      expect(call.where.plannedTime.gte).toBeInstanceOf(Date);
      expect(call.where.plannedTime.lte).toBeInstanceOf(Date);
    });

    it('should include shift and employee data', async () => {
      mockPrismaService.varianceEvent.findMany.mockResolvedValue([mockVarianceEvent]);

      await service.listVarianceEvents(clinicId, {});

      expect(mockPrismaService.varianceEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            shift: expect.objectContaining({
              include: expect.objectContaining({
                employee: expect.any(Object),
              }),
            }),
          }),
        }),
      );
    });
  });

  // ── reviewVariance ─────────────────────────────────────────────────

  describe('reviewVariance', () => {
    it('should approve a pending variance event via atomic CAS', async () => {
      mockPrismaService.varianceEvent.findFirst.mockResolvedValue(mockVarianceEvent);
      mockPrismaService.varianceEvent.updateMany.mockResolvedValue({ count: 1 });
      const approved = { ...mockVarianceEvent, status: 'APPROVED', reviewedBy: userId };
      mockPrismaService.varianceEvent.findFirstOrThrow.mockResolvedValue(approved);

      const result = await service.reviewVariance(clinicId, userId, 'var-1', 'approve');

      expect(result.status).toBe('APPROVED');
      expect(mockPrismaService.varianceEvent.updateMany).toHaveBeenCalledWith({
        where: { id: 'var-1', clinicId, status: 'PENDING' },
        data: expect.objectContaining({
          status: 'APPROVED',
          reviewedBy: userId,
          exceptionNote: null,
        }),
      });
    });

    it('should reject a pending variance event with exception note', async () => {
      mockPrismaService.varianceEvent.findFirst.mockResolvedValue(mockVarianceEvent);
      mockPrismaService.varianceEvent.updateMany.mockResolvedValue({ count: 1 });
      const rejected = { ...mockVarianceEvent, status: 'REJECTED', exceptionNote: 'Invalid' };
      mockPrismaService.varianceEvent.findFirstOrThrow.mockResolvedValue(rejected);

      const result = await service.reviewVariance(clinicId, userId, 'var-1', 'reject', 'Invalid');

      expect(result.status).toBe('REJECTED');
      expect(result.exceptionNote).toBe('Invalid');
      expect(mockPrismaService.varianceEvent.updateMany).toHaveBeenCalledWith({
        where: { id: 'var-1', clinicId, status: 'PENDING' },
        data: expect.objectContaining({
          status: 'REJECTED',
          exceptionNote: 'Invalid',
        }),
      });
    });

    it('should throw NotFoundException if variance not found', async () => {
      mockPrismaService.varianceEvent.findFirst.mockResolvedValue(null);

      await expect(
        service.reviewVariance(clinicId, userId, 'var-missing', 'approve'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if already reviewed (fast-fail)', async () => {
      const reviewed = { ...mockVarianceEvent, status: 'APPROVED' };
      mockPrismaService.varianceEvent.findFirst.mockResolvedValue(reviewed);

      await expect(
        service.reviewVariance(clinicId, userId, 'var-1', 'approve'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException on race condition (updateMany returns 0)', async () => {
      mockPrismaService.varianceEvent.findFirst.mockResolvedValue(mockVarianceEvent);
      mockPrismaService.varianceEvent.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.reviewVariance(clinicId, userId, 'var-1', 'approve'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── getVarianceStats ───────────────────────────────────────────────

  describe('getVarianceStats', () => {
    it('should return aggregated stats', async () => {
      const mockCountByType = [
        { type: 'CLOCK_IN_DEVIATION', _count: { id: 5 }, _avg: { deltaMinutes: 12 } },
        { type: 'NO_SHOW', _count: { id: 2 }, _avg: { deltaMinutes: null } },
      ];
      const mockCountByStatus = [
        { status: 'PENDING', _count: { id: 3 } },
        { status: 'APPROVED', _count: { id: 4 } },
      ];
      const mockTotals = {
        _count: { id: 7 },
        _sum: { deltaMinutes: 84 },
        _avg: { deltaMinutes: 12 },
      };

      mockPrismaService.varianceEvent.groupBy
        .mockResolvedValueOnce(mockCountByType)
        .mockResolvedValueOnce(mockCountByStatus);
      mockPrismaService.varianceEvent.aggregate.mockResolvedValue(mockTotals);

      const result = await service.getVarianceStats(clinicId, { month: '2026-02' });

      expect(result.countByType).toEqual(mockCountByType);
      expect(result.countByStatus).toEqual(mockCountByStatus);
      expect(result.totals).toEqual(mockTotals);
    });

    it('should use current month when no month specified', async () => {
      mockPrismaService.varianceEvent.groupBy.mockResolvedValue([]);
      mockPrismaService.varianceEvent.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _sum: { deltaMinutes: null },
        _avg: { deltaMinutes: null },
      });

      await service.getVarianceStats(clinicId, {});

      expect(mockPrismaService.varianceEvent.groupBy).toHaveBeenCalled();
      expect(mockPrismaService.varianceEvent.aggregate).toHaveBeenCalled();
    });

    it('should call groupBy and aggregate in parallel', async () => {
      mockPrismaService.varianceEvent.groupBy.mockResolvedValue([]);
      mockPrismaService.varianceEvent.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _sum: { deltaMinutes: null },
        _avg: { deltaMinutes: null },
      });

      await service.getVarianceStats(clinicId, { month: '2026-02' });

      // groupBy called twice (by type and by status) and aggregate called once
      expect(mockPrismaService.varianceEvent.groupBy).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.varianceEvent.aggregate).toHaveBeenCalledTimes(1);
    });
  });

  // ── countPendingVarianceEvents ─────────────────────────────────────

  describe('countPendingVarianceEvents', () => {
    it('should return pending count', async () => {
      mockPrismaService.varianceEvent.count.mockResolvedValue(5);

      const result = await service.countPendingVarianceEvents(clinicId);

      expect(result).toBe(5);
      expect(mockPrismaService.varianceEvent.count).toHaveBeenCalledWith({
        where: { clinicId, status: 'PENDING' },
      });
    });

    it('should return 0 when no pending events', async () => {
      mockPrismaService.varianceEvent.count.mockResolvedValue(0);

      const result = await service.countPendingVarianceEvents(clinicId);

      expect(result).toBe(0);
    });
  });

  // ── exportVarianceCsv ──────────────────────────────────────────────

  describe('exportVarianceCsv', () => {
    it('should return CSV string with header and rows', async () => {
      mockPrismaService.varianceEvent.findMany.mockResolvedValue([mockVarianceEvent]);

      const csv = await service.exportVarianceCsv(clinicId, { month: '2026-02' });

      expect(csv).toContain('Employé,Poste,Date');
      expect(csv).toContain('Dupont Martin');
      expect(csv).toContain('VET');
      expect(csv).toContain('17');
    });

    it('should return header only when no events', async () => {
      mockPrismaService.varianceEvent.findMany.mockResolvedValue([]);

      const csv = await service.exportVarianceCsv(clinicId, { month: '2026-02' });

      const lines = csv.split('\n');
      expect(lines).toHaveLength(1); // header only
      expect(lines[0]).toContain('Employé');
    });

    it('should filter by employeeId when provided', async () => {
      mockPrismaService.varianceEvent.findMany.mockResolvedValue([]);

      await service.exportVarianceCsv(clinicId, { month: '2026-02', employeeId: 'emp-1' });

      expect(mockPrismaService.varianceEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            shift: { employeeId: 'emp-1' },
          }),
        }),
      );
    });

    it('should escape CSV fields with quotes', async () => {
      const eventWithComma = {
        ...mockVarianceEvent,
        exceptionNote: 'Note with, comma and "quotes"',
      };
      mockPrismaService.varianceEvent.findMany.mockResolvedValue([eventWithComma]);

      const csv = await service.exportVarianceCsv(clinicId, { month: '2026-02' });

      expect(csv).toContain('""quotes""');
    });

    it('should use French type and status labels', async () => {
      mockPrismaService.varianceEvent.findMany.mockResolvedValue([mockVarianceEvent]);

      const csv = await service.exportVarianceCsv(clinicId, { month: '2026-02' });

      expect(csv).toContain('Retard');
      expect(csv).toContain('En attente');
    });
  });
});
