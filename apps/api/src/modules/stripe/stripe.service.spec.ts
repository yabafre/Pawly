import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { PrismaService } from '@/prisma/prisma.service';
import Stripe from 'stripe';

jest.mock('stripe', () => {
  const mockConstructEvent = jest.fn();
  const mockCheckoutSessionsCreate = jest.fn();
  const mockSubscriptionsRetrieve = jest.fn();
  const mockBillingPortalSessionsCreate = jest.fn();
  const mockInvoicesList = jest.fn();
  const MockStripe = jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
    checkout: {
      sessions: {
        create: mockCheckoutSessionsCreate,
      },
    },
    subscriptions: {
      retrieve: mockSubscriptionsRetrieve,
    },
    billingPortal: {
      sessions: {
        create: mockBillingPortalSessionsCreate,
      },
    },
    invoices: {
      list: mockInvoicesList,
    },
  }));
  (MockStripe as any).mockConstructEvent = mockConstructEvent;
  (MockStripe as any).mockCheckoutSessionsCreate = mockCheckoutSessionsCreate;
  (MockStripe as any).mockSubscriptionsRetrieve = mockSubscriptionsRetrieve;
  (MockStripe as any).mockBillingPortalSessionsCreate =
    mockBillingPortalSessionsCreate;
  (MockStripe as any).mockInvoicesList = mockInvoicesList;
  return { default: MockStripe, __esModule: true };
});

