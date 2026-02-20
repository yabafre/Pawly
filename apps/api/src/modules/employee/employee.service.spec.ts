import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmployeeService } from './employee.service';
import { PrismaService } from '@/prisma/prisma.service';
import { MailService } from '@/modules/mail/mail.service';
import { AuthService } from '@/modules/auth/auth.service';

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
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockMailService = {
    sendSchoolDaysNotification: jest.fn().mockResolvedValue(undefined),
    sendSchoolDaysReminder: jest.fn().mockResolvedValue(undefined),
    sendEmployeeInvitationEmail: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuthService = {
    createWelcomeMagicLink: jest.fn().mockResolvedValue('http://localhost:3000/auth/callback?token=abc123'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MailService, useValue: mockMailService },
        { provide: AuthService, useValue: mockAuthService },
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
    it('creates employee with User account when email is provided', async () => {
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

      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const createdEmployee = { ...input, id: 'new-emp', clinicId, userId: 'user-1' };
      mockPrismaService.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: {
            create: jest.fn().mockResolvedValue({ id: 'user-1', email: 'marie@clinic.fr' }),
          },
          employee: {
            create: jest.fn().mockResolvedValue(createdEmployee),
          },
        };
        return fn(tx);
      });

      const result = await service.create(clinicId, input);

      expect(result).toEqual(createdEmployee);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'marie@clinic.fr' },
      });
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    });

    it('sends welcome magic link (not activation token) after creating employee with email', async () => {
      const input = {
        firstName: 'Marie',
        lastName: 'Martin',
        email: 'marie@clinic.fr',
        phone: '',
        jobType: 'ASV' as const,
        contractType: 'CDD' as const,
        contractHours: 20,
        color: '#FF5733',
        hireDate: '',
        endDate: '',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) },
          employee: { create: jest.fn().mockResolvedValue({ ...input, id: 'new-emp', clinicId }) },
        };
        return fn(tx);
      });

      await service.create(clinicId, input);

      await new Promise((r) => setTimeout(r, 50));

      expect(mockAuthService.createWelcomeMagicLink).toHaveBeenCalledWith('marie@clinic.fr');
      expect(mockMailService.sendEmployeeInvitationEmail).toHaveBeenCalledWith(
        'marie@clinic.fr',
        'http://localhost:3000/auth/callback?token=abc123',
        'Marie',
      );
    });

    it('throws BadRequestException when email already exists in User table', async () => {
      const input = {
        firstName: 'Marie',
        lastName: 'Martin',
        email: 'existing@clinic.fr',
        phone: '',
        jobType: 'ASV' as const,
        contractType: 'CDD' as const,
        contractHours: 20,
        color: '#FF5733',
        hireDate: '',
        endDate: '',
      };

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: 'existing@clinic.fr',
      });

      await expect(service.create(clinicId, input)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('creates employee without User account when email is empty', async () => {
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
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockAuthService.createWelcomeMagicLink).not.toHaveBeenCalled();
      expect(mockMailService.sendEmployeeInvitationEmail).not.toHaveBeenCalled();
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

    it('creates User with EMPLOYEE role and correct name in transaction', async () => {
      const input = {
        firstName: 'Léa',
        lastName: 'Bernard',
        email: 'lea@clinic.fr',
        phone: '',
        jobType: 'APPRENTICE' as const,
        contractType: 'APPRENTICESHIP' as const,
        contractHours: 35,
        color: '#3b82f6',
        hireDate: '',
        endDate: '',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);

      let userCreateCalledWith: any = null;
      let employeeCreateCalledWith: any = null;

      mockPrismaService.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: {
            create: jest.fn().mockImplementation((args: any) => {
              userCreateCalledWith = args;
              return { id: 'user-lea' };
            }),
          },
          employee: {
            create: jest.fn().mockImplementation((args: any) => {
              employeeCreateCalledWith = args;
              return { ...input, id: 'emp-lea', clinicId, userId: 'user-lea' };
            }),
          },
        };
        return fn(tx);
      });

      await service.create(clinicId, input);

      expect(userCreateCalledWith.data).toEqual({
        email: 'lea@clinic.fr',
        name: 'Léa Bernard',
        role: 'EMPLOYEE',
        clinicId,
      });
      expect(employeeCreateCalledWith.data.userId).toBe('user-lea');
    });
  });

  describe('resendInvitation', () => {
    it('sends welcome magic link email for employee with linked user', async () => {
      const employee = {
        ...mockEmployee,
        email: 'jean@clinic.fr',
        userId: 'user-1',
        firstName: 'Jean',
      };
      mockPrismaService.employee.findFirst.mockResolvedValue(employee);

      const result = await service.resendInvitation(clinicId, 'emp-1');

      expect(result).toEqual({ message: 'Invitation resent' });
      expect(mockAuthService.createWelcomeMagicLink).toHaveBeenCalledWith('jean@clinic.fr');
      expect(mockMailService.sendEmployeeInvitationEmail).toHaveBeenCalledWith(
        'jean@clinic.fr',
        'http://localhost:3000/auth/callback?token=abc123',
        'Jean',
      );
    });

    it('throws BadRequestException when employee has no email', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue({
        ...mockEmployee,
        email: null,
        userId: null,
      });

      await expect(service.resendInvitation(clinicId, 'emp-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockAuthService.createWelcomeMagicLink).not.toHaveBeenCalled();
    });

    it('creates User account and sends invitation when employee has no userId (legacy)', async () => {
      const legacyEmployee = {
        ...mockEmployee,
        id: 'legacy-emp',
        email: 'legacy@clinic.fr',
        firstName: 'Legacy',
        lastName: 'Worker',
        userId: null,
      };
      mockPrismaService.employee.findFirst.mockResolvedValue(legacyEmployee);
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      let txUserCreateData: any = null;
      let txEmployeeUpdateData: any = null;
      mockPrismaService.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: {
            create: jest.fn().mockImplementation((args: any) => {
              txUserCreateData = args.data;
              return { id: 'new-user-id', email: 'legacy@clinic.fr' };
            }),
          },
          employee: {
            update: jest.fn().mockImplementation((args: any) => {
              txEmployeeUpdateData = args;
              return { ...legacyEmployee, userId: 'new-user-id' };
            }),
          },
        };
        return fn(tx);
      });

      const result = await service.resendInvitation(clinicId, 'legacy-emp');

      expect(result).toEqual({ message: 'Invitation resent' });
      expect(txUserCreateData).toEqual({
        email: 'legacy@clinic.fr',
        name: 'Legacy Worker',
        role: 'EMPLOYEE',
        clinicId,
      });
      expect(txEmployeeUpdateData).toEqual({
        where: { id: 'legacy-emp' },
        data: { userId: 'new-user-id' },
      });
      expect(mockAuthService.createWelcomeMagicLink).toHaveBeenCalledWith('legacy@clinic.fr');
      expect(mockMailService.sendEmployeeInvitationEmail).toHaveBeenCalledWith(
        'legacy@clinic.fr',
        'http://localhost:3000/auth/callback?token=abc123',
        'Legacy',
      );
    });

    it('links existing User when employee has no userId but User with email exists', async () => {
      const legacyEmployee = {
        ...mockEmployee,
        id: 'legacy-emp-2',
        email: 'existing@clinic.fr',
        firstName: 'Existing',
        userId: null,
      };
      mockPrismaService.employee.findFirst.mockResolvedValue(legacyEmployee);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'existing-user-id',
        email: 'existing@clinic.fr',
      });
      mockPrismaService.employee.update.mockResolvedValue({
        ...legacyEmployee,
        userId: 'existing-user-id',
      });

      const result = await service.resendInvitation(clinicId, 'legacy-emp-2');

      expect(result).toEqual({ message: 'Invitation resent' });
      expect(mockPrismaService.employee.update).toHaveBeenCalledWith({
        where: { id: 'legacy-emp-2' },
        data: { userId: 'existing-user-id' },
      });
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockAuthService.createWelcomeMagicLink).toHaveBeenCalledWith('existing@clinic.fr');
    });

    it('throws NotFoundException when employee not found', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.resendInvitation(clinicId, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
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

  describe('declareSchoolDays', () => {
    const apprentice = {
      ...mockEmployee,
      id: 'apprentice-1',
      jobType: 'APPRENTICE',
      firstName: 'Léa',
      lastName: 'Bernard',
    };

    const input = {
      month: '2026-04',
      dates: ['2026-04-07', '2026-04-14', '2026-04-21'],
      employeeId: 'apprentice-1',
    };

    const createdRecords = input.dates.map((d, i) => ({
      id: `unavail-${i}`,
      clinicId,
      employeeId: 'apprentice-1',
      type: 'SCHOOL',
      startDate: new Date(`${d}T00:00:00.000Z`),
      endDate: new Date(`${d}T00:00:00.000Z`),
      daysOfWeek: [],
    }));

    it('creates SCHOOL unavailabilities via transaction', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(apprentice);
      mockPrismaService.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          unavailability: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createMany: jest.fn().mockResolvedValue({ count: 3 }),
            findMany: jest.fn().mockResolvedValue(createdRecords),
          },
        };
        return fn(tx);
      });
      mockPrismaService.user.findMany.mockResolvedValue([]);

      const result = await service.declareSchoolDays(clinicId, 'apprentice-1', input);

      expect(result).toEqual(createdRecords);
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    });

    it('deletes existing SCHOOL records before creating new ones (replace semantics)', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(apprentice);

      let deleteManyCalledWith: any = null;
      let createManyCalledWith: any = null;

      mockPrismaService.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          unavailability: {
            deleteMany: jest.fn().mockImplementation((args: any) => {
              deleteManyCalledWith = args;
              return { count: 2 };
            }),
            createMany: jest.fn().mockImplementation((args: any) => {
              createManyCalledWith = args;
              return { count: 3 };
            }),
            findMany: jest.fn().mockResolvedValue(createdRecords),
          },
        };
        return fn(tx);
      });
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await service.declareSchoolDays(clinicId, 'apprentice-1', input);

      expect(deleteManyCalledWith).toBeDefined();
      expect(deleteManyCalledWith.where.type).toBe('SCHOOL');
      expect(deleteManyCalledWith.where.employeeId).toBe('apprentice-1');
      expect(deleteManyCalledWith.where.clinicId).toBe(clinicId);
      expect(createManyCalledWith).toBeDefined();
      expect(createManyCalledWith.data).toHaveLength(3);
    });

    it('rejects non-APPRENTICE employees with BadRequestException', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployee); // VET jobType

      await expect(
        service.declareSchoolDays(clinicId, 'emp-1', {
          ...input,
          employeeId: 'emp-1',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for employee from another clinic', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.declareSchoolDays(otherClinicId, 'apprentice-1', input),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns empty array when dates list is empty', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(apprentice);
      mockPrismaService.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          unavailability: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createMany: jest.fn(),
            findMany: jest.fn(),
          },
        };
        return fn(tx);
      });

      const result = await service.declareSchoolDays(clinicId, 'apprentice-1', {
        ...input,
        dates: [],
      });

      expect(result).toEqual([]);
    });

    it('sends admin notification after successful declaration', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(apprentice);
      mockPrismaService.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          unavailability: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createMany: jest.fn().mockResolvedValue({ count: 3 }),
            findMany: jest.fn().mockResolvedValue(createdRecords),
          },
        };
        return fn(tx);
      });
      mockPrismaService.user.findMany.mockResolvedValue([
        { email: 'admin@clinic.fr', name: 'Admin' },
      ]);

      await service.declareSchoolDays(clinicId, 'apprentice-1', input);

      // Wait for fire-and-forget promise
      await new Promise((r) => setTimeout(r, 50));

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: { clinicId, role: 'ADMIN' },
        select: { email: true, name: true },
      });
      expect(mockMailService.sendSchoolDaysNotification).toHaveBeenCalledWith(
        'admin@clinic.fr',
        'Admin',
        'Léa Bernard',
        '2026-04',
        3,
      );
    });

    it('does not send notification when declaration is empty', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(apprentice);
      mockPrismaService.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          unavailability: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createMany: jest.fn(),
            findMany: jest.fn(),
          },
        };
        return fn(tx);
      });

      await service.declareSchoolDays(clinicId, 'apprentice-1', {
        ...input,
        dates: [],
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockMailService.sendSchoolDaysNotification).not.toHaveBeenCalled();
    });
  });

  describe('listSchoolDays', () => {
    it('returns SCHOOL unavailabilities for the specified month', async () => {
      const schoolRecords = [
        {
          id: 'u-1',
          clinicId,
          employeeId: 'emp-1',
          type: 'SCHOOL',
          startDate: new Date('2026-04-07T00:00:00.000Z'),
          endDate: new Date('2026-04-07T00:00:00.000Z'),
        },
      ];

      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployee);
      mockPrismaService.unavailability.findMany.mockResolvedValue(schoolRecords);

      const result = await service.listSchoolDays(clinicId, {
        employeeId: 'emp-1',
        month: '2026-04',
      });

      expect(result).toEqual(schoolRecords);
      expect(mockPrismaService.unavailability.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinicId,
            employeeId: 'emp-1',
            type: 'SCHOOL',
          }),
        }),
      );
    });

    it('scopes query to month boundaries', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployee);
      mockPrismaService.unavailability.findMany.mockResolvedValue([]);

      await service.listSchoolDays(clinicId, {
        employeeId: 'emp-1',
        month: '2026-02',
      });

      const call = mockPrismaService.unavailability.findMany.mock.calls[0][0];
      const startGte = call.where.startDate.gte;
      const endLte = call.where.endDate.lte;

      expect(startGte.toISOString()).toBe('2026-02-01T00:00:00.000Z');
      expect(endLte.getUTCMonth()).toBe(1); // February
      expect(endLte.getUTCDate()).toBe(28);
    });

    it('throws NotFoundException for employee from another clinic', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.listSchoolDays(otherClinicId, {
          employeeId: 'emp-1',
          month: '2026-04',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listUndeclaredApprentices', () => {
    it('returns apprentices without SCHOOL declarations for the month', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'a-1',
          firstName: 'Léa',
          lastName: 'Bernard',
          email: 'lea@clinic.fr',
          unavailabilities: [],
        },
        {
          id: 'a-2',
          firstName: 'Tom',
          lastName: 'Martin',
          email: 'tom@clinic.fr',
          unavailabilities: [{ id: 'u-1' }],
        },
      ]);

      const result = await service.listUndeclaredApprentices(clinicId, '2026-04');

      expect(result).toEqual([
        {
          id: 'a-1',
          firstName: 'Léa',
          lastName: 'Bernard',
          email: 'lea@clinic.fr',
        },
      ]);
    });

    it('only queries active APPRENTICE employees', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([]);

      await service.listUndeclaredApprentices(clinicId, '2026-04');

      expect(mockPrismaService.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinicId,
            jobType: 'APPRENTICE',
            isActive: true,
          }),
        }),
      );
    });

    it('returns empty when all apprentices have declared', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'a-1',
          firstName: 'Léa',
          lastName: 'Bernard',
          email: 'lea@clinic.fr',
          unavailabilities: [{ id: 'u-1' }],
        },
      ]);

      const result = await service.listUndeclaredApprentices(clinicId, '2026-04');

      expect(result).toEqual([]);
    });
  });
});
