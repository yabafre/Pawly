import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { PrismaService } from '@/prisma/prisma.service';
import Stripe from 'stripe';

jest.mock('stripe', () => {
  const mockConstructEvent = jest.fn();
  const MockStripe = jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }));
  (MockStripe as any).mockConstructEvent = mockConstructEvent;
  return { default: MockStripe, __esModule: true };
});

describe('StripeService', () => {
  let service: StripeService;
  let prisma: PrismaService;
  let mockConstructEvent: jest.Mock;

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
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    mockConstructEvent = (Stripe as any).mockConstructEvent;
    mockConstructEvent.mockReset();

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
});