describe('StripeService', () => {
  let service: StripeService;
  let mockConstructEvent: jest.Mock;
  let mockCheckoutSessionsCreate: jest.Mock;
  let mockSubscriptionsRetrieve: jest.Mock;
  let mockBillingPortalSessionsCreate: jest.Mock;
  let mockInvoicesList: jest.Mock;

  const mockPrismaService = {
    stripeEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        STRIPE_SECRET_KEY: 'sk_test_mock',
        STRIPE_WEBHOOK_SECRET: 'whsec_test_mock',
        WEB_APP_URL: 'http://localhost:3000',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    mockConstructEvent = (Stripe as any).mockConstructEvent;
    mockConstructEvent.mockReset();
    mockCheckoutSessionsCreate = (Stripe as any).mockCheckoutSessionsCreate;
    mockCheckoutSessionsCreate.mockReset();
    mockSubscriptionsRetrieve = (Stripe as any).mockSubscriptionsRetrieve;
    mockSubscriptionsRetrieve.mockReset();
    mockBillingPortalSessionsCreate = (Stripe as any)
      .mockBillingPortalSessionsCreate;
    mockBillingPortalSessionsCreate.mockReset();
    mockInvoicesList = (Stripe as any).mockInvoicesList;
    mockInvoicesList.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('stripe getter', () => {
    it('should return the Stripe client instance', () => {
      expect(service.stripe).toBeDefined();
      expect(service.stripe.webhooks).toBeDefined();
    });
  });

  describe('constructWebhookEvent', () => {
    it('should call stripe.webhooks.constructEvent with correct params', () => {
      const rawBody = Buffer.from('test-payload');
      const signature = 'test-signature';
      const mockEvent = { id: 'evt_test', type: 'test.event' };

      mockConstructEvent.mockReturnValue(mockEvent);

      const result = service.constructWebhookEvent(rawBody, signature);

      expect(mockConstructEvent).toHaveBeenCalledWith(
        rawBody,
        signature,
        'whsec_test_mock',
      );
      expect(result).toEqual(mockEvent);
    });

    it('should throw when signature verification fails', () => {
      const rawBody = Buffer.from('test-payload');
      const signature = 'invalid-sig';

      mockConstructEvent.mockImplementation(() => {
        throw new Error('Signature verification failed');
      });

      expect(() => service.constructWebhookEvent(rawBody, signature)).toThrow(
        'Signature verification failed',
      );
    });
  });

  describe('isEventProcessed', () => {
    it('should return true if event already exists', async () => {
      mockPrismaService.stripeEvent.findUnique.mockResolvedValue({
        id: 'uuid-1',
        stripeEventId: 'evt_existing',
        type: 'test.event',
      });

      const result = await service.isEventProcessed('evt_existing');

      expect(result).toBe(true);
      expect(mockPrismaService.stripeEvent.findUnique).toHaveBeenCalledWith({
        where: { stripeEventId: 'evt_existing' },
      });
    });

    it('should return false if event does not exist', async () => {
      mockPrismaService.stripeEvent.findUnique.mockResolvedValue(null);

      const result = await service.isEventProcessed('evt_new');

      expect(result).toBe(false);
    });
  });

  describe('markEventProcessed', () => {
    it('should create a StripeEvent record', async () => {
      mockPrismaService.stripeEvent.create.mockResolvedValue({
        id: 'uuid-1',
        stripeEventId: 'evt_123',
        type: 'checkout.session.completed',
      });

      await service.markEventProcessed('evt_123', 'checkout.session.completed');

      expect(mockPrismaService.stripeEvent.create).toHaveBeenCalledWith({
        data: {
          stripeEventId: 'evt_123',
          type: 'checkout.session.completed',
        },
      });
    });
  });

  describe('createBillingPortalSession', () => {
    it('should create portal session with correct params', async () => {
      mockBillingPortalSessionsCreate.mockResolvedValue({
        url: 'https://billing.stripe.com/session/test_portal',
      });

      const result = await service.createBillingPortalSession(
        'cus_test_123',
        'https://example.com/admin/settings?tab=billing',
        'fr',
      );

      expect(mockBillingPortalSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_test_123',
          return_url: 'https://example.com/admin/settings?tab=billing',
          locale: 'fr',
        }),
      );
      expect(result).toEqual({
        url: 'https://billing.stripe.com/session/test_portal',
      });
    });

    it('should default locale to fr when not provided', async () => {
      mockBillingPortalSessionsCreate.mockResolvedValue({
        url: 'https://billing.stripe.com/session/test_portal',
      });

      await service.createBillingPortalSession(
        'cus_test_123',
        'https://example.com/admin/settings?tab=billing',
      );

      expect(mockBillingPortalSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_test_123',
          return_url: 'https://example.com/admin/settings?tab=billing',
          locale: 'fr',
        }),
      );
    });

    it('should throw when Stripe API fails', async () => {
      mockBillingPortalSessionsCreate.mockRejectedValue(
        new Error('Stripe API error'),
      );

      await expect(
        service.createBillingPortalSession(
          'cus_test_123',
          'https://example.com/billing',
        ),
      ).rejects.toThrow('Stripe API error');
    });
  });

  describe('getSubscriptionWithDetails', () => {
    const mockSubscription = {
      status: 'active',
      cancel_at_period_end: false,
      trial_end: null,
      items: {
        data: [
          {
            current_period_end: 1740787200,
            price: {
              lookup_key: 'starter_monthly',
              unit_amount: 2900,
              currency: 'eur',
              recurring: { interval: 'month' },
              product: { name: 'Starter Plan' },
            },
          },
        ],
      },
    };

    it('should retrieve subscription with expanded data', async () => {
      mockSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const result = await service.getSubscriptionWithDetails('sub_test_123');

      expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_test_123', {
        expand: [
          'latest_invoice',
          'default_payment_method',
          'items.data.price.product',
          'discounts',
          'discounts.promotion_code',
        ],
      });
      expect(result).toEqual({
        status: 'active',
        planKey: 'starter_monthly',
        planName: 'Starter Plan',
        entitlementTier: 'starter',
        currentPeriodEnd: new Date(1740787200 * 1000).toISOString(),
        cancelAtPeriodEnd: false,
        trialEnd: null,
        priceAmount: 2900,
        priceCurrency: 'eur',
        priceInterval: 'month',
        promotionCodeName: null,
      });
    });

    it('should handle subscription with trial_end', async () => {
      mockSubscriptionsRetrieve.mockResolvedValue({
        ...mockSubscription,
        status: 'trialing',
        trial_end: 1740787200,
      });

      const result = await service.getSubscriptionWithDetails('sub_test_trial');

      expect(result.status).toBe('trialing');
      expect(result.trialEnd).toBe(new Date(1740787200 * 1000).toISOString());
    });

    it('should default planKey to "default" when lookup_key is null', async () => {
      mockSubscriptionsRetrieve.mockResolvedValue({
        ...mockSubscription,
        items: {
          data: [
            {
              current_period_end: 1740787200,
              price: {
                lookup_key: null,
                unit_amount: 0,
                currency: 'eur',
                recurring: { interval: 'month' },
                product: { name: 'Free Plan' },
              },
            },
          ],
        },
      });

      const result = await service.getSubscriptionWithDetails('sub_test_free');

      expect(result.planKey).toBe('default');
    });

    it('should handle product as string (non-expanded)', async () => {
      mockSubscriptionsRetrieve.mockResolvedValue({
        ...mockSubscription,
        items: {
          data: [
            {
              current_period_end: 1740787200,
              price: {
                lookup_key: 'starter_monthly',
                unit_amount: 2900,
                currency: 'eur',
                recurring: { interval: 'month' },
                product: 'prod_test_123',
              },
            },
          ],
        },
      });

      const result = await service.getSubscriptionWithDetails('sub_test_str');

      expect(result.planName).toBe('Unknown');
    });

    it('should throw when subscription not found', async () => {
      mockSubscriptionsRetrieve.mockRejectedValue(
        new Error('No such subscription'),
      );

      await expect(
        service.getSubscriptionWithDetails('sub_not_exists'),
      ).rejects.toThrow('No such subscription');
    });
  });

  describe('listInvoices', () => {
    const mockInvoicesResponse = {
      data: [
        {
          id: 'in_test_1',
          amount_paid: 2900,
          currency: 'eur',
          status: 'paid',
          invoice_pdf: 'https://stripe.com/invoice1.pdf',
          hosted_invoice_url: 'https://stripe.com/invoice1',
          period_start: 1738195200,
          period_end: 1740787200,
          created: 1738195200,
        },
        {
          id: 'in_test_2',
          amount_paid: 2900,
          currency: 'eur',
          status: 'paid',
          invoice_pdf: null,
          hosted_invoice_url: null,
          period_start: 1735689600,
          period_end: 1738195200,
          created: 1735689600,
        },
      ],
    };

    it('should list invoices with correct customer and default limit', async () => {
      mockInvoicesList.mockResolvedValue(mockInvoicesResponse);

      const result = await service.listInvoices('cus_test_123');

      expect(mockInvoicesList).toHaveBeenCalledWith({
        customer: 'cus_test_123',
        limit: 10,
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'in_test_1',
        amountPaid: 2900,
        currency: 'eur',
        status: 'paid',
        invoicePdf: 'https://stripe.com/invoice1.pdf',
        hostedInvoiceUrl: 'https://stripe.com/invoice1',
        periodStart: new Date(1738195200 * 1000).toISOString(),
        periodEnd: new Date(1740787200 * 1000).toISOString(),
        created: new Date(1738195200 * 1000).toISOString(),
      });
    });

    it('should use custom limit when provided', async () => {
      mockInvoicesList.mockResolvedValue({ data: [] });

      await service.listInvoices('cus_test_123', 5);

      expect(mockInvoicesList).toHaveBeenCalledWith({
        customer: 'cus_test_123',
        limit: 5,
      });
    });

    it('should handle empty invoice list', async () => {
      mockInvoicesList.mockResolvedValue({ data: [] });

      const result = await service.listInvoices('cus_test_empty');

      expect(result).toEqual([]);
    });

    it('should handle nullable invoice fields', async () => {
      mockInvoicesList.mockResolvedValue(mockInvoicesResponse);

      const result = await service.listInvoices('cus_test_123');

      expect(result[1].invoicePdf).toBeNull();
      expect(result[1].hostedInvoiceUrl).toBeNull();
    });
  });
});
