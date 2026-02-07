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
      subscription: mockDetails,
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
