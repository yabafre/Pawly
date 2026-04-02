import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '@/prisma/prisma.service';
import type { EnvConfig } from '@/config/index';
import type { CreateCheckoutSessionInput } from '@pawly/validators';
import type { SubscriptionDetails, Invoice } from '@pawly/validators';
import { deriveEntitlementTier } from './stripe.utils';

@Injectable()
export class StripeService {
  private readonly stripeClient: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor(
    private configService: ConfigService<EnvConfig, true>,
    private prisma: PrismaService,
  ) {
    this.stripeClient = new Stripe(
      this.configService.get('STRIPE_SECRET_KEY', { infer: true }),
    );
  }

  /** Expose Stripe client for webhook handler operations (e.g. subscriptions.retrieve) */
  get stripe(): Stripe {
    return this.stripeClient;
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput) {
    const { clinicName, adminName, adminEmail, priceId, locale } = input;
    const webAppUrl = this.configService.get('WEB_APP_URL', { infer: true });

    const session = await this.stripeClient.checkout.sessions.create({
      mode: 'subscription',
      payment_method_collection: 'if_required',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${webAppUrl}/${locale}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${webAppUrl}/${locale}/pricing`,
      customer_email: adminEmail,
      allow_promotion_codes: true,
      metadata: {
        clinicName,
        adminName,
        adminEmail,
      },
      subscription_data: {
        metadata: {
          clinicName,
          adminName,
          adminEmail,
        },
      },
    });

    if (!session.url) {
      throw new Error('Stripe Checkout Session created without a URL');
    }

    return { sessionId: session.id, url: session.url };
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
  ): Stripe.Event {
    const webhookSecret = this.configService.get('STRIPE_WEBHOOK_SECRET', {
      infer: true,
    });
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  }

  async isEventProcessed(stripeEventId: string): Promise<boolean> {
    const existing = await this.prisma.stripeEvent.findUnique({
      where: { stripeEventId },
    });
    return !!existing;
  }

  async markEventProcessed(
    stripeEventId: string,
    type: string,
  ): Promise<void> {
    await this.prisma.stripeEvent.create({
      data: { stripeEventId, type },
    });
  }

  async deleteEvent(stripeEventId: string): Promise<void> {
    await this.prisma.stripeEvent.delete({
      where: { stripeEventId },
    });
  }

  async createBillingPortalSession(
    stripeCustomerId: string,
    returnUrl: string,
    locale?: string,
  ): Promise<{ url: string }> {
    this.logger.log(
      `Creating billing portal session for customer ${stripeCustomerId}`,
    );

    const session = await this.stripeClient.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
      locale: (locale as Stripe.BillingPortal.SessionCreateParams['locale']) || 'fr',
      ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID && {
        configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID,
      }),
    });

    return { url: session.url };
  }

  async getSubscriptionWithDetails(
    stripeSubscriptionId: string,
  ): Promise<SubscriptionDetails> {
    this.logger.log(
      `Retrieving subscription details for ${stripeSubscriptionId}`,
    );

    const subscription = await this.stripeClient.subscriptions.retrieve(
      stripeSubscriptionId,
      {
        expand: [
          'latest_invoice',
          'default_payment_method',
          'items.data.price.product',
          'discounts',
          'discounts.promotion_code',
        ],
      },
    );

    const firstItem = subscription.items.data[0];
    const price = firstItem?.price;
    const product = price?.product;
    const productName =
      product && typeof product === 'object' && 'name' in product
        ? product.name
        : 'Unknown';

    // Extract promotion code name from discount if available
    let promotionCodeName: string | null = null;
    const firstDiscount = subscription.discounts?.[0];
    if (firstDiscount && typeof firstDiscount === 'object') {
      const promoCode = (firstDiscount as Stripe.Discount).promotion_code;
      if (promoCode && typeof promoCode === 'object' && 'code' in promoCode) {
        promotionCodeName = promoCode.code;
      } else if (typeof promoCode === 'string') {
        try {
          const promoObj = await this.stripeClient.promotionCodes.retrieve(promoCode);
          promotionCodeName = promoObj.code;
        } catch {
          this.logger.warn(`Failed to retrieve promotion code ${promoCode}`);
        }
      }
    }

    return {
      status: subscription.status as SubscriptionDetails['status'],
      planKey: price?.lookup_key ?? 'default',
      planName: productName,
      entitlementTier: deriveEntitlementTier(subscription),
      currentPeriodEnd: firstItem
        ? new Date(firstItem.current_period_end * 1000).toISOString()
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      priceAmount: price?.unit_amount ?? null,
      priceCurrency: price?.currency ?? null,
      priceInterval: price?.recurring?.interval ?? null,
      promotionCodeName,
    };
  }

  async listInvoices(
    stripeCustomerId: string,
    limit?: number,
  ): Promise<Invoice[]> {
    this.logger.log(
      `Listing invoices for customer ${stripeCustomerId}`,
    );

    const invoices = await this.stripeClient.invoices.list({
      customer: stripeCustomerId,
      limit: limit || 10,
    });

    return invoices.data.map((inv) => ({
      id: inv.id,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      status: (inv.status ?? 'open') as Invoice['status'],
      invoicePdf: inv.invoice_pdf ?? null,
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      periodStart: new Date((inv.period_start ?? 0) * 1000).toISOString(),
      periodEnd: new Date((inv.period_end ?? 0) * 1000).toISOString(),
      created: new Date(inv.created * 1000).toISOString(),
    }));
  }
}
