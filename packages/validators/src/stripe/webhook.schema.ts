import { z } from "@pawly/zod";

/** Stripe event ID format: evt_* */
export const stripeEventIdSchema = z.string().startsWith("evt_");

/** Stripe customer ID format: cus_* */
export const stripeCustomerIdSchema = z.string().startsWith("cus_");

/** Stripe subscription ID format: sub_* */
export const stripeSubscriptionIdSchema = z.string().startsWith("sub_");

export const webhookEventSchema = z.object({
  stripeEventId: stripeEventIdSchema,
  type: z.string().min(1),
});

export type WebhookEvent = z.infer<typeof webhookEventSchema>;
