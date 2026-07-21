jest.mock('superjson', () => ({
  __esModule: true,
  default: {
    serialize: (v: unknown) => ({ json: v, meta: undefined }),
    deserialize: (v: { json: unknown }) => v.json ?? v,
  },
}));

import { TRPCError } from '@trpc/server';
import { createCallerFactory } from '../trpc';
import { clinicRouter } from './clinic.router';

const createCaller = createCallerFactory(clinicRouter);

describe('clinicRouter', () => {
  const mockClinicService = {
    getOnboardingStatus: jest.fn(),
    updateClinicName: jest.fn(),
    upsertClinicConfig: jest.fn(),
    createShiftTypes: jest.fn(),
    completeOnboarding: jest.fn(),
    getOperationalConfig: jest.fn(),
    updateOperationalConfig: jest.fn(),
    listShiftTypes: jest.fn(),
    createSingleShiftType: jest.fn(),
    updateSingleShiftType: jest.fn(),
    deleteSingleShiftType: jest.fn(),
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
      redis: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
        del: jest.fn(),
        invalidatePattern: jest.fn(),
        incr: jest.fn().mockResolvedValue(1),
        isAvailable: false,
      } as any,
      clinicService: mockClinicService as any,
    } as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should expose operational config procedures', () => {
    const procedures = Object.keys(clinicRouter._def.procedures);
    expect(procedures).toEqual(
      expect.arrayContaining([
        'getOperationalConfig',
        'updateOperationalConfig',
      ]),
    );
  });

  it('should expose shift type CRUD procedures', () => {
    const procedures = Object.keys(clinicRouter._def.procedures);
    expect(procedures).toEqual(
      expect.arrayContaining([
        'listShiftTypes',
        'createShiftType',
        'updateShiftType',
        'deleteShiftType',
      ]),
    );
  });

  it('should throw UNAUTHORIZED when getOperationalConfig is called without user', async () => {
    const caller = createCaller({
      user: null,
      prisma: mockPrisma as any,
      redis: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
        del: jest.fn(),
        invalidatePattern: jest.fn(),
        incr: jest.fn().mockResolvedValue(1),
        isAvailable: false,
      } as any,
      clinicService: mockClinicService as any,
    } as any);

    await expect(caller.getOperationalConfig()).rejects.toThrow(TRPCError);
    await expect(caller.getOperationalConfig()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('should throw FORBIDDEN when getOperationalConfig is called without active subscription', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);

    const caller = createCaller({
      user: authenticatedUser,
      prisma: mockPrisma as any,
      redis: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
        del: jest.fn(),
        invalidatePattern: jest.fn(),
        incr: jest.fn().mockResolvedValue(1),
        isAvailable: false,
      } as any,
      clinicService: mockClinicService as any,
    } as any);

    await expect(caller.getOperationalConfig()).rejects.toThrow(TRPCError);
    await expect(caller.getOperationalConfig()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('should throw FORBIDDEN when updateOperationalConfig is called without active subscription', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);

    const caller = createCaller({
      user: authenticatedUser,
      prisma: mockPrisma as any,
      redis: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
        del: jest.fn(),
        invalidatePattern: jest.fn(),
        incr: jest.fn().mockResolvedValue(1),
        isAvailable: false,
      } as any,
      clinicService: mockClinicService as any,
    } as any);

    await expect(
      caller.updateOperationalConfig({
        workDays: ['MONDAY'],
        defaultStartTime: '08:00',
        defaultEndTime: '18:00',
        closedDays: [],
        specialDays: [],
      }),
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.updateOperationalConfig({
        workDays: ['MONDAY'],
        defaultStartTime: '08:00',
        defaultEndTime: '18:00',
        closedDays: [],
        specialDays: [],
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('calls clinicService.getOperationalConfig with clinicId from ctx.user', async () => {
    const expected = {
      workDays: ['MONDAY'],
      defaultStartTime: '08:00',
      defaultEndTime: '18:00',
      closedDays: [],
      specialDays: [],
    };
    mockClinicService.getOperationalConfig.mockResolvedValue(expected);

    const caller = createAuthenticatedCaller();
    const result = await caller.getOperationalConfig();

    expect(result).toEqual(expected);
    expect(mockClinicService.getOperationalConfig).toHaveBeenCalledWith(
      'clinic-123',
    );
  });

  it('calls clinicService.updateOperationalConfig with validated payload', async () => {
    const payload = {
      workDays: ['MONDAY', 'TUESDAY'] as ('MONDAY' | 'TUESDAY')[],
      defaultStartTime: '08:00',
      defaultEndTime: '18:00',
      is24_7: false,
      closedDays: [{ date: '2026-12-25', reason: 'Holiday' }],
      specialDays: [
        {
          date: '2026-12-24',
          startTime: '09:00',
          endTime: '14:00',
          label: 'Half-day',
        },
      ],
    };
    mockClinicService.updateOperationalConfig.mockResolvedValue(payload);

    const caller = createAdminCaller();
    const result = await caller.updateOperationalConfig(payload);

    expect(result).toEqual(payload);
    expect(mockClinicService.updateOperationalConfig).toHaveBeenCalledWith(
      'clinic-123',
      payload,
    );
  });

  it('rejects invalid updateOperationalConfig payload', async () => {
    const caller = createAdminCaller();

    await expect(
      caller.updateOperationalConfig({
        workDays: [],
        defaultStartTime: '18:00',
        defaultEndTime: '08:00',
        closedDays: [],
        specialDays: [],
      }),
    ).rejects.toThrow();
  });

  // ─── clinicId isolation ─────────────────────────────────────────────

  it('always uses clinicId from ctx.user, never from client input', async () => {
    const expected = {
      workDays: ['MONDAY'],
      defaultStartTime: '08:00',
      defaultEndTime: '18:00',
      closedDays: [],
      specialDays: [],
    };
    mockClinicService.getOperationalConfig.mockResolvedValue(expected);
    mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);

    const caller = createCaller({
      user: { ...authenticatedUser, clinicId: 'clinic-secure' },
      prisma: mockPrisma as any,
      redis: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
        del: jest.fn(),
        invalidatePattern: jest.fn(),
        incr: jest.fn().mockResolvedValue(1),
        isAvailable: false,
      } as any,
      clinicService: mockClinicService as any,
    } as any);

    await caller.getOperationalConfig();

    expect(mockClinicService.getOperationalConfig).toHaveBeenCalledWith(
      'clinic-secure',
    );
  });

  // ─── Shift Type CRUD ──────────────────────────────────────────────

  const createAdminCaller = () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
    return createCaller({
      user: { ...authenticatedUser, role: 'ADMIN' },
      prisma: mockPrisma as any,
      redis: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
        del: jest.fn(),
        invalidatePattern: jest.fn(),
        incr: jest.fn().mockResolvedValue(1),
        isAvailable: false,
      } as any,
      clinicService: mockClinicService as any,
    } as any);
  };

  describe('listShiftTypes', () => {
    it('calls clinicService.listShiftTypes with clinicId', async () => {
      const expected = [
        {
          id: 'st-1',
          name: 'Morning',
          code: 'AM',
          startTime: '08:00',
          endTime: '12:00',
          color: '#4F46E5',
        },
      ];
      mockClinicService.listShiftTypes.mockResolvedValue(expected);

      const caller = createAuthenticatedCaller();
      const result = await caller.listShiftTypes({});

      expect(result).toEqual(expected);
      expect(mockClinicService.listShiftTypes).toHaveBeenCalledWith(
        'clinic-123',
      );
    });

    it('throws UNAUTHORIZED without user', async () => {
      const caller = createCaller({
        user: null,
        prisma: mockPrisma as any,
        redis: {
          get: jest.fn().mockResolvedValue(null),
          set: jest.fn(),
          del: jest.fn(),
          invalidatePattern: jest.fn(),
          incr: jest.fn().mockResolvedValue(1),
          isAvailable: false,
        } as any,
        clinicService: mockClinicService as any,
      } as any);

      await expect(caller.listShiftTypes({})).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('throws FORBIDDEN without subscription', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);
      const caller = createCaller({
        user: authenticatedUser,
        prisma: mockPrisma as any,
        redis: {
          get: jest.fn().mockResolvedValue(null),
          set: jest.fn(),
          del: jest.fn(),
          invalidatePattern: jest.fn(),
          incr: jest.fn().mockResolvedValue(1),
          isAvailable: false,
        } as any,
        clinicService: mockClinicService as any,
      } as any);

      await expect(caller.listShiftTypes({})).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('createShiftType', () => {
    const validInput = {
      name: 'Morning',
      code: 'AM',
      startTime: '08:00',
      endTime: '12:00',
      color: '#4F46E5',
    };

    it('calls clinicService.createSingleShiftType for ADMIN', async () => {
      mockClinicService.createSingleShiftType.mockResolvedValue({
        id: 'st-1',
        ...validInput,
      });

      const caller = createAdminCaller();
      const result = await caller.createShiftType(validInput);

      expect(result).toEqual({ id: 'st-1', ...validInput });
      expect(mockClinicService.createSingleShiftType).toHaveBeenCalledWith(
        'clinic-123',
        expect.objectContaining({ name: 'Morning', code: 'AM' }),
      );
    });

    it('throws FORBIDDEN for non-ADMIN role', async () => {
      const caller = createAuthenticatedCaller();
      await expect(caller.createShiftType(validInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    // Story 13-3 (KON-132) — an overnight shift type (endTime before startTime) is
    // now valid; only a zero-length slot (endTime === startTime) is rejected.
    it('rejects invalid input (endTime === startTime)', async () => {
      const caller = createAdminCaller();
      await expect(
        caller.createShiftType({
          ...validInput,
          startTime: '08:00',
          endTime: '08:00',
        }),
      ).rejects.toThrow();
    });

    it('accepts an overnight shift type (endTime before startTime)', async () => {
      mockClinicService.createSingleShiftType.mockResolvedValue({
        id: 'st-night',
        name: 'Night',
        code: 'NIGHT',
        startTime: '22:00',
        endTime: '06:00',
        breakMinutes: 20,
        color: '#4F46E5',
      });
      const caller = createAdminCaller();
      await expect(
        // 22:00→06:00 is 8h worked, so story 13-4's mandatory-break rule
        // requires breakMinutes >= 20; this test asserts the OVERNIGHT
        // (endTime < startTime) acceptance, so the fixture is otherwise valid.
        caller.createShiftType({
          name: 'Night',
          code: 'NIGHT',
          startTime: '22:00',
          endTime: '06:00',
          breakMinutes: 20,
          color: '#4F46E5',
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('updateShiftType', () => {
    const validInput = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Afternoon',
    };

    it('calls clinicService.updateSingleShiftType for ADMIN', async () => {
      mockClinicService.updateSingleShiftType.mockResolvedValue({
        ...validInput,
        code: 'PM',
      });

      const caller = createAdminCaller();
      const result = await caller.updateShiftType(validInput);

      expect(mockClinicService.updateSingleShiftType).toHaveBeenCalledWith(
        'clinic-123',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        { name: 'Afternoon' },
      );
      expect(result).toEqual({ ...validInput, code: 'PM' });
    });

    it('throws FORBIDDEN for non-ADMIN role', async () => {
      const caller = createAuthenticatedCaller();
      await expect(caller.updateShiftType(validInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('deleteShiftType', () => {
    it('calls clinicService.deleteSingleShiftType for ADMIN', async () => {
      mockClinicService.deleteSingleShiftType.mockResolvedValue({
        deleted: true,
      });

      const caller = createAdminCaller();
      const result = await caller.deleteShiftType({
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      });

      expect(mockClinicService.deleteSingleShiftType).toHaveBeenCalledWith(
        'clinic-123',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      );
      expect(result).toEqual({ deleted: true });
    });

    it('throws FORBIDDEN for non-ADMIN role', async () => {
      const caller = createAuthenticatedCaller();
      await expect(
        caller.deleteShiftType({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });
});
