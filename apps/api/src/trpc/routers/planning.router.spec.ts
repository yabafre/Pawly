jest.mock('superjson', () => ({
  __esModule: true,
  default: {
    serialize: (v: unknown) => ({ json: v, meta: undefined }),
    deserialize: (v: { json: unknown }) => v.json ?? v,
  },
}));

import { TRPCError } from '@trpc/server';
import { planningRouter } from './planning.router';
import { createCallerFactory } from '../trpc';

const createCaller = createCallerFactory(planningRouter);

describe('planningRouter', () => {
  const mockPlanningService = {
    listRules: jest.fn(),
    getRuleById: jest.fn(),
    createRule: jest.fn(),
    updateRule: jest.fn(),
    deleteRule: jest.fn(),
    toggleRule: jest.fn(),
    validateShiftsAgainstRules: jest.fn(),
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

  const authenticatedAdmin = {
    sub: 'user-1',
    email: 'admin@clinic.fr',
    role: 'ADMIN',
    clinicId: 'clinic-123',
  };

  const authenticatedEmployee = {
    sub: 'user-2',
    email: 'employee@clinic.fr',
    role: 'EMPLOYEE',
    clinicId: 'clinic-123',
  };

  const createAdminCaller = () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
    return createCaller({
      user: authenticatedAdmin,
      prisma: mockPrisma as any,
      planningService: mockPlanningService as any,
    } as any);
  };

  const createEmployeeCaller = () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
    return createCaller({
      user: authenticatedEmployee,
      prisma: mockPrisma as any,
      planningService: mockPlanningService as any,
    } as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Router shape ───────────────────────────────────────────────────

  it('should export all 7 procedures', () => {
    const procedures = Object.keys(planningRouter._def.procedures);
    expect(procedures).toHaveLength(7);
    expect(procedures).toEqual(
      expect.arrayContaining([
        'listRules',
        'getRuleById',
        'createRule',
        'updateRule',
        'deleteRule',
        'toggleRule',
        'validateShifts',
      ]),
    );
  });

  // ─── Auth & subscription guards ───────────────────────────────────

  it('should throw UNAUTHORIZED when user is not authenticated', async () => {
    const caller = createCaller({
      user: null,
      prisma: mockPrisma as any,
      planningService: mockPlanningService as any,
    } as any);

    await expect(caller.listRules({})).rejects.toThrow(TRPCError);
    await expect(caller.listRules({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('should throw FORBIDDEN when no active subscription', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);

    const caller = createCaller({
      user: authenticatedAdmin,
      prisma: mockPrisma as any,
      planningService: mockPlanningService as any,
    } as any);

    await expect(caller.listRules({})).rejects.toThrow(TRPCError);
    await expect(caller.listRules({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  // ─── listRules ────────────────────────────────────────────────────

  describe('listRules', () => {
    it('returns rules for authenticated user', async () => {
      const mockRules = [{ id: 'rule-1', name: 'Test' }];
      mockPlanningService.listRules.mockResolvedValue(mockRules);

      const caller = createAdminCaller();
      const result = await caller.listRules({});

      expect(result).toEqual(mockRules);
      expect(mockPlanningService.listRules).toHaveBeenCalledWith(
        'clinic-123',
        {},
      );
    });

    it('passes filters to service', async () => {
      mockPlanningService.listRules.mockResolvedValue([]);

      const caller = createAdminCaller();
      await caller.listRules({
        category: 'STAFFING_MINIMUM',
        ruleType: 'HARD',
      });

      expect(mockPlanningService.listRules).toHaveBeenCalledWith(
        'clinic-123',
        { category: 'STAFFING_MINIMUM', ruleType: 'HARD' },
      );
    });

    it('allows EMPLOYEE role to list rules', async () => {
      mockPlanningService.listRules.mockResolvedValue([]);

      const caller = createEmployeeCaller();
      const result = await caller.listRules({});

      expect(result).toEqual([]);
    });
  });

  // ─── getRuleById ──────────────────────────────────────────────────

  describe('getRuleById', () => {
    it('returns rule by id scoped to clinic', async () => {
      const mockRule = { id: 'rule-1', name: 'Test', clinicId: 'clinic-123' };
      mockPlanningService.getRuleById.mockResolvedValue(mockRule);

      const caller = createAdminCaller();
      const result = await caller.getRuleById({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result).toEqual(mockRule);
      expect(mockPlanningService.getRuleById).toHaveBeenCalledWith(
        'clinic-123',
        '550e8400-e29b-41d4-a716-446655440000',
      );
    });
  });

  // ─── createRule ───────────────────────────────────────────────────

  describe('createRule', () => {
    const validInput = {
      name: 'Min 2 vets',
      ruleType: 'HARD' as const,
      category: 'STAFFING_MINIMUM' as const,
      isActive: true,
      priority: 10,
      config: { shiftTypeCode: 'SURGERY', minStaff: 2 },
    };

    it('creates rule with admin role', async () => {
      mockPlanningService.createRule.mockResolvedValue({
        id: 'new-1',
        ...validInput,
      });

      const caller = createAdminCaller();
      const result = await caller.createRule(validInput);

      expect(result.id).toBe('new-1');
      expect(mockPlanningService.createRule).toHaveBeenCalledWith(
        'clinic-123',
        validInput,
      );
    });

    it('throws FORBIDDEN for non-admin user', async () => {
      const caller = createEmployeeCaller();

      await expect(caller.createRule(validInput)).rejects.toThrow(TRPCError);
      await expect(caller.createRule(validInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('uses clinicId from context, not from input', async () => {
      mockPlanningService.createRule.mockResolvedValue({
        id: 'new-1',
        ...validInput,
      });

      const caller = createAdminCaller();
      await caller.createRule(validInput);

      expect(mockPlanningService.createRule).toHaveBeenCalledWith(
        'clinic-123',
        expect.any(Object),
      );
    });
  });

  // ─── updateRule ───────────────────────────────────────────────────

  describe('updateRule', () => {
    const validInput = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Updated name',
      ruleType: 'HARD' as const,
      category: 'STAFFING_MINIMUM' as const,
      isActive: true,
      priority: 5,
      config: { shiftTypeCode: 'SURGERY', minStaff: 3 },
    };

    it('updates rule with admin role', async () => {
      mockPlanningService.updateRule.mockResolvedValue({
        ...validInput,
        clinicId: 'clinic-123',
      });

      const caller = createAdminCaller();
      const result = await caller.updateRule(validInput);

      expect(result.name).toBe('Updated name');
    });

    it('throws FORBIDDEN for non-admin', async () => {
      const caller = createEmployeeCaller();

      await expect(caller.updateRule(validInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  // ─── deleteRule ───────────────────────────────────────────────────

  describe('deleteRule', () => {
    it('deletes rule with admin role', async () => {
      mockPlanningService.deleteRule.mockResolvedValue({ id: 'rule-1' });

      const caller = createAdminCaller();
      await caller.deleteRule({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(mockPlanningService.deleteRule).toHaveBeenCalledWith(
        'clinic-123',
        '550e8400-e29b-41d4-a716-446655440000',
      );
    });

    it('throws FORBIDDEN for non-admin', async () => {
      const caller = createEmployeeCaller();

      await expect(
        caller.deleteRule({ id: '550e8400-e29b-41d4-a716-446655440000' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── toggleRule ───────────────────────────────────────────────────

  describe('toggleRule', () => {
    it('toggles rule with admin role', async () => {
      mockPlanningService.toggleRule.mockResolvedValue({
        id: 'rule-1',
        isActive: false,
      });

      const caller = createAdminCaller();
      const result = await caller.toggleRule({
        id: '550e8400-e29b-41d4-a716-446655440000',
        isActive: false,
      });

      expect(result.isActive).toBe(false);
    });

    it('throws FORBIDDEN for non-admin', async () => {
      const caller = createEmployeeCaller();

      await expect(
        caller.toggleRule({
          id: '550e8400-e29b-41d4-a716-446655440000',
          isActive: false,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── validateShifts ───────────────────────────────────────────────

  describe('validateShifts', () => {
    it('returns validation results', async () => {
      mockPlanningService.validateShiftsAgainstRules.mockResolvedValue({
        hardViolations: [],
        softViolations: [],
      });

      const caller = createAdminCaller();
      const result = await caller.validateShifts({
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z',
      });

      expect(result).toEqual({
        hardViolations: [],
        softViolations: [],
      });
    });

    it('allows EMPLOYEE role to validate shifts', async () => {
      mockPlanningService.validateShiftsAgainstRules.mockResolvedValue({
        hardViolations: [],
        softViolations: [],
      });

      const caller = createEmployeeCaller();
      const result = await caller.validateShifts({
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z',
      });

      expect(result.hardViolations).toHaveLength(0);
    });
  });
});
