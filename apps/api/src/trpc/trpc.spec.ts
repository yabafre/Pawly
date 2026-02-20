jest.mock('superjson', () => ({
  __esModule: true,
  default: {
    serialize: (v: unknown) => ({ json: v, meta: undefined }),
    deserialize: (v: { json: unknown }) => v.json ?? v,
  },
}));

import { TRPCError } from '@trpc/server';
import { router, publicProcedure, isAuthed, isSubscribed, isEntitled, createCallerFactory } from './trpc';

// Create a test router that uses the subscription middleware
const testRouter = router({
  subscribedRoute: publicProcedure
    .use(isAuthed)
    .use(isSubscribed)
    .query(({ ctx }) => {
      return { ok: true, subscription: (ctx as any).subscription };
    }),

  entitledRoute: publicProcedure
    .use(isAuthed)
    .use(isSubscribed)
    .use(isEntitled('professional'))
    .query(() => {
      return { ok: true };
    }),
});

const createCaller = createCallerFactory(testRouter);

describe('isSubscribed middleware', () => {
  const mockPrisma = {
    subscription: {
      findUnique: jest.fn(),
    },
  };

  const baseUser = {
    sub: 'user_1',
    email: 'a@b.com',
    role: 'STAFF',
    clinicId: 'clinic_1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow access when subscription status is "active"', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      status: 'active',
      entitlementTier: 'starter',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });

    const caller = createCaller({
      user: baseUser,
      prisma: mockPrisma as any,
    } as any);

    const result = await caller.subscribedRoute();
    expect(result.ok).toBe(true);
    expect(result.subscription.status).toBe('active');
  });

  it('should allow access when subscription status is "trialing"', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      status: 'trialing',
      entitlementTier: 'professional',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });

    const caller = createCaller({
      user: baseUser,
      prisma: mockPrisma as any,
    } as any);

    const result = await caller.subscribedRoute();
    expect(result.ok).toBe(true);
    expect(result.subscription.status).toBe('trialing');
  });

  it('should deny access when subscription status is "past_due"', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      status: 'past_due',
      entitlementTier: 'starter',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });

    const caller = createCaller({
      user: baseUser,
      prisma: mockPrisma as any,
    } as any);

    await expect(caller.subscribedRoute()).rejects.toThrow(TRPCError);
    await expect(caller.subscribedRoute()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Active subscription required',
    });
  });

  it('should deny access when subscription status is "canceled"', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      status: 'canceled',
      entitlementTier: 'starter',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: true,
    });

    const caller = createCaller({
      user: baseUser,
      prisma: mockPrisma as any,
    } as any);

    await expect(caller.subscribedRoute()).rejects.toThrow(TRPCError);
    await expect(caller.subscribedRoute()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Active subscription required',
    });
  });

  it('should deny access when subscription status is "unpaid"', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      status: 'unpaid',
      entitlementTier: 'starter',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });

    const caller = createCaller({
      user: baseUser,
      prisma: mockPrisma as any,
    } as any);

    await expect(caller.subscribedRoute()).rejects.toThrow(TRPCError);
    await expect(caller.subscribedRoute()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Active subscription required',
    });
  });

  it('should deny access when no subscription exists', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);

    const caller = createCaller({
      user: baseUser,
      prisma: mockPrisma as any,
    } as any);

    await expect(caller.subscribedRoute()).rejects.toThrow(TRPCError);
    await expect(caller.subscribedRoute()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Active subscription required',
    });
  });

  it('should pass subscription data into context', async () => {
    const subData = {
      status: 'active',
      entitlementTier: 'professional',
      currentPeriodEnd: new Date('2026-04-01'),
      cancelAtPeriodEnd: false,
    };
    mockPrisma.subscription.findUnique.mockResolvedValue(subData);

    const caller = createCaller({
      user: baseUser,
      prisma: mockPrisma as any,
    } as any);

    const result = await caller.subscribedRoute();
    expect(result.subscription.entitlementTier).toBe('professional');
  });

  it('should look up subscription by ctx.user.clinicId', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      status: 'active',
      entitlementTier: 'starter',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });

    const caller = createCaller({
      user: { ...baseUser, clinicId: 'clinic_secure_123' },
      prisma: mockPrisma as any,
    } as any);

    await caller.subscribedRoute();

    expect(mockPrisma.subscription.findUnique).toHaveBeenCalledWith({
      where: { clinicId: 'clinic_secure_123' },
      select: {
        status: true,
        entitlementTier: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      },
    });
  });
});

describe('isEntitled middleware', () => {
  const mockPrisma = {
    subscription: {
      findUnique: jest.fn(),
    },
  };

  const baseUser = {
    sub: 'user_1',
    email: 'a@b.com',
    role: 'STAFF',
    clinicId: 'clinic_1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow access when tier matches exactly', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      status: 'active',
      entitlementTier: 'professional',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });

    const caller = createCaller({
      user: baseUser,
      prisma: mockPrisma as any,
    } as any);

    const result = await caller.entitledRoute();
    expect(result.ok).toBe(true);
  });

  it('should allow access when tier is higher than required', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      status: 'active',
      entitlementTier: 'enterprise',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });

    const caller = createCaller({
      user: baseUser,
      prisma: mockPrisma as any,
    } as any);

    const result = await caller.entitledRoute();
    expect(result.ok).toBe(true);
  });

  it('should deny access when tier is lower than required', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      status: 'active',
      entitlementTier: 'starter',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });

    const caller = createCaller({
      user: baseUser,
      prisma: mockPrisma as any,
    } as any);

    await expect(caller.entitledRoute()).rejects.toThrow(TRPCError);
    await expect(caller.entitledRoute()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining('professional'),
    });
  });

  it('should deny access when current tier is unknown', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      status: 'active',
      entitlementTier: 'unknown_tier',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });

    const caller = createCaller({
      user: baseUser,
      prisma: mockPrisma as any,
    } as any);

    await expect(caller.entitledRoute()).rejects.toThrow(TRPCError);
    await expect(caller.entitledRoute()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('should deny access when current tier is empty string', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      status: 'active',
      entitlementTier: '',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });

    const caller = createCaller({
      user: baseUser,
      prisma: mockPrisma as any,
    } as any);

    await expect(caller.entitledRoute()).rejects.toThrow(TRPCError);
    await expect(caller.entitledRoute()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('isEntitled with unknown required tier', () => {
  const mockPrisma = {
    subscription: {
      findUnique: jest.fn(),
    },
  };

  const baseUser = {
    sub: 'user_1',
    email: 'a@b.com',
    role: 'STAFF',
    clinicId: 'clinic_1',
  };

  it('should deny access when required tier is not in hierarchy', async () => {
    // Create a router with an unknown required tier
    const unknownTierRouter = router({
      unknownRoute: publicProcedure
        .use(isAuthed)
        .use(isSubscribed)
        .use(isEntitled('platinum'))
        .query(() => ({ ok: true })),
    });

    const createUnknownCaller = createCallerFactory(unknownTierRouter);

    mockPrisma.subscription.findUnique.mockResolvedValue({
      status: 'active',
      entitlementTier: 'enterprise',
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
    });

    const caller = createUnknownCaller({
      user: baseUser,
      prisma: mockPrisma as any,
    } as any);

    await expect(caller.unknownRoute()).rejects.toThrow(TRPCError);
    await expect(caller.unknownRoute()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining('platinum'),
    });
  });
});
