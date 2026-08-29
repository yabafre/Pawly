import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApprenticeDeclarationService } from './apprentice-declaration.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('ApprenticeDeclarationService', () => {
  let service: ApprenticeDeclarationService;

  const clinicId = 'clinic-123';
  const month = '2026-03';

  const mockApprentices = [
    { id: 'emp-1', firstName: 'Alice', lastName: 'Apprenti' },
    { id: 'emp-2', firstName: 'Bob', lastName: 'Stagiaire' },
  ];

  const mockPrisma = {
    employee: { findMany: jest.fn(), findFirst: jest.fn() },
    unavailability: { findMany: jest.fn() },
    apprenticeMonthDeclaration: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprenticeDeclarationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ApprenticeDeclarationService>(ApprenticeDeclarationService);
    jest.clearAllMocks();

    mockPrisma.employee.findMany.mockResolvedValue(mockApprentices);
    // The write paths resolve the employee inside the caller's clinic first;
    // the default is "it belongs to them", and the refusal is asserted below.
    mockPrisma.employee.findFirst.mockResolvedValue({ id: 'emp-1' });
    mockPrisma.unavailability.findMany.mockResolvedValue([]);
    mockPrisma.apprenticeMonthDeclaration.findMany.mockResolvedValue([]);
  });

  describe('listForMonth', () => {
    it('returns MISSING status when no declarations or school days exist', async () => {
      const result = await service.listForMonth(clinicId, month);
      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('MISSING');
      expect(result[1].status).toBe('MISSING');
    });

    it('returns empty array when no apprentices exist', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([]);
      const result = await service.listForMonth(clinicId, month);
      expect(result).toEqual([]);
    });

    it('returns SCHOOL_DAYS_PROVIDED when SCHOOL unavailability exists', async () => {
      mockPrisma.unavailability.findMany.mockResolvedValue([
        { employeeId: 'emp-1' },
      ]);

      const result = await service.listForMonth(clinicId, month);
      expect(result.find(r => r.employeeId === 'emp-1')?.status).toBe('SCHOOL_DAYS_PROVIDED');
      expect(result.find(r => r.employeeId === 'emp-2')?.status).toBe('MISSING');
    });

    it('returns NO_SCHOOL_THIS_MONTH when declaration exists', async () => {
      mockPrisma.apprenticeMonthDeclaration.findMany.mockResolvedValue([
        { employeeId: 'emp-2' },
      ]);

      const result = await service.listForMonth(clinicId, month);
      expect(result.find(r => r.employeeId === 'emp-2')?.status).toBe('NO_SCHOOL_THIS_MONTH');
    });

    it('SCHOOL_DAYS_PROVIDED takes priority over NO_SCHOOL_THIS_MONTH', async () => {
      mockPrisma.unavailability.findMany.mockResolvedValue([
        { employeeId: 'emp-1' },
      ]);
      mockPrisma.apprenticeMonthDeclaration.findMany.mockResolvedValue([
        { employeeId: 'emp-1' },
      ]);

      const result = await service.listForMonth(clinicId, month);
      expect(result.find(r => r.employeeId === 'emp-1')?.status).toBe('SCHOOL_DAYS_PROVIDED');
    });
  });

  describe('upsertNoSchool', () => {
    it('creates a NO_SCHOOL_THIS_MONTH declaration', async () => {
      mockPrisma.apprenticeMonthDeclaration.upsert.mockResolvedValue({
        id: 'decl-1',
      });

      const result = await service.upsertNoSchool(clinicId, 'emp-1', month);
      expect(result).toEqual({ id: 'decl-1' });
      expect(mockPrisma.apprenticeMonthDeclaration.upsert).toHaveBeenCalledWith({
        where: { clinicId_employeeId_month: { clinicId, employeeId: 'emp-1', month } },
        create: { clinicId, employeeId: 'emp-1', month, status: 'NO_SCHOOL_THIS_MONTH' },
        update: { status: 'NO_SCHOOL_THIS_MONTH' },
      });
    });
  });

  describe('clinic boundary', () => {
    it('refuses an employee that is not in the caller clinic', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.upsertNoSchool('clinic-1', 'employee-of-another-clinic', '2026-09'),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.deleteDeclaration('clinic-1', 'employee-of-another-clinic', '2026-09'),
      ).rejects.toThrow(NotFoundException);

      // The composite key satisfies both foreign keys independently, so without
      // this lookup Postgres would happily accept the row.
      expect(mockPrisma.apprenticeMonthDeclaration.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.apprenticeMonthDeclaration.delete).not.toHaveBeenCalled();
    });
  });

  describe('deleteDeclaration', () => {
    it('deletes declaration and returns true', async () => {
      mockPrisma.apprenticeMonthDeclaration.delete.mockResolvedValue({});
      const result = await service.deleteDeclaration(clinicId, 'emp-1', month);
      expect(result).toEqual({ deleted: true });
    });

    it('returns false when declaration does not exist', async () => {
      mockPrisma.apprenticeMonthDeclaration.delete.mockRejectedValue(
        new Error('Record not found'),
      );
      const result = await service.deleteDeclaration(clinicId, 'emp-1', month);
      expect(result).toEqual({ deleted: false });
    });
  });

  describe('getUndeclaredApprentices', () => {
    it('returns apprentices with MISSING status', async () => {
      const result = await service.getUndeclaredApprentices(clinicId, month);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'emp-1', firstName: 'Alice', lastName: 'Apprenti' });
    });

    it('returns empty when all declared', async () => {
      mockPrisma.unavailability.findMany.mockResolvedValue([
        { employeeId: 'emp-1' },
      ]);
      mockPrisma.apprenticeMonthDeclaration.findMany.mockResolvedValue([
        { employeeId: 'emp-2' },
      ]);

      const result = await service.getUndeclaredApprentices(clinicId, month);
      expect(result).toHaveLength(0);
    });
  });
});
