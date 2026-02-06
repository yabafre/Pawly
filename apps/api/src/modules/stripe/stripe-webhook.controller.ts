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
import { StripeService } from './stripe.service';

@ApiTags('Stripe')
@SkipThrottle()
@Controller('api/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(private readonly stripeService: StripeService) {}

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

    // Idempotency: reject duplicate events
    const alreadyProcessed = await this.stripeService.isEventProcessed(
      event.id,
    );
    if (alreadyProcessed) {
      this.logger.log(`Duplicate event ${event.id} — skipping`);
      return { received: true };
    }

    // Event routing skeleton — business logic delegated to Story 3.2+
    switch (event.type) {
      case 'checkout.session.completed':
        this.logger.log(
          `checkout.session.completed: ${(event.data.object as { id: string }).id}`,
        );
        break;

      case 'customer.subscription.updated':
        this.logger.log(
          `customer.subscription.updated: ${(event.data.object as { id: string }).id}`,
        );
        break;

      case 'customer.subscription.deleted':
        this.logger.log(
          `customer.subscription.deleted: ${(event.data.object as { id: string }).id}`,
        );
        break;

      case 'invoice.payment_failed':
        this.logger.log(
          `invoice.payment_failed: ${(event.data.object as { id: string }).id}`,
        );
        break;

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }

    // Mark event as processed after successful handling
    // Catch unique constraint violation (P2002) for concurrent duplicate deliveries
    try {
      await this.stripeService.markEventProcessed(event.id, event.type);
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        this.logger.log(
          `Concurrent duplicate event ${event.id} — already saved`,
        );
        return { received: true };
      }
      throw err;
    }

    return { received: true };
  }
}
