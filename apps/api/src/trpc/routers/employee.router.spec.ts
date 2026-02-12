jest.mock('superjson', () => ({
  __esModule: true,
  default: {
    serialize: (v: unknown) => ({ json: v, meta: undefined }),
    deserialize: (v: { json: unknown }) => v.json ?? v,
  },
}));

import { TRPCError } from '@trpc/server';
import { employeeRouter } from './employee.router';
import { createCallerFactory } from '../trpc';

const createCaller = createCallerFactory(employeeRouter);

describe('employeeRouter', () => {
  const mockEmployeeService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    toggleActive: jest.fn(),
    listConstraints: jest.fn(),
    createConstraint: jest.fn(),
    updateConstraint: jest.fn(),
    deleteConstraint: jest.fn(),
    listHardRules: jest.fn(),
    declareSchoolDays: jest.fn(),
    listSchoolDays: jest.fn(),
    resendInvitation: jest.fn(),
    validateEmployeeOwnership: jest.fn(),
    listUndeclaredApprentices: jest.fn(),
  };

  const mockPrisma = {
    subscription: {
      findUnique: jest.fn(),
    },
  };

  const activeSubscription = {
    status: 'active',
    entitlementTier: 'starter',
    currentPeriodEnd: new Date('2026-12-31'),
    cancelAtPeriodEnd: false,
  };

  const authenticatedUser = {
    sub: 'user-1',
    email: 'admin@clinic.fr',
    role: 'STAFF',
    clinicId: 'clinic-123',
  };

  const createAuthenticatedCaller = () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
    return createCaller({
      user: authenticatedUser,
      prisma: mockPrisma as any,
      employeeService: mockEmployeeService as any,
    } as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Router shape ───────────────────────────────────────────────────

  it('should export all 14 procedures', () => {
    const procedures = Object.keys(employeeRouter._def.procedures);
    expect(procedures).toHaveLength(14);
    expect(procedures).toEqual(
      expect.arrayContaining([
        'list',
        'getById',
        'create',
        'update',
        'toggleActive',
        'resendInvitation',
        'listConstraints',
        'createConstraint',
        'updateConstraint',
        'deleteConstraint',
        'listHardRules',
        'declareSchoolDays',
        'listSchoolDays',
        'listUndeclaredApprentices',
      ]),
    );
  });

  // ─── Auth & subscription guards ─────────────────────────────────────

  it('should throw UNAUTHORIZED when user is not authenticated', async () => {
    const caller = createCaller({
      user: null,
      prisma: mockPrisma as any,
      employeeService: mockEmployeeService as any,
    } as any);

    await expect(caller.list()).rejects.toThrow(TRPCError);
    await expect(caller.list()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('should throw FORBIDDEN when user has no active subscription', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);

    const caller = createCaller({
      user: authenticatedUser,
      prisma: mockPrisma as any,
      employeeService: mockEmployeeService as any,
    } as any);

    await expect(caller.list()).rejects.toThrow(TRPCError);
    await expect(caller.list()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  // ─── list ───────────────────────────────────────────────────────────

  describe('list', () => {
    it('calls employeeService.findAll with clinicId and undefined when no input', async () => {
      const mockResult = [{ id: 'emp-1', firstName: 'Jean' }];
      mockEmployeeService.findAll.mockResolvedValue(mockResult);

      const caller = createAuthenticatedCaller();
      const result = await caller.list();

      expect(result).toEqual(mockResult);
      expect(mockEmployeeService.findAll).toHaveBeenCalledWith(
        'clinic-123',
        undefined,
      );
    });

    it('passes filter input to findAll when provided', async () => {
      mockEmployeeService.findAll.mockResolvedValue([]);

      const caller = createAuthenticatedCaller();
      const input = { includeInactive: true, jobType: 'VET' as const };
      await caller.list(input);

      expect(mockEmployeeService.findAll).toHaveBeenCalledWith(
        'clinic-123',
        input,
      );
    });

    it('passes search filter to findAll', async () => {
      mockEmployeeService.findAll.mockResolvedValue([]);

      const caller = createAuthenticatedCaller();
      await caller.list({ search: 'Dupont' });

      expect(mockEmployeeService.findAll).toHaveBeenCalledWith('clinic-123', {
        search: 'Dupont',
      });
    });
  });

  // ─── getById ────────────────────────────────────────────────────────

  describe('getById', () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';

    it('calls employeeService.findById with clinicId and id', async () => {
      const mockEmployee = { id: validId, firstName: 'Jean' };
      mockEmployeeService.findById.mockResolvedValue(mockEmployee);

      const caller = createAuthenticatedCaller();
      const result = await caller.getById({ id: validId });

      expect(result).toEqual(mockEmployee);
      expect(mockEmployeeService.findById).toHaveBeenCalledWith(
        'clinic-123',
        validId,
      );
    });

    it('rejects invalid UUID input via Zod validation', async () => {
      const caller = createAuthenticatedCaller();

      await expect(caller.getById({ id: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  // ─── create ─────────────────────────────────────────────────────────

  describe('create', () => {
    const validInput = {
      firstName: 'Marie',
      lastName: 'Martin',
      email: 'marie@clinic.fr',
      phone: '+33612345678',
      jobType: 'VET' as const,
      contractType: 'CDI' as const,
      contractHours: 35,
      color: '#3b82f6',
      hireDate: '2024-01-15T00:00:00.000Z',
      endDate: '',
    };

    it('calls employeeService.create with clinicId and validated input', async () => {
      const mockCreated = {
        id: 'new-emp',
        ...validInput,
        clinicId: 'clinic-123',
      };
      mockEmployeeService.create.mockResolvedValue(mockCreated);

      const caller = createAuthenticatedCaller();
      const result = await caller.create(validInput);

      expect(result).toEqual(mockCreated);
      expect(mockEmployeeService.create).toHaveBeenCalledWith(
        'clinic-123',
        expect.objectContaining({
          firstName: 'Marie',
          lastName: 'Martin',
          jobType: 'VET',
          contractType: 'CDI',
        }),
      );
    });

    it('rejects input with missing required fields via Zod validation', async () => {
      const caller = createAuthenticatedCaller();

      await expect(caller.create({ firstName: '' } as any)).rejects.toThrow();
    });

    it('rejects input with invalid color format', async () => {
      const caller = createAuthenticatedCaller();

      await expect(
        caller.create({ ...validInput, color: 'not-hex' }),
      ).rejects.toThrow();
    });
  });

  // ─── update ─────────────────────────────────────────────────────────

  describe('update', () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';

    it('calls employeeService.update with clinicId and input', async () => {
      const updateInput = { id: validId, firstName: 'Updated' };
      const mockUpdated = {
        ...updateInput,
        lastName: 'Dupont',
        clinicId: 'clinic-123',
      };
      mockEmployeeService.update.mockResolvedValue(mockUpdated);

      const caller = createAuthenticatedCaller();
      const result = await caller.update(updateInput);

      expect(result).toEqual(mockUpdated);
      expect(mockEmployeeService.update).toHaveBeenCalledWith(
        'clinic-123',
        updateInput,
      );
    });

    it('allows partial updates (only id is required)', async () => {
      const updateInput = { id: validId, contractHours: 20 };
      mockEmployeeService.update.mockResolvedValue({ ...updateInput });

      const caller = createAuthenticatedCaller();
      await caller.update(updateInput);

      expect(mockEmployeeService.update).toHaveBeenCalledWith(
        'clinic-123',
        updateInput,
      );
    });

    it('rejects update without a valid UUID id', async () => {
      const caller = createAuthenticatedCaller();

      await expect(
        caller.update({ id: 'bad-id', firstName: 'Hack' }),
      ).rejects.toThrow();
    });
  });

  // ─── toggleActive ──────────────────────────────────────────────────

  describe('toggleActive', () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';

    it('calls employeeService.toggleActive with clinicId and id', async () => {
      const mockToggled = { id: validId, isActive: false };
      mockEmployeeService.toggleActive.mockResolvedValue(mockToggled);

      const caller = createAuthenticatedCaller();
      const result = await caller.toggleActive({ id: validId });

      expect(result).toEqual(mockToggled);
      expect(mockEmployeeService.toggleActive).toHaveBeenCalledWith(
        'clinic-123',
        validId,
      );
    });

    it('rejects invalid UUID input via Zod validation', async () => {
      const caller = createAuthenticatedCaller();

      await expect(caller.toggleActive({ id: 'invalid' })).rejects.toThrow();
    });
  });

  // ─── resendInvitation ──────────────────────────────────────────────

  describe('resendInvitation', () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';

    it('calls employeeService.resendInvitation with clinicId and id', async () => {
      mockEmployeeService.resendInvitation.mockResolvedValue({
        message: 'Invitation resent',
      });

      const caller = createAuthenticatedCaller();
      const result = await caller.resendInvitation({ id: validId });

      expect(result).toEqual({ message: 'Invitation resent' });
      expect(mockEmployeeService.resendInvitation).toHaveBeenCalledWith(
        'clinic-123',
        validId,
      );
    });

    it('rejects invalid UUID input via Zod validation', async () => {
      const caller = createAuthenticatedCaller();

      await expect(
        caller.resendInvitation({ id: 'not-a-uuid' }),
      ).rejects.toThrow();
    });
  });

  // ─── listConstraints ────────────────────────────────────────────────

  describe('listConstraints', () => {
    const employeeId = '550e8400-e29b-41d4-a716-446655440000';

    it('calls employeeService.listConstraints with clinicId and input', async () => {
      const expected = [{ id: 'c1', employeeId }];
      mockEmployeeService.listConstraints.mockResolvedValue(expected);

      const caller = createAuthenticatedCaller();
      const result = await caller.listConstraints({ employeeId });

      expect(result).toEqual(expected);
      expect(mockEmployeeService.listConstraints).toHaveBeenCalledWith(
        'clinic-123',
        { employeeId },
      );
    });

    it('rejects invalid employeeId', async () => {
      const caller = createAuthenticatedCaller();

      await expect(
        caller.listConstraints({ employeeId: 'invalid' }),
      ).rejects.toThrow();
    });
  });

  // ─── createConstraint ───────────────────────────────────────────────

  describe('createConstraint', () => {
    const validInput = {
      employeeId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'SCHOOL' as const,
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-31T23:59:59.999Z',
      reason: '',
      daysOfWeek: [1, 3],
    };

    it('calls employeeService.createConstraint with validated input', async () => {
      mockEmployeeService.createConstraint.mockResolvedValue({
        id: 'c1',
        ...validInput,
      });

      const caller = createAuthenticatedCaller();
      await caller.createConstraint(validInput);

      expect(mockEmployeeService.createConstraint).toHaveBeenCalledWith(
        'clinic-123',
        validInput,
      );
    });

    it('rejects invalid date range', async () => {
      const caller = createAuthenticatedCaller();

      await expect(
        caller.createConstraint({
          ...validInput,
          startDate: '2026-03-20T00:00:00.000Z',
          endDate: '2026-03-10T00:00:00.000Z',
        }),
      ).rejects.toThrow();
    });
  });

  // ─── updateConstraint ───────────────────────────────────────────────

  describe('updateConstraint', () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';

    it('calls employeeService.updateConstraint', async () => {
      mockEmployeeService.updateConstraint.mockResolvedValue({
        id: validId,
        reason: 'Updated',
      });

      const caller = createAuthenticatedCaller();
      await caller.updateConstraint({
        id: validId,
        reason: 'Updated',
      });

      expect(mockEmployeeService.updateConstraint).toHaveBeenCalledWith(
        'clinic-123',
        { id: validId, reason: 'Updated' },
      );
    });

    it('rejects invalid id', async () => {
      const caller = createAuthenticatedCaller();

      await expect(
        caller.updateConstraint({ id: 'invalid' }),
      ).rejects.toThrow();
    });
  });

  // ─── deleteConstraint ───────────────────────────────────────────────

  describe('deleteConstraint', () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';

    it('calls employeeService.deleteConstraint with id', async () => {
      mockEmployeeService.deleteConstraint.mockResolvedValue({ id: validId });

      const caller = createAuthenticatedCaller();
      await caller.deleteConstraint({ id: validId });

      expect(mockEmployeeService.deleteConstraint).toHaveBeenCalledWith(
        'clinic-123',
        validId,
      );
    });
  });

  // ─── listHardRules ─────────────────────────────────────────────────

  describe('listHardRules', () => {
    const validInput = {
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-31T23:59:59.999Z',
      employeeIds: ['550e8400-e29b-41d4-a716-446655440000'],
    };

    it('calls employeeService.listHardRules with input', async () => {
      mockEmployeeService.listHardRules.mockResolvedValue([
        { ruleType: 'HARD' },
      ]);

      const caller = createAuthenticatedCaller();
      await caller.listHardRules(validInput);

      expect(mockEmployeeService.listHardRules).toHaveBeenCalledWith(
        'clinic-123',
        validInput,
      );
    });

    it('rejects invalid range', async () => {
      const caller = createAuthenticatedCaller();

      await expect(
        caller.listHardRules({
          ...validInput,
          startDate: '2026-03-31T00:00:00.000Z',
          endDate: '2026-03-01T00:00:00.000Z',
        }),
      ).rejects.toThrow();
    });
  });

  // ─── clinicId isolation ─────────────────────────────────────────────

  it('always uses clinicId from ctx.user, never from client input', async () => {
    mockEmployeeService.findAll.mockResolvedValue([]);
    mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);

    const caller = createCaller({
      user: { ...authenticatedUser, clinicId: 'clinic-secure' },
      prisma: mockPrisma as any,
      employeeService: mockEmployeeService as any,
    } as any);

    await caller.list();

    expect(mockEmployeeService.findAll).toHaveBeenCalledWith(
      'clinic-secure',
      undefined,
    );
  });

  // ─── declareSchoolDays ────────────────────────────────────────────

  describe('declareSchoolDays', () => {
    const employeeId = '550e8400-e29b-41d4-a716-446655440000';

    const validInput = {
      employeeId,
      month: '2026-04',
      dates: ['2026-04-07', '2026-04-14'],
    };

    it('calls employeeService.declareSchoolDays for ADMIN role', async () => {
      mockEmployeeService.declareSchoolDays.mockResolvedValue([]);

      mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
      const caller = createCaller({
        user: { ...authenticatedUser, role: 'ADMIN' },
        prisma: mockPrisma as any,
        employeeService: mockEmployeeService as any,
      } as any);

      await caller.declareSchoolDays(validInput);

      expect(mockEmployeeService.declareSchoolDays).toHaveBeenCalledWith(
        'clinic-123',
        employeeId,
        validInput,
      );
    });

    it('enforces self-service for EMPLOYEE role — validates linked employee', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
      mockEmployeeService.validateEmployeeOwnership.mockResolvedValue(undefined);
      mockEmployeeService.declareSchoolDays.mockResolvedValue([]);

      const caller = createCaller({
        user: { ...authenticatedUser, role: 'EMPLOYEE' },
        prisma: mockPrisma as any,
        employeeService: mockEmployeeService as any,
      } as any);

      await caller.declareSchoolDays(validInput);

      expect(mockEmployeeService.validateEmployeeOwnership).toHaveBeenCalledWith(
        'user-1',
        employeeId,
      );
      expect(mockEmployeeService.declareSchoolDays).toHaveBeenCalledWith(
        'clinic-123',
        employeeId,
        validInput,
      );
    });

    it('throws FORBIDDEN when EMPLOYEE tries to declare for another employee', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
      mockEmployeeService.validateEmployeeOwnership.mockRejectedValue(
        new TRPCError({ code: 'FORBIDDEN', message: 'You can only manage your own employee record' }),
      );

      const caller = createCaller({
        user: { ...authenticatedUser, role: 'EMPLOYEE' },
        prisma: mockPrisma as any,
        employeeService: mockEmployeeService as any,
      } as any);

      await expect(caller.declareSchoolDays(validInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('rejects invalid month format', async () => {
      const caller = createAuthenticatedCaller();

      await expect(
        caller.declareSchoolDays({
          ...validInput,
          month: '2026-13',
        }),
      ).rejects.toThrow();
    });
  });

  // ─── listSchoolDays ──────────────────────────────────────────────

  describe('listSchoolDays', () => {
    const employeeId = '550e8400-e29b-41d4-a716-446655440000';

    const validInput = {
      employeeId,
      month: '2026-04',
    };

    it('calls employeeService.listSchoolDays for ADMIN role', async () => {
      mockEmployeeService.listSchoolDays.mockResolvedValue([]);

      mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
      const caller = createCaller({
        user: { ...authenticatedUser, role: 'ADMIN' },
        prisma: mockPrisma as any,
        employeeService: mockEmployeeService as any,
      } as any);

      const result = await caller.listSchoolDays(validInput);

      expect(result).toEqual([]);
      expect(mockEmployeeService.listSchoolDays).toHaveBeenCalledWith(
        'clinic-123',
        validInput,
      );
    });

    it('enforces self-service for EMPLOYEE role', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
      mockEmployeeService.validateEmployeeOwnership.mockResolvedValue(undefined);
      mockEmployeeService.listSchoolDays.mockResolvedValue([]);

      const caller = createCaller({
        user: { ...authenticatedUser, role: 'EMPLOYEE' },
        prisma: mockPrisma as any,
        employeeService: mockEmployeeService as any,
      } as any);

      await caller.listSchoolDays(validInput);

      expect(mockEmployeeService.validateEmployeeOwnership).toHaveBeenCalledWith(
        'user-1',
        employeeId,
      );
      expect(mockEmployeeService.listSchoolDays).toHaveBeenCalledWith(
        'clinic-123',
        validInput,
      );
    });

    it('throws FORBIDDEN when EMPLOYEE queries another employee', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
      mockEmployeeService.validateEmployeeOwnership.mockRejectedValue(
        new TRPCError({ code: 'FORBIDDEN', message: 'You can only manage your own employee record' }),
      );

      const caller = createCaller({
        user: { ...authenticatedUser, role: 'EMPLOYEE' },
        prisma: mockPrisma as any,
        employeeService: mockEmployeeService as any,
      } as any);

      await expect(caller.listSchoolDays(validInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('rejects invalid employeeId', async () => {
      const caller = createAuthenticatedCaller();

      await expect(
        caller.listSchoolDays({ ...validInput, employeeId: 'not-uuid' }),
      ).rejects.toThrow();
    });
  });
});
