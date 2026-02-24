import {
  Controller,
  Post,
  Req,
  Headers,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { Public } from '@/common/decorators/public.decorator';
import { generateSlug } from '@/common/utils/slug';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthService } from '@/modules/auth/auth.service';
import { StripeService } from './stripe.service';
import { deriveEntitlementTier } from './stripe.utils';
import type {
  SubscriptionStatus,
  CouponMetadataType,
  DiscountType,
} from '@pawly/validators';

type PromotionData = {
  promotionCodeId: string | null;
  couponId: string | null;
  discountType: DiscountType | null;
  discountValue: number | null;
  couponMetadataType: CouponMetadataType | null;
};

const EMPTY_PROMOTION_DATA: PromotionData = {
  promotionCodeId: null,
  couponId: null,
  discountType: null,
  discountValue: null,
  couponMetadataType: null,
};

const SUBSCRIPTION_STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  canceled: 'canceled',
  unpaid: 'unpaid',
  incomplete: 'unpaid',
  incomplete_expired: 'canceled',
  paused: 'active',
};

function mapSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
  return SUBSCRIPTION_STATUS_MAP[stripeStatus] ?? 'unpaid';
}

@ApiTags('Stripe')
@SkipThrottle()
@Controller('api/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  @Public()
  @Post('webhook')
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event: Stripe.Event;
    try {
      event = this.stripeService.constructWebhookEvent(req.rawBody, signature);
    } catch (err) {
      this.logger.warn(
        `Webhook signature verification failed: ${(err as Error).message}`,
      );
      throw new BadRequestException('Webhook signature verification failed');
    }

    // Idempotency: atomically claim the event before processing
    // This prevents the check-then-act race condition where concurrent
    // deliveries both pass an isProcessed check and duplicate business logic.
    try {
      await this.stripeService.markEventProcessed(event.id, event.type);
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        this.logger.log(`Duplicate event ${event.id} — skipping`);
        return { received: true };
      }
      throw err;
    }

    // Event routing — only one thread reaches here per event
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          await this.handleCheckoutSessionCompleted(
            event.data.object as Stripe.Checkout.Session,
          );
          break;
        }

        case 'customer.subscription.updated': {
          await this.handleSubscriptionUpdated(
            event.data.object as Stripe.Subscription,
          );
          break;
        }

        case 'customer.subscription.deleted': {
          await this.handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription,
          );
          break;
        }

        case 'invoice.payment_failed': {
          await this.handleInvoicePaymentFailed(
            event.data.object as Stripe.Invoice,
          );
          break;
        }

        case 'invoice.paid': {
          await this.handleInvoicePaid(
            event.data.object as Stripe.Invoice,
          );
          break;
        }

        default:
          this.logger.log(`Unhandled event type: ${event.type}`);
      }
    } catch (err) {
      // Unclaim event to allow Stripe retry on processing failure
      await this.stripeService.deleteEvent(event.id).catch(() => {});
      throw err;
    }

    return { received: true };
  }

  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ) {
    const metadata = session.metadata;
    if (!metadata?.clinicName || !metadata?.adminEmail) {
      this.logger.error(
        `checkout.session.completed ${session.id}: missing required metadata (clinicName or adminEmail)`,
      );
      return;
    }

    const { clinicName, adminName, adminEmail } = metadata;
    const stripeCustomerId = session.customer as string;
    const stripeSubscriptionId = session.subscription as string;

    this.logger.log(
      `checkout.session.completed: ${session.id} — creating clinic for ${adminEmail}`,
    );

    // Retrieve subscription for full details
    const subscription =
      await this.stripeService.stripe.subscriptions.retrieve(
        stripeSubscriptionId,
      );

    const promotionData = await this.getPromotionDataFromCheckoutSession(
      session.id,
    );

    // Atomic: create Clinic + Admin User + Subscription in a single transaction
    await this.prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({
        data: {
          name: clinicName,
          slug: generateSlug(clinicName),
          onboardingCompleted: false,
        },
      });

      await tx.user.create({
        data: {
          email: adminEmail,
          name: adminName || null,
          role: 'ADMIN',
          clinicId: clinic.id,
        },
      });

      const firstItem = subscription.items.data[0];
      await tx.subscription.create({
        data: {
          clinicId: clinic.id,
          stripeCustomerId,
          stripeSubscriptionId,
          status: mapSubscriptionStatus(subscription.status),
          planKey: firstItem?.price.lookup_key ?? 'default',
          entitlementTier: deriveEntitlementTier(subscription),
          currentPeriodEnd: firstItem
            ? new Date(firstItem.current_period_end * 1000)
            : null,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          ...promotionData,
        },
      });
    });

    // Send activation email (outside transaction — email is non-reversible)
    // Admin must set their password to activate their account (Architecture: hybrid auth for admins)
    await this.authService.createActivationToken(adminEmail, adminName || undefined);
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const stripeSubscriptionId = subscription.id;
    this.logger.log(`customer.subscription.updated: ${stripeSubscriptionId}`);

    try {
      const latestSubscription =
        await this.stripeService.stripe.subscriptions.retrieve(
          stripeSubscriptionId,
          {
            expand: [
              'items.data.price.product',
              'discounts',
              'discounts.source.coupon',
              'discounts.promotion_code',
            ],
          },
        );

      const firstItem = latestSubscription.items.data[0];
      const promotionData =
        await this.getPromotionDataFromSubscription(latestSubscription);

      await this.prisma.subscription.update({
        where: { stripeSubscriptionId },
        data: {
          status: mapSubscriptionStatus(latestSubscription.status),
          planKey: firstItem?.price.lookup_key ?? 'default',
          entitlementTier: deriveEntitlementTier(latestSubscription),
          currentPeriodEnd: firstItem
            ? new Date(firstItem.current_period_end * 1000)
            : null,
          cancelAtPeriodEnd: latestSubscription.cancel_at_period_end,
          ...promotionData,
        },
      });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2025'
      ) {
        this.logger.warn(
          `customer.subscription.updated: subscription ${stripeSubscriptionId} not found — may arrive out of order`,
        );
        return;
      }
      throw err;
    }
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const stripeSubscriptionId = subscription.id;
    this.logger.log(`customer.subscription.deleted: ${stripeSubscriptionId}`);

    try {
      await this.prisma.subscription.update({
        where: { stripeSubscriptionId },
        data: {
          status: 'canceled',
          cancelAtPeriodEnd: false,
        },
      });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2025'
      ) {
        this.logger.warn(
          `customer.subscription.deleted: subscription ${stripeSubscriptionId} not found — may arrive out of order`,
        );
        return;
      }
      throw err;
    }
  }

  private async getPromotionDataFromCheckoutSession(
    sessionId: string,
  ): Promise<PromotionData> {
    try {
      const fullSession =
        await this.stripeService.stripe.checkout.sessions.retrieve(sessionId, {
          expand: ['discounts', 'discounts.coupon', 'discounts.promotion_code'],
        });

      const discount = fullSession.discounts?.[0];
      if (!discount) {
        return { ...EMPTY_PROMOTION_DATA };
      }

      return this.buildPromotionData(
        discount.promotion_code,
        discount.coupon,
        `checkout.session.completed ${sessionId}`,
      );
    } catch (err) {
      this.logger.warn(
        `checkout.session.completed ${sessionId}: failed to retrieve expanded session for discounts — ${(err as Error).message}`,
      );
      return { ...EMPTY_PROMOTION_DATA };
    }
  }

  private async getPromotionDataFromSubscription(
    subscription: Stripe.Subscription,
  ): Promise<PromotionData> {
    const firstDiscount = subscription.discounts?.[0];
    if (!firstDiscount) {
      return { ...EMPTY_PROMOTION_DATA };
    }

    if (typeof firstDiscount === 'string') {
      this.logger.warn(
        `customer.subscription.updated ${subscription.id}: discount ${firstDiscount} is not expanded`,
      );
      return { ...EMPTY_PROMOTION_DATA };
    }

    return this.buildPromotionData(
      firstDiscount.promotion_code,
      firstDiscount.source?.coupon ?? null,
      `customer.subscription.updated ${subscription.id}`,
    );
  }

  private async buildPromotionData(
    promotionCodeRef: string | Stripe.PromotionCode | null | undefined,
    couponRef: string | Stripe.Coupon | null | undefined,
    logContext: string,
  ): Promise<PromotionData> {
    const promotionCodeId =
      typeof promotionCodeRef === 'string'
        ? promotionCodeRef
        : promotionCodeRef?.id ?? null;

    let couponId =
      typeof couponRef === 'string' ? couponRef : couponRef?.id ?? null;

    let coupon: Stripe.Coupon | null =
      couponRef && typeof couponRef === 'object' ? couponRef : null;
    let couponFetchFailed = false;

    if (typeof couponRef === 'string') {
      try {
        coupon = await this.stripeService.stripe.coupons.retrieve(couponRef);
        couponId = coupon.id;
      } catch (err) {
        couponFetchFailed = true;
        this.logger.warn(
          `${logContext}: failed to retrieve coupon details for ${couponRef} — ${(err as Error).message}`,
        );
      }
    }

    let discountType: DiscountType | null = null;
    let discountValue: number | null = null;
    if (coupon?.percent_off !== null && coupon?.percent_off !== undefined) {
      discountType = 'percent';
      discountValue = coupon.percent_off;
    } else if (coupon?.amount_off !== null && coupon?.amount_off !== undefined) {
      discountType = 'amount';
      discountValue = coupon.amount_off;
    }

    let couponMetadataType = this.parseCouponMetadataType(coupon?.metadata?.type);

    if (
      !couponMetadataType &&
      couponId &&
      typeof couponRef !== 'string' &&
      !couponFetchFailed
    ) {
      try {
        const couponDetail =
          await this.stripeService.stripe.coupons.retrieve(couponId);
        couponMetadataType = this.parseCouponMetadataType(
          couponDetail?.metadata?.type,
        );
      } catch (err) {
        this.logger.warn(
          `${logContext}: failed to retrieve coupon metadata for ${couponId} — ${(err as Error).message}`,
        );
      }
    }

    return {
      promotionCodeId,
      couponId,
      discountType,
      discountValue,
      couponMetadataType,
    };
  }

  private parseCouponMetadataType(
    metadataType: string | undefined,
  ): CouponMetadataType | null {
    if (
      metadataType === 'partner' ||
      metadataType === 'internal' ||
      metadataType === 'lifetime'
    ) {
      return metadataType;
    }
    return null;
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    this.logger.log(`invoice.paid: ${invoice.id}`);

    const subscriptionRef =
      invoice.parent?.subscription_details?.subscription;
    const stripeSubscriptionId =
      typeof subscriptionRef === 'string'
        ? subscriptionRef
        : subscriptionRef?.id;

    if (!stripeSubscriptionId) {
      this.logger.warn(
        `invoice.paid ${invoice.id} has no subscription — skipping`,
      );
      return;
    }

    try {
      // Only recover from past_due — don't update if already active
      const existing = await this.prisma.subscription.findUnique({
        where: { stripeSubscriptionId },
        select: { status: true },
      });

      if (!existing) {
        this.logger.warn(
          `invoice.paid: subscription ${stripeSubscriptionId} not found — may arrive out of order`,
        );
        return;
      }

      if (existing.status === 'past_due') {
        await this.prisma.subscription.update({
          where: { stripeSubscriptionId },
          data: { status: 'active' },
        });
        this.logger.log(
          `invoice.paid: recovered subscription ${stripeSubscriptionId} from past_due to active`,
        );
      }
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2025'
      ) {
        this.logger.warn(
          `invoice.paid: subscription ${stripeSubscriptionId} not found — may arrive out of order`,
        );
        return;
      }
      throw err;
    }
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    this.logger.log(`invoice.payment_failed: ${invoice.id}`);

    const subscriptionRef =
      invoice.parent?.subscription_details?.subscription;
    const stripeSubscriptionId =
      typeof subscriptionRef === 'string'
        ? subscriptionRef
        : subscriptionRef?.id;

    if (!stripeSubscriptionId) {
      this.logger.warn(
        `invoice.payment_failed ${invoice.id} has no subscription — skipping`,
      );
      return;
    }

    try {
      await this.prisma.subscription.update({
        where: { stripeSubscriptionId },
        data: {
          status: 'past_due',
        },
      });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2025'
      ) {
        this.logger.warn(
          `invoice.payment_failed: subscription ${stripeSubscriptionId} not found — may arrive out of order`,
        );
        return;
      }
      throw err;
    }
  }
}
