jest.mock('superjson', () => ({
  __esModule: true,
  default: {
    serialize: (v: unknown) => ({ json: v, meta: undefined }),
    deserialize: (v: { json: unknown }) => v.json ?? v,
  },
}));

import { TRPCError } from '@trpc/server';
import { stripeRouter } from './stripe.router';
import { createCallerFactory } from '../trpc';

const createCaller = createCallerFactory(stripeRouter);

describe('stripeRouter — getBillingOverview', () => {
  const mockSubscription = {
    id: 'sub_db_1',
    clinicId: 'clinic_1',
    stripeCustomerId: 'cus_test_123',
    stripeSubscriptionId: 'sub_test_123',
    status: 'active',
    planKey: 'starter_monthly',
    entitlementTier: 'starter',
    currentPeriodEnd: new Date(),
    cancelAtPeriodEnd: false,
    promotionCodeId: null,
    couponId: null,
    discountType: null,
    discountValue: null,
    couponMetadataType: null,
  };

  const mockDetails = {
    status: 'active',
    planKey: 'starter_monthly',
    planName: 'Starter Plan',
    entitlementTier: 'starter',
    currentPeriodEnd: '2026-03-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    trialEnd: null,
    priceAmount: 2900,
    priceCurrency: 'eur',
    priceInterval: 'month',
    promotionCodeName: null,
  };

  const mockInvoices = [
    {
      id: 'in_test_1',
      amountPaid: 2900,
      currency: 'eur',
      status: 'paid',
      invoicePdf: 'https://stripe.com/invoice.pdf',
      hostedInvoiceUrl: 'https://stripe.com/invoice',
      periodStart: '2026-01-01T00:00:00.000Z',
      periodEnd: '2026-02-01T00:00:00.000Z',
      created: '2026-01-01T00:00:00.000Z',
    },
  ];

  const mockPrisma = {
    subscription: {
      findUnique: jest.fn(),
    },
  };

  const mockStripeService = {
    getSubscriptionWithDetails: jest.fn(),
    listInvoices: jest.fn(),
    createBillingPortalSession: jest.fn(),
    createCheckoutSession: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw UNAUTHORIZED when user is not authenticated', async () => {
    const caller = createCaller({
      user: null,
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    await expect(caller.getBillingOverview()).rejects.toThrow(TRPCError);
    await expect(caller.getBillingOverview()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('should throw NOT_FOUND when no subscription exists for clinic', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);

    const caller = createCaller({
      user: { sub: 'user_1', email: 'a@b.com', role: 'STAFF', clinicId: 'clinic_1' },
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    await expect(caller.getBillingOverview()).rejects.toThrow(TRPCError);
    await expect(caller.getBillingOverview()).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(mockPrisma.subscription.findUnique).toHaveBeenCalledWith({
      where: { clinicId: 'clinic_1' },
    });
  });

  it('should throw PRECONDITION_FAILED when stripeSubscriptionId is null', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      ...mockSubscription,
      stripeSubscriptionId: null,
    });

    const caller = createCaller({
      user: { sub: 'user_1', email: 'a@b.com', role: 'STAFF', clinicId: 'clinic_1' },
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    await expect(caller.getBillingOverview()).rejects.toThrow(TRPCError);
    await expect(caller.getBillingOverview()).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it('should return billing overview with subscription details and invoices', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(mockSubscription);
    mockStripeService.getSubscriptionWithDetails.mockResolvedValue(mockDetails);
    mockStripeService.listInvoices.mockResolvedValue(mockInvoices);

    const caller = createCaller({
      user: { sub: 'user_1', email: 'a@b.com', role: 'STAFF', clinicId: 'clinic_1' },
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    const result = await caller.getBillingOverview();

    expect(result).toEqual({
      subscription: {
        ...mockDetails,
        promotionCodeId: null,
        couponId: null,
        discountType: null,
        discountValue: null,
        couponMetadataType: null,
      },
      invoices: mockInvoices,
    });
    expect(mockStripeService.getSubscriptionWithDetails).toHaveBeenCalledWith(
      'sub_test_123',
    );
    expect(mockStripeService.listInvoices).toHaveBeenCalledWith(
      'cus_test_123',
      10,
    );
  });

  it('should use clinicId from ctx.user, never from client input', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(mockSubscription);
    mockStripeService.getSubscriptionWithDetails.mockResolvedValue(mockDetails);
    mockStripeService.listInvoices.mockResolvedValue(mockInvoices);

    const caller = createCaller({
      user: { sub: 'user_1', email: 'a@b.com', role: 'STAFF', clinicId: 'clinic_secure' },
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    await caller.getBillingOverview();

    expect(mockPrisma.subscription.findUnique).toHaveBeenCalledWith({
      where: { clinicId: 'clinic_secure' },
    });
  });

  it('should return promotion details when subscription has promo data', async () => {
    const promoSubscription = {
      ...mockSubscription,
      promotionCodeId: 'promo_partner1',
      couponId: 'coupon_25off',
      discountType: 'percent',
      discountValue: 25,
      couponMetadataType: 'partner',
    };
    mockPrisma.subscription.findUnique.mockResolvedValue(promoSubscription);
    mockStripeService.getSubscriptionWithDetails.mockResolvedValue({
      ...mockDetails,
      promotionCodeName: 'PARTNER25',
    });
    mockStripeService.listInvoices.mockResolvedValue(mockInvoices);

    const caller = createCaller({
      user: { sub: 'user_1', email: 'a@b.com', role: 'STAFF', clinicId: 'clinic_1' },
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    const result = await caller.getBillingOverview();

    expect(result.subscription.promotionCodeId).toBe('promo_partner1');
    expect(result.subscription.couponId).toBe('coupon_25off');
    expect(result.subscription.discountType).toBe('percent');
    expect(result.subscription.discountValue).toBe(25);
    expect(result.subscription.couponMetadataType).toBe('partner');
    expect(result.subscription.promotionCodeName).toBe('PARTNER25');
  });

  it('should return null promotion fields when no promo applied', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(mockSubscription);
    mockStripeService.getSubscriptionWithDetails.mockResolvedValue(mockDetails);
    mockStripeService.listInvoices.mockResolvedValue(mockInvoices);

    const caller = createCaller({
      user: { sub: 'user_1', email: 'a@b.com', role: 'STAFF', clinicId: 'clinic_1' },
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    const result = await caller.getBillingOverview();

    expect(result.subscription.promotionCodeId).toBeNull();
    expect(result.subscription.couponId).toBeNull();
    expect(result.subscription.discountType).toBeNull();
    expect(result.subscription.discountValue).toBeNull();
    expect(result.subscription.couponMetadataType).toBeNull();
  });
});

describe('stripeRouter — getSubscriptionStatus', () => {
  const mockPrisma = {
    subscription: {
      findUnique: jest.fn(),
    },
  };

  const mockStripeService = {
    getSubscriptionWithDetails: jest.fn(),
    listInvoices: jest.fn(),
    createBillingPortalSession: jest.fn(),
    createCheckoutSession: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw UNAUTHORIZED when user is not authenticated', async () => {
    const caller = createCaller({
      user: null,
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    await expect(caller.getSubscriptionStatus()).rejects.toThrow(TRPCError);
    await expect(caller.getSubscriptionStatus()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('should return null when no subscription exists', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);

    const caller = createCaller({
      user: { sub: 'user_1', email: 'a@b.com', role: 'STAFF', clinicId: 'clinic_1' },
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    const result = await caller.getSubscriptionStatus();
    expect(result).toBeNull();
  });

  it('should return subscription status for active subscription', async () => {
    const periodEnd = new Date('2026-03-01T00:00:00.000Z');
    mockPrisma.subscription.findUnique.mockResolvedValue({
      status: 'active',
      entitlementTier: 'starter',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: periodEnd,
    });

    const caller = createCaller({
      user: { sub: 'user_1', email: 'a@b.com', role: 'STAFF', clinicId: 'clinic_1' },
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    const result = await caller.getSubscriptionStatus();
    expect(result).toEqual({
      status: 'active',
      entitlementTier: 'starter',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: '2026-03-01T00:00:00.000Z',
    });
  });

  it('should return subscription status for inactive subscription', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue({
      status: 'past_due',
      entitlementTier: 'starter',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date('2026-02-15T00:00:00.000Z'),
    });

    const caller = createCaller({
      user: { sub: 'user_1', email: 'a@b.com', role: 'STAFF', clinicId: 'clinic_1' },
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    const result = await caller.getSubscriptionStatus();
    expect(result).not.toBeNull();
    expect(result!.status).toBe('past_due');
  });

  it('should use clinicId from ctx.user for lookup', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);

    const caller = createCaller({
      user: { sub: 'user_1', email: 'a@b.com', role: 'STAFF', clinicId: 'clinic_secure' },
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    await caller.getSubscriptionStatus();

    expect(mockPrisma.subscription.findUnique).toHaveBeenCalledWith({
      where: { clinicId: 'clinic_secure' },
      select: {
        status: true,
        entitlementTier: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: true,
      },
    });
  });
});

describe('stripeRouter — createBillingPortalSession', () => {
  const mockSubscription = {
    id: 'sub_db_1',
    clinicId: 'clinic_1',
    stripeCustomerId: 'cus_test_123',
    stripeSubscriptionId: 'sub_test_123',
    status: 'active',
  };

  const mockPrisma = {
    subscription: {
      findUnique: jest.fn(),
    },
  };

  const mockStripeService = {
    getSubscriptionWithDetails: jest.fn(),
    listInvoices: jest.fn(),
    createBillingPortalSession: jest.fn(),
    createCheckoutSession: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw UNAUTHORIZED when user is not authenticated', async () => {
    const caller = createCaller({
      user: null,
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    await expect(
      caller.createBillingPortalSession({
        returnUrl: 'https://example.com/billing',
      }),
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.createBillingPortalSession({
        returnUrl: 'https://example.com/billing',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('should throw NOT_FOUND when no subscription exists for clinic', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);

    const caller = createCaller({
      user: { sub: 'user_1', email: 'a@b.com', role: 'STAFF', clinicId: 'clinic_1' },
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    await expect(
      caller.createBillingPortalSession({
        returnUrl: 'https://example.com/billing',
      }),
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.createBillingPortalSession({
        returnUrl: 'https://example.com/billing',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('should reject invalid returnUrl via Zod validation', async () => {
    const caller = createCaller({
      user: { sub: 'user_1', email: 'a@b.com', role: 'STAFF', clinicId: 'clinic_1' },
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    await expect(
      caller.createBillingPortalSession({
        returnUrl: 'not-a-url',
      }),
    ).rejects.toThrow();
  });

  it('should create portal session and return URL', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(mockSubscription);
    mockStripeService.createBillingPortalSession.mockResolvedValue({
      url: 'https://billing.stripe.com/session/test_portal',
    });

    const caller = createCaller({
      user: { sub: 'user_1', email: 'a@b.com', role: 'STAFF', clinicId: 'clinic_1' },
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    const result = await caller.createBillingPortalSession({
      returnUrl: 'https://example.com/billing',
      locale: 'fr',
    });

    expect(result).toEqual({
      url: 'https://billing.stripe.com/session/test_portal',
    });
    expect(mockStripeService.createBillingPortalSession).toHaveBeenCalledWith(
      'cus_test_123',
      'https://example.com/billing',
      'fr',
    );
  });

  it('should pass locale from input to service', async () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(mockSubscription);
    mockStripeService.createBillingPortalSession.mockResolvedValue({
      url: 'https://billing.stripe.com/session/test_portal',
    });

    const caller = createCaller({
      user: { sub: 'user_1', email: 'a@b.com', role: 'STAFF', clinicId: 'clinic_1' },
      prisma: mockPrisma as any,
      stripeService: mockStripeService as any,
    } as any);

    await caller.createBillingPortalSession({
      returnUrl: 'https://example.com/billing',
      locale: 'en',
    });

    expect(mockStripeService.createBillingPortalSession).toHaveBeenCalledWith(
      'cus_test_123',
      'https://example.com/billing',
      'en',
    );
  });
});
