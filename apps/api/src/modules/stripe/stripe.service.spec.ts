import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { PrismaService } from '@/prisma/prisma.service';
import Stripe from 'stripe';

jest.mock('stripe', () => {
  const mockConstructEvent = jest.fn();
  const mockCheckoutSessionsCreate = jest.fn();
  const mockSubscriptionsRetrieve = jest.fn();
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
  }));
  (MockStripe as any).mockConstructEvent = mockConstructEvent;
  (MockStripe as any).mockCheckoutSessionsCreate = mockCheckoutSessionsCreate;
  (MockStripe as any).mockSubscriptionsRetrieve = mockSubscriptionsRetrieve;
  return { default: MockStripe, __esModule: true };
});

describe('StripeService', () => {
  let service: StripeService;
  let prisma: PrismaService;
  let mockConstructEvent: jest.Mock;
  let mockCheckoutSessionsCreate: jest.Mock;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);
    prisma = module.get<PrismaService>(PrismaService);
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

      expect(() =>
        service.constructWebhookEvent(rawBody, signature),
      ).toThrow('Signature verification failed');
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

      await service.markEventProcessed(
        'evt_123',
        'checkout.session.completed',
      );

      expect(mockPrismaService.stripeEvent.create).toHaveBeenCalledWith({
        data: {
          stripeEventId: 'evt_123',
          type: 'checkout.session.completed',
        },
      });
    });
  });

  describe('createCheckoutSession', () => {
    const input = {
      clinicName: 'Clinique Test',
      adminName: 'Dr. Test',
      adminEmail: 'admin@test.com',
      priceId: 'price_test_123',
      locale: 'fr' as const,
    };

    it('should create a Stripe Checkout Session with correct params', async () => {
      mockCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_test_session',
        url: 'https://checkout.stripe.com/pay/cs_test_session',
      });

      const result = await service.createCheckoutSession(input);

      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith({
        mode: 'subscription',
        line_items: [{ price: 'price_test_123', quantity: 1 }],
        success_url:
          'http://localhost:3000/fr/pricing/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'http://localhost:3000/fr/pricing',
        customer_email: 'admin@test.com',
        allow_promotion_codes: true,
        metadata: {
          clinicName: 'Clinique Test',
          adminName: 'Dr. Test',
          adminEmail: 'admin@test.com',
        },
        subscription_data: {
          metadata: {
            clinicName: 'Clinique Test',
            adminName: 'Dr. Test',
            adminEmail: 'admin@test.com',
          },
        },
      });

      expect(result).toEqual({
        sessionId: 'cs_test_session',
        url: 'https://checkout.stripe.com/pay/cs_test_session',
      });
    });

    it('should use the locale in success and cancel URLs', async () => {
      mockCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_test',
        url: 'https://checkout.stripe.com/pay/cs_test',
      });

      await service.createCheckoutSession({ ...input, locale: 'en' });

      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url:
            'http://localhost:3000/en/pricing/success?session_id={CHECKOUT_SESSION_ID}',
          cancel_url: 'http://localhost:3000/en/pricing',
        }),
      );
    });

    it('should pass metadata to both session and subscription_data', async () => {
      mockCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_test',
        url: 'https://checkout.stripe.com/pay/cs_test',
      });

      await service.createCheckoutSession(input);

      const callArgs = mockCheckoutSessionsCreate.mock.calls[0][0];
      expect(callArgs.metadata).toEqual({
        clinicName: 'Clinique Test',
        adminName: 'Dr. Test',
        adminEmail: 'admin@test.com',
      });
      expect(callArgs.subscription_data.metadata).toEqual({
        clinicName: 'Clinique Test',
        adminName: 'Dr. Test',
        adminEmail: 'admin@test.com',
      });
    });
  });
});
