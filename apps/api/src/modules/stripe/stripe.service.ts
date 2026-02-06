import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '@/prisma/prisma.service';
import type { EnvConfig } from '@/config/index';

@Injectable()
export class StripeService {
  private stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor(
    private configService: ConfigService<EnvConfig, true>,
    private prisma: PrismaService,
  ) {
    this.stripe = new Stripe(
      this.configService.get('STRIPE_SECRET_KEY', { infer: true }),
    );
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
