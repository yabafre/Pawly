import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('EmployeeService', () => {
  let service: EmployeeService;

  const clinicId = 'clinic-123';
  const otherClinicId = 'clinic-other';

  const mockEmployee = {
    id: 'emp-1',
    firstName: 'Jean',
    lastName: 'Dupont',
    email: 'jean@clinic.fr',
    phone: '+33612345678',
    jobType: 'VET',
    contractType: 'CDI',
    contractHours: 35,
    color: '#3b82f6',
    hireDate: new Date('2024-01-15'),
    endDate: null,
    isActive: true,
    clinicId,
    userId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    employee: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    unavailability: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<EmployeeService>(EmployeeService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns employees filtered by clinicId', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([mockEmployee]);

      const result = await service.findAll(clinicId);

      expect(result).toEqual([mockEmployee]);
      expect(mockPrismaService.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clinicId }),
        }),
      );
    });

    it('excludes inactive employees by default', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([]);

      await service.findAll(clinicId);

      expect(mockPrismaService.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('includes inactive employees when includeInactive is true', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([]);

      await service.findAll(clinicId, { includeInactive: true });

      const call = mockPrismaService.employee.findMany.mock.calls[0][0];
      expect(call.where.isActive).toBeUndefined();
    });

    it('filters by jobType when provided', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([]);

      await service.findAll(clinicId, { jobType: 'VET' });

      expect(mockPrismaService.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ jobType: 'VET' }),
        }),
      );
    });

    it('filters by search when provided', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([]);

      await service.findAll(clinicId, { search: 'Jean' });

      const call = mockPrismaService.employee.findMany.mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toHaveLength(2);
    });

    it('orders by lastName ascending', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([]);

      await service.findAll(clinicId);

      expect(mockPrismaService.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { lastName: 'asc' },
        }),
      );
    });
  });

  describe('findById', () => {
    it('returns employee when found with matching clinicId', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployee);

      const result = await service.findById(clinicId, 'emp-1');

      expect(result).toEqual(mockEmployee);
      expect(mockPrismaService.employee.findFirst).toHaveBeenCalledWith({
        where: { id: 'emp-1', clinicId },
      });
    });

    it('throws NotFoundException when employee not found', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(null);

      await expect(service.findById(clinicId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not return employee from another clinic', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.findById(otherClinicId, mockEmployee.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates employee with correct clinicId', async () => {
      const input = {
        firstName: 'Marie',
        lastName: 'Martin',
        email: 'marie@clinic.fr',
        phone: '',
        jobType: 'ASV' as const,
        contractType: 'CDD' as const,
        contractHours: 20,
        color: '#FF5733',
        hireDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-12-31T00:00:00.000Z',
      };

      mockPrismaService.employee.create.mockResolvedValue({
        ...input,
        id: 'new-emp',
        clinicId,
      });

      const result = await service.create(clinicId, input);

      expect(mockPrismaService.employee.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: 'Marie',
          lastName: 'Martin',
          clinicId,
          contractType: 'CDD',
          email: 'marie@clinic.fr',
          phone: null,
        }),
      });
      expect(result.clinicId).toBe(clinicId);
    });

    it('sets null for empty optional fields', async () => {
      const input = {
        firstName: 'Test',
        lastName: 'User',
        email: '',
        phone: '',
        jobType: 'VET' as const,
        contractType: 'CDI' as const,
        contractHours: 35,
        color: '#3b82f6',
        hireDate: '',
        endDate: '',
      };

      mockPrismaService.employee.create.mockResolvedValue({
        ...input,
        id: 'new-emp',
        clinicId,
      });

      await service.create(clinicId, input);

      expect(mockPrismaService.employee.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: null,
          phone: null,
          hireDate: null,
          endDate: null,
        }),
      });
    });

    it('forces endDate to null for CDI even when payload includes one', async () => {
      const input = {
        firstName: 'Test',
        lastName: 'User',
        email: '',
        phone: '',
        jobType: 'VET' as const,
        contractType: 'CDI' as const,
        contractHours: 35,
        color: '#3b82f6',
        hireDate: '2024-01-01T00:00:00.000Z',
        endDate: '2026-12-31T00:00:00.000Z',
      };

      mockPrismaService.employee.create.mockResolvedValue({
        ...input,
        id: 'new-emp',
        clinicId,
        endDate: null,
      });

      await service.create(clinicId, input);

      expect(mockPrismaService.employee.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contractType: 'CDI',
          endDate: null,
        }),
      });
    });
  });

  describe('update', () => {
    it('updates employee fields after verifying clinic ownership', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployee);
      mockPrismaService.employee.update.mockResolvedValue({
        ...mockEmployee,
        firstName: 'Updated',
      });

      await service.update(clinicId, {
        id: 'emp-1',
        firstName: 'Updated',
      });

      expect(mockPrismaService.employee.findFirst).toHaveBeenCalledWith({
        where: { id: 'emp-1', clinicId },
      });
      expect(mockPrismaService.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: expect.objectContaining({ firstName: 'Updated' }),
      });
    });

    it('throws NotFoundException when updating employee from another clinic', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.update(otherClinicId, { id: 'emp-1', firstName: 'Hack' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('forces endDate to null when contractType is changed to CDI', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployee);
      mockPrismaService.employee.update.mockResolvedValue({
        ...mockEmployee,
        contractType: 'CDI',
        endDate: null,
      });

      await service.update(clinicId, {
        id: 'emp-1',
        contractType: 'CDI',
        endDate: '2026-12-31T00:00:00.000Z',
      });

      expect(mockPrismaService.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: expect.objectContaining({
          contractType: 'CDI',
          endDate: null,
        }),
      });
    });
  });

  describe('toggleActive', () => {
    it('flips isActive from true to false', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployee);
      mockPrismaService.employee.update.mockResolvedValue({
        ...mockEmployee,
        isActive: false,
      });

      await service.toggleActive(clinicId, 'emp-1');

      expect(mockPrismaService.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: { isActive: false },
      });
    });

    it('flips isActive from false to true', async () => {
      const inactiveEmployee = { ...mockEmployee, isActive: false };
      mockPrismaService.employee.findFirst.mockResolvedValue(inactiveEmployee);
      mockPrismaService.employee.update.mockResolvedValue({
        ...inactiveEmployee,
        isActive: true,
      });

      await service.toggleActive(clinicId, 'emp-1');

      expect(mockPrismaService.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: { isActive: true },
      });
    });

    it('enforces clinicId match', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.toggleActive(otherClinicId, 'emp-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('constraints', () => {
    const constraintId = 'constraint-1';
    const employeeId = 'emp-1';

    const oneTimeConstraint = {
      id: constraintId,
      employeeId,
      clinicId,
      type: 'SCHOOL',
      startDate: new Date('2026-03-10T00:00:00.000Z'),
      endDate: new Date('2026-03-10T23:59:59.999Z'),
      reason: 'School day',
      daysOfWeek: [],
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    };

    const recurringConstraint = {
      id: 'constraint-rec',
      employeeId,
      clinicId,
      type: 'VACATION',
      startDate: new Date('2026-03-01T00:00:00.000Z'),
      endDate: new Date('2026-03-31T23:59:59.999Z'),
      reason: null,
      daysOfWeek: [1, 3],
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    };

    it('lists constraints scoped by clinic and employee', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployee);
      mockPrismaService.unavailability.findMany.mockResolvedValue([
        oneTimeConstraint,
      ]);

      const result = await service.listConstraints(clinicId, { employeeId });

      expect(result).toEqual([oneTimeConstraint]);
      expect(mockPrismaService.unavailability.findMany).toHaveBeenCalledWith({
        where: { clinicId, employeeId },
        orderBy: [{ startDate: 'asc' }, { endDate: 'asc' }],
      });
    });

    it('creates a new constraint for an employee in the clinic', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployee);
      mockPrismaService.unavailability.create.mockResolvedValue(
        oneTimeConstraint,
      );

      const result = await service.createConstraint(clinicId, {
        employeeId,
        type: 'SCHOOL',
        startDate: '2026-03-10T00:00:00.000Z',
        endDate: '2026-03-10T23:59:59.999Z',
        reason: '',
        daysOfWeek: [],
      });

      expect(result).toEqual(oneTimeConstraint);
      expect(mockPrismaService.unavailability.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clinicId,
          employeeId,
          type: 'SCHOOL',
          reason: null,
          daysOfWeek: [],
        }),
      });
    });

    it('updates constraint fields', async () => {
      mockPrismaService.unavailability.findFirst.mockResolvedValue(
        oneTimeConstraint,
      );
      mockPrismaService.unavailability.update.mockResolvedValue({
        ...oneTimeConstraint,
        reason: 'Updated reason',
      });

      const result = await service.updateConstraint(clinicId, {
        id: constraintId,
        reason: 'Updated reason',
      });

      expect(result.reason).toBe('Updated reason');
      expect(mockPrismaService.unavailability.update).toHaveBeenCalledWith({
        where: { id: constraintId },
        data: expect.objectContaining({ reason: 'Updated reason' }),
      });
    });

    it('throws BadRequestException when partial update creates inverted date range', async () => {
      mockPrismaService.unavailability.findFirst.mockResolvedValue(
        oneTimeConstraint,
      );

      await expect(
        service.updateConstraint(clinicId, {
          id: constraintId,
          endDate: '2026-03-09T23:59:59.999Z',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrismaService.unavailability.update).not.toHaveBeenCalled();
    });

    it('deletes a constraint scoped to clinic', async () => {
      mockPrismaService.unavailability.findFirst.mockResolvedValue(
        oneTimeConstraint,
      );
      mockPrismaService.unavailability.delete.mockResolvedValue(
        oneTimeConstraint,
      );

      const result = await service.deleteConstraint(clinicId, constraintId);

      expect(result).toEqual(oneTimeConstraint);
      expect(mockPrismaService.unavailability.delete).toHaveBeenCalledWith({
        where: { id: constraintId },
      });
    });

    it('throws NotFoundException when deleting unknown constraint', async () => {
      mockPrismaService.unavailability.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteConstraint(clinicId, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('projects one-time and recurring constraints as hard rules', async () => {
      mockPrismaService.unavailability.findMany.mockResolvedValue([
        oneTimeConstraint,
        recurringConstraint,
      ]);

      const result = await service.listHardRules(clinicId, {
        startDate: '2026-03-09T00:00:00.000Z',
        endDate: '2026-03-12T23:59:59.999Z',
      });

      expect(result.some((rule) => rule.ruleType === 'HARD')).toBe(true);
      expect(result.some((rule) => rule.source === 'ONE_TIME')).toBe(true);
      expect(result.some((rule) => rule.source === 'RECURRING')).toBe(true);
      expect(result.every((rule) => rule.employeeId === employeeId)).toBe(true);
    });
  });
});
