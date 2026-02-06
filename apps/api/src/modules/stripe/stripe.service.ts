import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '@/prisma/prisma.service';
import type { EnvConfig } from '@/config/index';
import type { CreateCheckoutSessionInput } from '@pawly/validators';

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
}
