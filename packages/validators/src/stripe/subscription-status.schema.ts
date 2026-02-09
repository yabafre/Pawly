import { z } from "@pawly/zod";

export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

export const TIER_HIERARCHY = [
  "starter",
  "professional",
  "enterprise",
] as const;

export type EntitlementTier = (typeof TIER_HIERARCHY)[number];

export const subscriptionStatusSchema = z.enum([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
]);

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const subscriptionGuardResponseSchema = z
  .object({
    status: subscriptionStatusSchema,
    entitlementTier: z.string(),
    cancelAtPeriodEnd: z.boolean(),
    currentPeriodEnd: z.string().nullable(),
  })
  .nullable();

export type SubscriptionGuardResponse = z.infer<
  typeof subscriptionGuardResponseSchema
>;
