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

  const mockPlanningTemplateService = {
    listTemplates: jest.fn(),
    getTemplateById: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
    duplicateTemplate: jest.fn(),
  };

  const mockEquityCounterService = {
    getCountersForPeriod: jest.fn(),
    getQuarterlySummary: jest.fn(),
    recalculateForPeriod: jest.fn(),
  };

  const mockPlanningGenerationService = {
    generateMonthlyPlan: jest.fn(),
    listShiftsForMonth: jest.fn(),
    deleteGeneratedShifts: jest.fn(),
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
      planningTemplateService: mockPlanningTemplateService as any,
      equityCounterService: mockEquityCounterService as any,
      planningGenerationService: mockPlanningGenerationService as any,
    } as any);
  };

  const createEmployeeCaller = () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
    return createCaller({
      user: authenticatedEmployee,
      prisma: mockPrisma as any,
      planningService: mockPlanningService as any,
      planningTemplateService: mockPlanningTemplateService as any,
      equityCounterService: mockEquityCounterService as any,
      planningGenerationService: mockPlanningGenerationService as any,
    } as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Router shape ───────────────────────────────────────────────────

  it('should export all 19 procedures', () => {
    const procedures = Object.keys(planningRouter._def.procedures);
    expect(procedures).toHaveLength(19);
    expect(procedures).toEqual(
      expect.arrayContaining([
        'listRules',
        'getRuleById',
        'createRule',
        'updateRule',
        'deleteRule',
        'toggleRule',
        'validateShifts',
        'getEquityCounters',
        'getQuarterlySummary',
        'recalculateCounters',
        'listTemplates',
        'getTemplateById',
        'createTemplate',
        'updateTemplate',
        'deleteTemplate',
        'duplicateTemplate',
        'generatePlan',
        'listShiftsForMonth',
        'deleteGeneratedShifts',
      ]),
    );
  });

  // ─── Auth & subscription guards ───────────────────────────────────

  it('should throw UNAUTHORIZED when user is not authenticated', async () => {
    const caller = createCaller({
      user: null,
      prisma: mockPrisma as any,
      planningService: mockPlanningService as any,
      planningTemplateService: mockPlanningTemplateService as any,
      equityCounterService: mockEquityCounterService as any,
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
      planningTemplateService: mockPlanningTemplateService as any,
      equityCounterService: mockEquityCounterService as any,
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

  // ─── getEquityCounters ──────────────────────────────────────────

  describe('getEquityCounters', () => {
    const validInput = {
      year: 2026,
      months: [1, 2, 3],
    };

    it('returns counters for admin user', async () => {
      const mockCounters = [
        {
          id: 'ec-1',
          counterType: 'SATURDAY_WORKED',
          count: 3,
          year: 2026,
          month: 1,
          employeeId: 'emp-1',
          employee: {
            id: 'emp-1',
            firstName: 'Marie',
            lastName: 'Dupont',
            color: '#ff0000',
            jobType: 'VETERINARIAN',
            contractHours: 35,
          },
        },
      ];
      mockEquityCounterService.getCountersForPeriod.mockResolvedValue(
        mockCounters,
      );

      const caller = createAdminCaller();
      const result = await caller.getEquityCounters(validInput);

      expect(result).toEqual(mockCounters);
      expect(
        mockEquityCounterService.getCountersForPeriod,
      ).toHaveBeenCalledWith('clinic-123', 2026, [1, 2, 3], undefined);
    });

    it('passes counterTypes filter to service', async () => {
      mockEquityCounterService.getCountersForPeriod.mockResolvedValue([]);

      const caller = createAdminCaller();
      await caller.getEquityCounters({
        ...validInput,
        counterTypes: ['SATURDAY_WORKED', 'OVERTIME_HOURS'],
      });

      expect(
        mockEquityCounterService.getCountersForPeriod,
      ).toHaveBeenCalledWith('clinic-123', 2026, [1, 2, 3], [
        'SATURDAY_WORKED',
        'OVERTIME_HOURS',
      ]);
    });

    it('uses clinicId from context', async () => {
      mockEquityCounterService.getCountersForPeriod.mockResolvedValue([]);

      const caller = createAdminCaller();
      await caller.getEquityCounters(validInput);

      expect(
        mockEquityCounterService.getCountersForPeriod,
      ).toHaveBeenCalledWith('clinic-123', expect.any(Number), expect.any(Array), undefined);
    });

    it('throws FORBIDDEN for non-admin user', async () => {
      const caller = createEmployeeCaller();

      await expect(caller.getEquityCounters(validInput)).rejects.toThrow(
        TRPCError,
      );
      await expect(
        caller.getEquityCounters(validInput),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('throws UNAUTHORIZED when user is not authenticated', async () => {
      const caller = createCaller({
        user: null,
        prisma: mockPrisma as any,
        planningService: mockPlanningService as any,
        planningTemplateService: mockPlanningTemplateService as any,
        equityCounterService: mockEquityCounterService as any,
      } as any);

      await expect(caller.getEquityCounters(validInput)).rejects.toThrow(
        TRPCError,
      );
      await expect(
        caller.getEquityCounters(validInput),
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  // ─── getQuarterlySummary ────────────────────────────────────────

  describe('getQuarterlySummary', () => {
    const validInput = {
      year: 2026,
      quarter: 1,
    };

    it('returns quarterly summary for admin user', async () => {
      const mockSummary = [
        {
          employeeId: 'emp-1',
          counterType: 'SATURDAY_WORKED',
          _sum: { count: 5 },
        },
      ];
      mockEquityCounterService.getQuarterlySummary.mockResolvedValue(
        mockSummary,
      );

      const caller = createAdminCaller();
      const result = await caller.getQuarterlySummary(validInput);

      expect(result).toEqual(mockSummary);
      expect(
        mockEquityCounterService.getQuarterlySummary,
      ).toHaveBeenCalledWith('clinic-123', 2026, 1);
    });

    it('uses clinicId from context', async () => {
      mockEquityCounterService.getQuarterlySummary.mockResolvedValue([]);

      const caller = createAdminCaller();
      await caller.getQuarterlySummary(validInput);

      expect(
        mockEquityCounterService.getQuarterlySummary,
      ).toHaveBeenCalledWith('clinic-123', expect.any(Number), expect.any(Number));
    });

    it('throws FORBIDDEN for non-admin user', async () => {
      const caller = createEmployeeCaller();

      await expect(
        caller.getQuarterlySummary(validInput),
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.getQuarterlySummary(validInput),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('throws UNAUTHORIZED when user is not authenticated', async () => {
      const caller = createCaller({
        user: null,
        prisma: mockPrisma as any,
        planningService: mockPlanningService as any,
        planningTemplateService: mockPlanningTemplateService as any,
        equityCounterService: mockEquityCounterService as any,
      } as any);

      await expect(
        caller.getQuarterlySummary(validInput),
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.getQuarterlySummary(validInput),
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  // ─── recalculateCounters ────────────────────────────────────────

  describe('recalculateCounters', () => {
    const validInput = {
      year: 2026,
      month: 3,
    };

    it('recalculates counters for admin user', async () => {
      mockEquityCounterService.recalculateForPeriod.mockResolvedValue({
        countersUpdated: 16,
      });

      const caller = createAdminCaller();
      const result = await caller.recalculateCounters(validInput);

      expect(result).toEqual({ countersUpdated: 16 });
      expect(
        mockEquityCounterService.recalculateForPeriod,
      ).toHaveBeenCalledWith('clinic-123', 2026, 3);
    });

    it('uses clinicId from context', async () => {
      mockEquityCounterService.recalculateForPeriod.mockResolvedValue({
        countersUpdated: 0,
      });

      const caller = createAdminCaller();
      await caller.recalculateCounters(validInput);

      expect(
        mockEquityCounterService.recalculateForPeriod,
      ).toHaveBeenCalledWith('clinic-123', expect.any(Number), expect.any(Number));
    });

    it('throws FORBIDDEN for non-admin user', async () => {
      const caller = createEmployeeCaller();

      await expect(
        caller.recalculateCounters(validInput),
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.recalculateCounters(validInput),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('throws UNAUTHORIZED when user is not authenticated', async () => {
      const caller = createCaller({
        user: null,
        prisma: mockPrisma as any,
        planningService: mockPlanningService as any,
        planningTemplateService: mockPlanningTemplateService as any,
        equityCounterService: mockEquityCounterService as any,
      } as any);

      await expect(
        caller.recalculateCounters(validInput),
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.recalculateCounters(validInput),
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('propagates service errors', async () => {
      mockEquityCounterService.recalculateForPeriod.mockRejectedValue(
        new Error('Database connection lost'),
      );

      const caller = createAdminCaller();
      await expect(
        caller.recalculateCounters(validInput),
      ).rejects.toThrow('Database connection lost');
    });
  });

  // ─── Template procedures ─────────────────────────────────────────

  describe('listTemplates', () => {
    it('returns templates for admin user', async () => {
      const mockTemplates = [{ id: 'tmpl-1', name: 'Standard' }];
      mockPlanningTemplateService.listTemplates.mockResolvedValue(mockTemplates);

      const caller = createAdminCaller();
      const result = await caller.listTemplates({});

      expect(result).toEqual(mockTemplates);
      expect(mockPlanningTemplateService.listTemplates).toHaveBeenCalledWith('clinic-123');
    });

    it('throws FORBIDDEN for EMPLOYEE role', async () => {
      const caller = createEmployeeCaller();
      await expect(caller.listTemplates({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('getTemplateById', () => {
    it('returns template scoped to clinic', async () => {
      const mockTemplate = { id: 'tmpl-1', name: 'Test', clinicId: 'clinic-123' };
      mockPlanningTemplateService.getTemplateById.mockResolvedValue(mockTemplate);

      const caller = createAdminCaller();
      const result = await caller.getTemplateById({ id: '550e8400-e29b-41d4-a716-446655440000' });

      expect(result).toEqual(mockTemplate);
      expect(mockPlanningTemplateService.getTemplateById).toHaveBeenCalledWith(
        'clinic-123',
        '550e8400-e29b-41d4-a716-446655440000',
      );
    });

    it('throws FORBIDDEN for EMPLOYEE role', async () => {
      const caller = createEmployeeCaller();
      await expect(
        caller.getTemplateById({ id: '550e8400-e29b-41d4-a716-446655440000' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('createTemplate', () => {
    const validInput = {
      name: 'Standard Week',
      data: {
        days: [
          { dayOfWeek: 1, slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 2 }] },
        ],
      },
    };

    it('creates template with admin role', async () => {
      mockPlanningTemplateService.createTemplate.mockResolvedValue({ id: 'new-1', ...validInput });

      const caller = createAdminCaller();
      const result = await caller.createTemplate(validInput);

      expect(result.id).toBe('new-1');
      expect(mockPlanningTemplateService.createTemplate).toHaveBeenCalledWith(
        'clinic-123',
        validInput,
      );
    });

    it('throws FORBIDDEN for non-admin user', async () => {
      const caller = createEmployeeCaller();
      await expect(caller.createTemplate(validInput)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('uses clinicId from context', async () => {
      mockPlanningTemplateService.createTemplate.mockResolvedValue({ id: 'new-1' });

      const caller = createAdminCaller();
      await caller.createTemplate(validInput);

      expect(mockPlanningTemplateService.createTemplate).toHaveBeenCalledWith(
        'clinic-123',
        expect.any(Object),
      );
    });
  });

  describe('updateTemplate', () => {
    const validInput = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Updated',
      data: { days: [] },
    };

    it('updates template with admin role', async () => {
      mockPlanningTemplateService.updateTemplate.mockResolvedValue({ ...validInput, clinicId: 'clinic-123' });

      const caller = createAdminCaller();
      const result = await caller.updateTemplate(validInput);

      expect(result.name).toBe('Updated');
    });

    it('throws FORBIDDEN for non-admin', async () => {
      const caller = createEmployeeCaller();
      await expect(caller.updateTemplate(validInput)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('deleteTemplate', () => {
    it('deletes template with admin role', async () => {
      mockPlanningTemplateService.deleteTemplate.mockResolvedValue({ id: 'tmpl-1' });

      const caller = createAdminCaller();
      await caller.deleteTemplate({ id: '550e8400-e29b-41d4-a716-446655440000' });

      expect(mockPlanningTemplateService.deleteTemplate).toHaveBeenCalledWith(
        'clinic-123',
        '550e8400-e29b-41d4-a716-446655440000',
      );
    });

    it('throws FORBIDDEN for non-admin', async () => {
      const caller = createEmployeeCaller();
      await expect(
        caller.deleteTemplate({ id: '550e8400-e29b-41d4-a716-446655440000' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('duplicateTemplate', () => {
    it('duplicates template with admin role', async () => {
      mockPlanningTemplateService.duplicateTemplate.mockResolvedValue({
        id: 'tmpl-2',
        name: 'Standard (Copy)',
      });

      const caller = createAdminCaller();
      const result = await caller.duplicateTemplate({ id: '550e8400-e29b-41d4-a716-446655440000' });

      expect(result.name).toBe('Standard (Copy)');
      expect(mockPlanningTemplateService.duplicateTemplate).toHaveBeenCalledWith(
        'clinic-123',
        '550e8400-e29b-41d4-a716-446655440000',
      );
    });

    it('throws FORBIDDEN for non-admin', async () => {
      const caller = createEmployeeCaller();
      await expect(
        caller.duplicateTemplate({ id: '550e8400-e29b-41d4-a716-446655440000' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── Generation procedures ─────────────────────────────────────────

  describe('generatePlan', () => {
    it('should allow ADMIN to generate a plan', async () => {
      const caller = createAdminCaller();
      const mockResult = {
        assignments: [],
        holes: [],
        violations: { hard: [], soft: [] },
        stats: { totalSlots: 0, filledSlots: 0, holeCount: 0, hardViolationCount: 0, softWarningCount: 0 },
      };
      mockPlanningGenerationService.generateMonthlyPlan.mockResolvedValue(mockResult);

      const result = await caller.generatePlan({
        month: '2026-03',
        templateId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result).toEqual(mockResult);
      expect(mockPlanningGenerationService.generateMonthlyPlan).toHaveBeenCalledWith(
        'clinic-123',
        '2026-03',
        '550e8400-e29b-41d4-a716-446655440000',
      );
    });

    it('should reject EMPLOYEE with FORBIDDEN', async () => {
      const caller = createEmployeeCaller();

      await expect(
        caller.generatePlan({
          month: '2026-03',
          templateId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.generatePlan({
          month: '2026-03',
          templateId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('should use clinicId from context, not input', async () => {
      const caller = createAdminCaller();
      mockPlanningGenerationService.generateMonthlyPlan.mockResolvedValue({
        assignments: [], holes: [], violations: { hard: [], soft: [] },
        stats: { totalSlots: 0, filledSlots: 0, holeCount: 0, hardViolationCount: 0, softWarningCount: 0 },
      });

      await caller.generatePlan({
        month: '2026-03',
        templateId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(mockPlanningGenerationService.generateMonthlyPlan).toHaveBeenCalledWith(
        'clinic-123', // from context, not client-supplied
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('listShiftsForMonth', () => {
    it('should allow ADMIN to list shifts for a month', async () => {
      const caller = createAdminCaller();
      const mockShifts = [{ id: 'shift-1', date: new Date('2026-03-01'), source: 'GENERATED' }];
      mockPlanningGenerationService.listShiftsForMonth.mockResolvedValue(mockShifts);

      const result = await caller.listShiftsForMonth({ month: '2026-03' });

      expect(result).toEqual(mockShifts);
      expect(mockPlanningGenerationService.listShiftsForMonth).toHaveBeenCalledWith(
        'clinic-123',
        '2026-03',
      );
    });

    it('should reject EMPLOYEE with FORBIDDEN', async () => {
      const caller = createEmployeeCaller();

      await expect(
        caller.listShiftsForMonth({ month: '2026-03' }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.listShiftsForMonth({ month: '2026-03' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('deleteGeneratedShifts', () => {
    it('should allow ADMIN to delete generated shifts', async () => {
      const caller = createAdminCaller();
      mockPlanningGenerationService.deleteGeneratedShifts.mockResolvedValue({ deletedCount: 5 });

      const result = await caller.deleteGeneratedShifts({ month: '2026-03' });

      expect(result).toEqual({ deletedCount: 5 });
      expect(mockPlanningGenerationService.deleteGeneratedShifts).toHaveBeenCalledWith(
        'clinic-123',
        '2026-03',
      );
    });

    it('should reject EMPLOYEE with FORBIDDEN', async () => {
      const caller = createEmployeeCaller();

      await expect(
        caller.deleteGeneratedShifts({ month: '2026-03' }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.deleteGeneratedShifts({ month: '2026-03' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
