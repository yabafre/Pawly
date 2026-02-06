import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeService } from './stripe.service';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthService } from '@/modules/auth/auth.service';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;

  const mockStripeService = {
    constructWebhookEvent: jest.fn(),
    isEventProcessed: jest.fn(),
    markEventProcessed: jest.fn(),
    deleteEvent: jest.fn(),
    stripe: {
      subscriptions: {
        retrieve: jest.fn(),
      },
    },
  };

  const mockTransaction = jest.fn();
  const mockPrismaService = {
    $transaction: mockTransaction,
    subscription: {
      update: jest.fn(),
    },
  };

  const mockAuthService = {
    requestMagicLink: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: StripeService, useValue: mockStripeService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<StripeWebhookController>(
      StripeWebhookController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  function createMockRequest(rawBody?: Buffer): RawBodyRequest<Request> {
    return { rawBody } as RawBodyRequest<Request>;
  }

  describe('handleWebhook — validation', () => {
    const validSignature = 'test-signature';

    it('should throw BadRequestException when raw body is missing', async () => {
      const req = createMockRequest(undefined);

      await expect(
        controller.handleWebhook(req, validSignature),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.handleWebhook(req, validSignature),
      ).rejects.toThrow('Missing raw body');
    });

    it('should throw BadRequestException when stripe-signature header is missing', async () => {
      const req = createMockRequest(Buffer.from('payload'));

      await expect(
        controller.handleWebhook(req, undefined as unknown as string),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.handleWebhook(req, undefined as unknown as string),
      ).rejects.toThrow('Missing stripe-signature header');
    });

    it('should throw BadRequestException when signature verification fails', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      mockStripeService.constructWebhookEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(
        controller.handleWebhook(req, 'invalid-sig'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.handleWebhook(req, 'invalid-sig'),
      ).rejects.toThrow('Webhook signature verification failed');
    });
  });

  describe('handleWebhook — idempotency (claim-then-process)', () => {
    const validSignature = 'test-signature';

    it('should skip duplicate events via P2002 on claim', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const mockEvent = {
        id: 'evt_dup',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_123' } },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(mockEvent);

      const p2002Error = Object.assign(
        new Error('Unique constraint failed'),
        { code: 'P2002' },
      );
      mockStripeService.markEventProcessed.mockRejectedValue(p2002Error);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('should rethrow non-P2002 errors from markEventProcessed', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const mockEvent = {
        id: 'evt_err',
        type: 'some.unknown.event',
        data: { object: {} },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      mockStripeService.markEventProcessed.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(
        controller.handleWebhook(req, validSignature),
      ).rejects.toThrow('Database connection failed');
    });

    it('should unclaim event and rethrow when business logic fails', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const mockEvent = {
        id: 'evt_fail',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_fail',
            customer: 'cus_fail',
            subscription: 'sub_fail',
            metadata: {
              clinicName: 'Fail Clinic',
              adminEmail: 'fail@test.com',
            },
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockStripeService.stripe.subscriptions.retrieve.mockRejectedValue(
        new Error('Stripe API error'),
      );
      mockStripeService.deleteEvent.mockResolvedValue(undefined);

      await expect(
        controller.handleWebhook(req, validSignature),
      ).rejects.toThrow('Stripe API error');

      expect(mockStripeService.deleteEvent).toHaveBeenCalledWith('evt_fail');
    });
  });

  describe('handleWebhook — checkout.session.completed', () => {
    const validSignature = 'test-signature';

    function createCheckoutEvent(
      overrides: Record<string, any> = {},
    ) {
      return {
        id: 'evt_checkout_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_test_123',
            subscription: 'sub_test_123',
            metadata: {
              clinicName: 'Clinique Zen',
              adminName: 'Dr. Dupont',
              adminEmail: 'admin@clinique.fr',
            },
            ...overrides,
          },
        },
      };
    }

    const mockSubscription = {
      id: 'sub_test_123',
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { lookup_key: 'starter_monthly' },
            current_period_end: 1735689600,
          },
        ],
      },
    };

    it('should create Clinic + Admin + Subscription in a transaction', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = createCheckoutEvent();
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue(
        mockSubscription,
      );
      mockAuthService.requestMagicLink.mockResolvedValue({
        message: 'If an account exists, a magic link has been sent',
      });

      const mockTx = {
        clinic: {
          create: jest.fn().mockResolvedValue({
            id: 'clinic-uuid-1',
            name: 'Clinique Zen',
            slug: 'clinique-zen-abc123',
          }),
        },
        user: { create: jest.fn().mockResolvedValue({ id: 'user-uuid-1' }) },
        subscription: {
          create: jest.fn().mockResolvedValue({ id: 'sub-uuid-1' }),
        },
      };
      mockTransaction.mockImplementation(async (fn: Function) => fn(mockTx));

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });

      // Verify subscription retrieval
      expect(
        mockStripeService.stripe.subscriptions.retrieve,
      ).toHaveBeenCalledWith('sub_test_123');

      // Verify Clinic creation
      expect(mockTx.clinic.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Clinique Zen',
          onboardingCompleted: false,
        }),
      });
      // Slug should be kebab-case with random suffix
      const clinicData = mockTx.clinic.create.mock.calls[0][0].data;
      expect(clinicData.slug).toMatch(/^clinique-zen-[a-f0-9]{8}$/);

      // Verify Admin User creation (with name from metadata)
      expect(mockTx.user.create).toHaveBeenCalledWith({
        data: {
          email: 'admin@clinique.fr',
          name: 'Dr. Dupont',
          role: 'ADMIN',
          clinicId: 'clinic-uuid-1',
        },
      });

      // Verify Subscription creation
      expect(mockTx.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clinicId: 'clinic-uuid-1',
          stripeCustomerId: 'cus_test_123',
          stripeSubscriptionId: 'sub_test_123',
          status: 'active',
          planKey: 'starter_monthly',
          entitlementTier: 'starter',
          cancelAtPeriodEnd: false,
        }),
      });

      // Verify Magic Link sent after transaction
      expect(mockAuthService.requestMagicLink).toHaveBeenCalledWith(
        'admin@clinique.fr',
      );
    });

    it('should work with $0 checkout (no payment_intent)', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = createCheckoutEvent({ payment_intent: null });
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue(
        mockSubscription,
      );
      mockAuthService.requestMagicLink.mockResolvedValue({
        message: 'If an account exists, a magic link has been sent',
      });

      const mockTx = {
        clinic: {
          create: jest.fn().mockResolvedValue({
            id: 'clinic-uuid-2',
            name: 'Clinique Promo',
            slug: 'clinique-promo-abc123',
          }),
        },
        user: { create: jest.fn().mockResolvedValue({ id: 'user-uuid-2' }) },
        subscription: {
          create: jest.fn().mockResolvedValue({ id: 'sub-uuid-2' }),
        },
      };
      mockTransaction.mockImplementation(async (fn: Function) => fn(mockTx));

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockTx.clinic.create).toHaveBeenCalled();
      expect(mockTx.user.create).toHaveBeenCalled();
      expect(mockTx.subscription.create).toHaveBeenCalled();
      expect(mockAuthService.requestMagicLink).toHaveBeenCalled();
    });

    it('should use default planKey when lookup_key is null', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = createCheckoutEvent();
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue({
        ...mockSubscription,
        items: {
          data: [
            {
              price: { lookup_key: null },
              current_period_end: 1735689600,
            },
          ],
        },
      });
      mockAuthService.requestMagicLink.mockResolvedValue({
        message: 'If an account exists, a magic link has been sent',
      });

      const mockTx = {
        clinic: {
          create: jest.fn().mockResolvedValue({
            id: 'clinic-uuid-3',
            name: 'Test',
            slug: 'test-abc123',
          }),
        },
        user: { create: jest.fn().mockResolvedValue({ id: 'user-uuid-3' }) },
        subscription: {
          create: jest.fn().mockResolvedValue({ id: 'sub-uuid-3' }),
        },
      };
      mockTransaction.mockImplementation(async (fn: Function) => fn(mockTx));

      await controller.handleWebhook(req, validSignature);

      expect(mockTx.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          planKey: 'default',
        }),
      });
    });

    it('should skip gracefully when session metadata is missing', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = createCheckoutEvent({ metadata: null });
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockAuthService.requestMagicLink).not.toHaveBeenCalled();
    });

    it('should skip gracefully when clinicName is missing from metadata', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = createCheckoutEvent({
        metadata: { adminEmail: 'admin@test.com' },
      });
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('should skip gracefully when adminEmail is missing from metadata', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = createCheckoutEvent({
        metadata: { clinicName: 'Test Clinic' },
      });
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook — customer.subscription.updated', () => {
    const validSignature = 'test-signature';

    it('should update subscription status and details', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_sub_update',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_456',
            status: 'past_due',
            cancel_at_period_end: true,
            items: {
              data: [
                {
                  price: { lookup_key: 'pro_monthly' },
                  current_period_end: 1738368000,
                },
              ],
            },
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockPrismaService.subscription.update.mockResolvedValue({});

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_test_456' },
        data: {
          status: 'past_due',
          planKey: 'pro_monthly',
          currentPeriodEnd: new Date(1738368000 * 1000),
          cancelAtPeriodEnd: true,
        },
      });
    });

    it('should map Stripe "incomplete" status to "unpaid"', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_sub_incomplete',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_inc',
            status: 'incomplete',
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  price: { lookup_key: 'starter_monthly' },
                  current_period_end: 1738368000,
                },
              ],
            },
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockPrismaService.subscription.update.mockResolvedValue({});

      await controller.handleWebhook(req, validSignature);

      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_test_inc' },
        data: expect.objectContaining({
          status: 'unpaid',
        }),
      });
    });

    it('should skip gracefully when subscription not found (out-of-order webhook)', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_sub_ooo',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_not_exists',
            status: 'active',
            cancel_at_period_end: false,
            items: {
              data: [
                {
                  price: { lookup_key: 'starter_monthly' },
                  current_period_end: 1738368000,
                },
              ],
            },
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);

      const p2025Error = Object.assign(
        new Error('Record to update not found'),
        { code: 'P2025' },
      );
      mockPrismaService.subscription.update.mockRejectedValue(p2025Error);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
    });
  });

  describe('handleWebhook — customer.subscription.deleted', () => {
    const validSignature = 'test-signature';

    it('should set subscription status to canceled', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_sub_delete',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_test_789',
            status: 'canceled',
            cancel_at_period_end: false,
            items: { data: [] },
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockPrismaService.subscription.update.mockResolvedValue({});

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_test_789' },
        data: { status: 'canceled' },
      });
    });

    it('should skip gracefully when subscription not found (out-of-order webhook)', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_sub_del_ooo',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_not_exists',
            status: 'canceled',
            cancel_at_period_end: false,
            items: { data: [] },
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);

      const p2025Error = Object.assign(
        new Error('Record to update not found'),
        { code: 'P2025' },
      );
      mockPrismaService.subscription.update.mockRejectedValue(p2025Error);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
    });
  });

  describe('handleWebhook — invoice.payment_failed', () => {
    const validSignature = 'test-signature';

    it('should set subscription status to past_due', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_invoice_fail',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test_123',
            parent: {
              subscription_details: {
                subscription: 'sub_test_pay_fail',
              },
            },
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockPrismaService.subscription.update.mockResolvedValue({});

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_test_pay_fail' },
        data: { status: 'past_due' },
      });
    });

    it('should skip when invoice has no subscription', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_invoice_no_sub',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test_no_sub',
            parent: null,
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockPrismaService.subscription.update).not.toHaveBeenCalled();
    });

    it('should skip gracefully when subscription not found (out-of-order webhook)', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_invoice_ooo',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test_ooo',
            parent: {
              subscription_details: {
                subscription: 'sub_not_exists',
              },
            },
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);

      const p2025Error = Object.assign(
        new Error('Record to update not found'),
        { code: 'P2025' },
      );
      mockPrismaService.subscription.update.mockRejectedValue(p2025Error);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
    });
  });

  describe('handleWebhook — unhandled events', () => {
    const validSignature = 'test-signature';

    it('should handle unrecognized event types gracefully', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_unknown',
        type: 'some.unknown.event',
        data: { object: { id: 'obj_123' } },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
    });
  });
});
