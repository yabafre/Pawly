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
      checkout: {
        sessions: {
          retrieve: jest.fn(),
        },
      },
      coupons: {
        retrieve: jest.fn(),
      },
    },
  };

  const mockTransaction = jest.fn();
  const mockPrismaService = {
    $transaction: mockTransaction,
    subscription: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockAuthService = {
    requestMagicLink: jest.fn(),
    createActivationToken: jest.fn(),
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
      mockStripeService.stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_test_123',
        discounts: [],
      });
      mockAuthService.createActivationToken.mockResolvedValue({
        message: 'If an account exists, an activation email has been sent',
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
      expect(mockAuthService.createActivationToken).toHaveBeenCalledWith(
        'admin@clinique.fr', 'Dr. Dupont',
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
      mockStripeService.stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_test_123',
        discounts: [],
      });
      mockAuthService.createActivationToken.mockResolvedValue({
        message: 'If an account exists, an activation email has been sent',
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
      expect(mockAuthService.createActivationToken).toHaveBeenCalled();
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
      mockStripeService.stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_test_123',
        discounts: [],
      });
      mockAuthService.createActivationToken.mockResolvedValue({
        message: 'If an account exists, an activation email has been sent',
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
      expect(mockAuthService.createActivationToken).not.toHaveBeenCalled();
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
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue(
        event.data.object,
      );
      mockPrismaService.subscription.update.mockResolvedValue({});

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(
        mockStripeService.stripe.subscriptions.retrieve,
      ).toHaveBeenCalledWith('sub_test_456', {
        expand: [
          'items.data.price.product',
          'discounts',
          'discounts.source.coupon',
          'discounts.promotion_code',
        ],
      });
      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_test_456' },
        data: {
          status: 'past_due',
          planKey: 'pro_monthly',
          entitlementTier: 'pro',
          currentPeriodEnd: new Date(1738368000 * 1000),
          cancelAtPeriodEnd: true,
          promotionCodeId: null,
          couponId: null,
          discountType: null,
          discountValue: null,
          couponMetadataType: null,
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
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue(
        event.data.object,
      );
      mockPrismaService.subscription.update.mockResolvedValue({});

      await controller.handleWebhook(req, validSignature);

      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_test_inc' },
        data: expect.objectContaining({
          status: 'unpaid',
          entitlementTier: 'starter',
          promotionCodeId: null,
          couponId: null,
          discountType: null,
          discountValue: null,
          couponMetadataType: null,
        }),
      });
    });

    it('should sync promotion fields on subscription update', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_sub_promo_sync',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_promo_sync',
            status: 'active',
            cancel_at_period_end: false,
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
      const latestSubscription = {
        ...event.data.object,
        discounts: [
          {
            id: 'di_test_1',
            promotion_code: { id: 'promo_partner_125', code: 'PARTNER125' },
            source: {
              coupon: {
                id: 'coupon_partner_125',
                percent_off: 12.5,
                amount_off: null,
                metadata: { type: 'partner' },
              },
            },
          },
        ],
      };

      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue(
        latestSubscription,
      );
      mockPrismaService.subscription.update.mockResolvedValue({});

      await controller.handleWebhook(req, validSignature);

      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_test_promo_sync' },
        data: expect.objectContaining({
          promotionCodeId: 'promo_partner_125',
          couponId: 'coupon_partner_125',
          discountType: 'percent',
          discountValue: 12.5,
          couponMetadataType: 'partner',
        }),
      });
    });

    it('should clear promotion fields when subscription has no discounts', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_sub_clear_promo',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_clear_promo',
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
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue({
        ...event.data.object,
        discounts: [],
      });
      mockPrismaService.subscription.update.mockResolvedValue({});

      await controller.handleWebhook(req, validSignature);

      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_test_clear_promo' },
        data: expect.objectContaining({
          promotionCodeId: null,
          couponId: null,
          discountType: null,
          discountValue: null,
          couponMetadataType: null,
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
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue(
        event.data.object,
      );

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
        data: { status: 'canceled', cancelAtPeriodEnd: false },
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

  describe('handleWebhook — invoice.paid', () => {
    const validSignature = 'test-signature';

    it('should recover subscription from past_due to active', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_invoice_paid',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_test_paid',
            parent: {
              subscription_details: {
                subscription: 'sub_test_recover',
              },
            },
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockPrismaService.subscription.findUnique.mockResolvedValue({
        status: 'past_due',
      });
      mockPrismaService.subscription.update.mockResolvedValue({});

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockPrismaService.subscription.findUnique).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_test_recover' },
        select: { status: true },
      });
      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_test_recover' },
        data: { status: 'active' },
      });
    });

    it('should not update when subscription is already active', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_invoice_paid_active',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_test_already_active',
            parent: {
              subscription_details: {
                subscription: 'sub_test_active',
              },
            },
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockPrismaService.subscription.findUnique.mockResolvedValue({
        status: 'active',
      });

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockPrismaService.subscription.findUnique).toHaveBeenCalled();
      expect(mockPrismaService.subscription.update).not.toHaveBeenCalled();
    });

    it('should skip when invoice has no subscription', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_invoice_paid_no_sub',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_test_no_sub_paid',
            parent: null,
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockPrismaService.subscription.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.subscription.update).not.toHaveBeenCalled();
    });

    it('should skip gracefully when subscription not found', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_invoice_paid_ooo',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_test_ooo_paid',
            parent: {
              subscription_details: {
                subscription: 'sub_not_exists_paid',
              },
            },
          },
        },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockPrismaService.subscription.findUnique.mockResolvedValue(null);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockPrismaService.subscription.update).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook — checkout.session.completed with promotion', () => {
    const validSignature = 'test-signature';

    function createCheckoutEventForPromo(
      overrides: Record<string, any> = {},
    ) {
      return {
        id: 'evt_promo_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_promo_123',
            customer: 'cus_promo_123',
            subscription: 'sub_promo_123',
            metadata: {
              clinicName: 'Clinique Partner',
              adminName: 'Dr. Partner',
              adminEmail: 'partner@clinique.fr',
            },
            ...overrides,
          },
        },
      };
    }

    const mockSubscriptionPromo = {
      id: 'sub_promo_123',
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

    it('should store promotion data when promo code is applied (percent discount)', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = createCheckoutEventForPromo();
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue(
        mockSubscriptionPromo,
      );
      mockStripeService.stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_promo_123',
        discounts: [
          {
            coupon: {
              id: 'coupon_25off',
              percent_off: 25,
              amount_off: null,
            },
            promotion_code: {
              id: 'promo_partner1',
              code: 'PARTNER25',
            },
          },
        ],
      });
      mockStripeService.stripe.coupons.retrieve.mockResolvedValue({
        id: 'coupon_25off',
        metadata: { type: 'partner' },
      });
      mockAuthService.createActivationToken.mockResolvedValue({
        message: 'If an account exists, an activation email has been sent',
      });

      const mockTx = {
        clinic: {
          create: jest.fn().mockResolvedValue({
            id: 'clinic-promo-1',
            name: 'Clinique Partner',
            slug: 'clinique-partner-abc123',
          }),
        },
        user: { create: jest.fn().mockResolvedValue({ id: 'user-promo-1' }) },
        subscription: {
          create: jest.fn().mockResolvedValue({ id: 'sub-promo-db-1' }),
        },
      };
      mockTransaction.mockImplementation(async (fn: Function) => fn(mockTx));

      await controller.handleWebhook(req, validSignature);

      expect(mockTx.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          promotionCodeId: 'promo_partner1',
          couponId: 'coupon_25off',
          discountType: 'percent',
          discountValue: 25,
          couponMetadataType: 'partner',
          entitlementTier: 'starter',
        }),
      });
    });

    it('should store 100% discount promotion data', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = createCheckoutEventForPromo({
        payment_status: 'no_payment_required',
      });
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue(
        mockSubscriptionPromo,
      );
      mockStripeService.stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_promo_123',
        discounts: [
          {
            coupon: {
              id: 'coupon_100off',
              percent_off: 100,
              amount_off: null,
            },
            promotion_code: {
              id: 'promo_lifetime1',
              code: 'LIFETIME100',
            },
          },
        ],
      });
      mockStripeService.stripe.coupons.retrieve.mockResolvedValue({
        id: 'coupon_100off',
        metadata: { type: 'lifetime' },
      });
      mockAuthService.createActivationToken.mockResolvedValue({
        message: 'If an account exists, an activation email has been sent',
      });

      const mockTx = {
        clinic: {
          create: jest.fn().mockResolvedValue({
            id: 'clinic-promo-2',
            name: 'Clinique Partner',
            slug: 'clinique-partner-abc123',
          }),
        },
        user: { create: jest.fn().mockResolvedValue({ id: 'user-promo-2' }) },
        subscription: {
          create: jest.fn().mockResolvedValue({ id: 'sub-promo-db-2' }),
        },
      };
      mockTransaction.mockImplementation(async (fn: Function) => fn(mockTx));

      await controller.handleWebhook(req, validSignature);

      // Verify Clinic + Admin + Subscription are created identically
      expect(mockTx.clinic.create).toHaveBeenCalled();
      expect(mockTx.user.create).toHaveBeenCalled();
      expect(mockTx.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          promotionCodeId: 'promo_lifetime1',
          couponId: 'coupon_100off',
          discountType: 'percent',
          discountValue: 100,
          couponMetadataType: 'lifetime',
          entitlementTier: 'starter',
        }),
      });
      expect(mockAuthService.createActivationToken).toHaveBeenCalledWith(
        'partner@clinique.fr', 'Dr. Partner',
      );
    });

    it('should resolve coupon details when discount coupon is a string ID', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = createCheckoutEventForPromo();
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue(
        mockSubscriptionPromo,
      );
      mockStripeService.stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_promo_123',
        discounts: [
          {
            coupon: 'coupon_string_125',
            promotion_code: {
              id: 'promo_partner_125',
              code: 'PARTNER125',
            },
          },
        ],
      });
      mockStripeService.stripe.coupons.retrieve.mockResolvedValue({
        id: 'coupon_string_125',
        percent_off: 12.5,
        amount_off: null,
        metadata: { type: 'partner' },
      });
      mockAuthService.createActivationToken.mockResolvedValue({
        message: 'If an account exists, an activation email has been sent',
      });

      const mockTx = {
        clinic: {
          create: jest.fn().mockResolvedValue({
            id: 'clinic-promo-string-coupon',
            name: 'Clinique Partner',
            slug: 'clinique-partner-abc123',
          }),
        },
        user: {
          create: jest.fn().mockResolvedValue({
            id: 'user-promo-string-coupon',
          }),
        },
        subscription: {
          create: jest.fn().mockResolvedValue({
            id: 'sub-promo-string-coupon',
          }),
        },
      };
      mockTransaction.mockImplementation(async (fn: Function) => fn(mockTx));

      await controller.handleWebhook(req, validSignature);

      expect(mockStripeService.stripe.coupons.retrieve).toHaveBeenCalledWith(
        'coupon_string_125',
      );
      expect(mockTx.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          promotionCodeId: 'promo_partner_125',
          couponId: 'coupon_string_125',
          discountType: 'percent',
          discountValue: 12.5,
          couponMetadataType: 'partner',
        }),
      });
    });

    it('should store null promotion fields when no promo code applied', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = createCheckoutEventForPromo();
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue(
        mockSubscriptionPromo,
      );
      mockStripeService.stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_promo_123',
        discounts: [],
      });
      mockAuthService.createActivationToken.mockResolvedValue({
        message: 'If an account exists, an activation email has been sent',
      });

      const mockTx = {
        clinic: {
          create: jest.fn().mockResolvedValue({
            id: 'clinic-promo-3',
            name: 'Clinique Partner',
            slug: 'clinique-partner-abc123',
          }),
        },
        user: { create: jest.fn().mockResolvedValue({ id: 'user-promo-3' }) },
        subscription: {
          create: jest.fn().mockResolvedValue({ id: 'sub-promo-db-3' }),
        },
      };
      mockTransaction.mockImplementation(async (fn: Function) => fn(mockTx));

      await controller.handleWebhook(req, validSignature);

      expect(mockTx.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          promotionCodeId: null,
          couponId: null,
          discountType: null,
          discountValue: null,
          couponMetadataType: null,
        }),
      });
    });

    it('should store amount discount data for fixed amount coupon', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = createCheckoutEventForPromo();
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue(
        mockSubscriptionPromo,
      );
      mockStripeService.stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_promo_123',
        discounts: [
          {
            coupon: {
              id: 'coupon_20eur',
              percent_off: null,
              amount_off: 2000,
            },
            promotion_code: {
              id: 'promo_20eur',
              code: '20EUROFF',
            },
          },
        ],
      });
      mockStripeService.stripe.coupons.retrieve.mockResolvedValue({
        id: 'coupon_20eur',
        metadata: { type: 'internal' },
      });
      mockAuthService.createActivationToken.mockResolvedValue({
        message: 'If an account exists, an activation email has been sent',
      });

      const mockTx = {
        clinic: {
          create: jest.fn().mockResolvedValue({
            id: 'clinic-promo-4',
            name: 'Clinique Partner',
            slug: 'clinique-partner-abc123',
          }),
        },
        user: { create: jest.fn().mockResolvedValue({ id: 'user-promo-4' }) },
        subscription: {
          create: jest.fn().mockResolvedValue({ id: 'sub-promo-db-4' }),
        },
      };
      mockTransaction.mockImplementation(async (fn: Function) => fn(mockTx));

      await controller.handleWebhook(req, validSignature);

      expect(mockTx.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          discountType: 'amount',
          discountValue: 2000,
          couponMetadataType: 'internal',
        }),
      });
    });

    it('should derive dynamic entitlementTier from pro_monthly lookup_key', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = createCheckoutEventForPromo();
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue({
        ...mockSubscriptionPromo,
        items: {
          data: [
            {
              price: { lookup_key: 'pro_monthly' },
              current_period_end: 1735689600,
            },
          ],
        },
      });
      mockStripeService.stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_promo_123',
        discounts: [],
      });
      mockAuthService.createActivationToken.mockResolvedValue({
        message: 'If an account exists, an activation email has been sent',
      });

      const mockTx = {
        clinic: {
          create: jest.fn().mockResolvedValue({
            id: 'clinic-promo-5',
            name: 'Clinique Partner',
            slug: 'clinique-partner-abc123',
          }),
        },
        user: { create: jest.fn().mockResolvedValue({ id: 'user-promo-5' }) },
        subscription: {
          create: jest.fn().mockResolvedValue({ id: 'sub-promo-db-5' }),
        },
      };
      mockTransaction.mockImplementation(async (fn: Function) => fn(mockTx));

      await controller.handleWebhook(req, validSignature);

      expect(mockTx.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entitlementTier: 'pro',
        }),
      });
    });

    it('should handle promotion_code as string ID (non-expanded)', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = createCheckoutEventForPromo();
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue(
        mockSubscriptionPromo,
      );
      mockStripeService.stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_promo_123',
        discounts: [
          {
            coupon: {
              id: 'coupon_str',
              percent_off: 50,
              amount_off: null,
            },
            promotion_code: 'promo_string_id',
          },
        ],
      });
      mockStripeService.stripe.coupons.retrieve.mockResolvedValue({
        id: 'coupon_str',
        metadata: { type: 'internal' },
      });
      mockAuthService.createActivationToken.mockResolvedValue({
        message: 'If an account exists, an activation email has been sent',
      });

      const mockTx = {
        clinic: {
          create: jest.fn().mockResolvedValue({
            id: 'clinic-promo-str',
            name: 'Clinique Partner',
            slug: 'clinique-partner-abc123',
          }),
        },
        user: { create: jest.fn().mockResolvedValue({ id: 'user-promo-str' }) },
        subscription: {
          create: jest.fn().mockResolvedValue({ id: 'sub-promo-db-str' }),
        },
      };
      mockTransaction.mockImplementation(async (fn: Function) => fn(mockTx));

      await controller.handleWebhook(req, validSignature);

      expect(mockTx.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          promotionCodeId: 'promo_string_id',
          couponId: 'coupon_str',
          discountType: 'percent',
          discountValue: 50,
          couponMetadataType: 'internal',
        }),
      });
    });

    it('should preserve promo data when coupons.retrieve fails', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = createCheckoutEventForPromo();
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue(
        mockSubscriptionPromo,
      );
      mockStripeService.stripe.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_promo_123',
        discounts: [
          {
            coupon: {
              id: 'coupon_fail',
              percent_off: 30,
              amount_off: null,
            },
            promotion_code: {
              id: 'promo_fail1',
              code: 'FAILCODE',
            },
          },
        ],
      });
      mockStripeService.stripe.coupons.retrieve.mockRejectedValue(
        new Error('Stripe API error'),
      );
      mockAuthService.createActivationToken.mockResolvedValue({
        message: 'If an account exists, an activation email has been sent',
      });

      const mockTx = {
        clinic: {
          create: jest.fn().mockResolvedValue({
            id: 'clinic-promo-fail',
            name: 'Clinique Partner',
            slug: 'clinique-partner-abc123',
          }),
        },
        user: { create: jest.fn().mockResolvedValue({ id: 'user-promo-fail' }) },
        subscription: {
          create: jest.fn().mockResolvedValue({ id: 'sub-promo-db-fail' }),
        },
      };
      mockTransaction.mockImplementation(async (fn: Function) => fn(mockTx));

      await controller.handleWebhook(req, validSignature);

      // Should preserve couponId, discountType, discountValue but couponMetadataType remains null
      expect(mockTx.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          promotionCodeId: 'promo_fail1',
          couponId: 'coupon_fail',
          discountType: 'percent',
          discountValue: 30,
          couponMetadataType: null,
        }),
      });
    });

    it('should gracefully handle session expand failure', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = createCheckoutEventForPromo();
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);
      mockStripeService.stripe.subscriptions.retrieve.mockResolvedValue(
        mockSubscriptionPromo,
      );
      mockStripeService.stripe.checkout.sessions.retrieve.mockRejectedValue(
        new Error('Stripe API error'),
      );
      mockAuthService.createActivationToken.mockResolvedValue({
        message: 'If an account exists, an activation email has been sent',
      });

      const mockTx = {
        clinic: {
          create: jest.fn().mockResolvedValue({
            id: 'clinic-promo-6',
            name: 'Clinique Partner',
            slug: 'clinique-partner-abc123',
          }),
        },
        user: { create: jest.fn().mockResolvedValue({ id: 'user-promo-6' }) },
        subscription: {
          create: jest.fn().mockResolvedValue({ id: 'sub-promo-db-6' }),
        },
      };
      mockTransaction.mockImplementation(async (fn: Function) => fn(mockTx));

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      // Should still create records with null promotion data
      expect(mockTx.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          promotionCodeId: null,
          couponId: null,
          discountType: null,
          discountValue: null,
          couponMetadataType: null,
        }),
      });
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
