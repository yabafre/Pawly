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
      clinicService: mockClinicService as any,
    } as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should expose operational config procedures', () => {
    const procedures = Object.keys(clinicRouter._def.procedures);
    expect(procedures).toEqual(
      expect.arrayContaining(['getOperationalConfig', 'updateOperationalConfig']),
    );
  });

  it('should throw UNAUTHORIZED when getOperationalConfig is called without user', async () => {
    const caller = createCaller({
      user: null,
      prisma: mockPrisma as any,
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
    expect(mockClinicService.getOperationalConfig).toHaveBeenCalledWith('clinic-123');
  });

  it('calls clinicService.updateOperationalConfig with validated payload', async () => {
    const payload = {
      workDays: ['MONDAY', 'TUESDAY'],
      defaultStartTime: '08:00',
      defaultEndTime: '18:00',
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

    const caller = createAuthenticatedCaller();
    const result = await caller.updateOperationalConfig(payload);

    expect(result).toEqual(payload);
    expect(mockClinicService.updateOperationalConfig).toHaveBeenCalledWith(
      'clinic-123',
      payload,
    );
  });

  it('rejects invalid updateOperationalConfig payload', async () => {
    const caller = createAuthenticatedCaller();

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
      clinicService: mockClinicService as any,
    } as any);

    await caller.getOperationalConfig();

    expect(mockClinicService.getOperationalConfig).toHaveBeenCalledWith(
      'clinic-secure',
    );
  });
});
