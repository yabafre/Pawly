import { z } from "@pawly/zod";
import { couponMetadataTypeEnum, discountTypeEnum } from "./promotion.schema";

/** Schema for creating a Stripe Billing Portal session */
export const createBillingPortalSessionSchema = z.object({
  returnUrl: z.string().url(),
  locale: z.enum(["fr", "en"]).optional(),
});

export type CreateBillingPortalSessionInput = z.infer<
  typeof createBillingPortalSessionSchema
>;

/** Subscription status enum matching Prisma SubscriptionStatus */
const subscriptionStatusEnum = z.enum([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
]);

/** Schema for subscription details response */
export const subscriptionDetailsSchema = z.object({
  status: subscriptionStatusEnum,
  planKey: z.string(),
  planName: z.string(),
  entitlementTier: z.string(),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  trialEnd: z.string().nullable(),
  priceAmount: z.number().nullable(),
  priceCurrency: z.string().nullable(),
  priceInterval: z.string().nullable(),
  // Promotion/discount fields
  promotionCodeId: z.string().nullable().optional(),
  promotionCodeName: z.string().nullable().optional(),
  couponId: z.string().nullable().optional(),
  discountType: discountTypeEnum.optional(),
  discountValue: z.number().min(0).nullable().optional(),
  couponMetadataType: couponMetadataTypeEnum.optional(),
});

export type SubscriptionDetails = z.infer<typeof subscriptionDetailsSchema>;

/** Invoice status enum matching Stripe invoice statuses */
const invoiceStatusEnum = z.enum(["paid", "open", "void", "uncollectible"]);

/** Schema for a single invoice in the history */
export const invoiceSchema = z.object({
  id: z.string(),
  amountPaid: z.number(),
  currency: z.string(),
  status: invoiceStatusEnum,
  invoicePdf: z.string().nullable(),
  hostedInvoiceUrl: z.string().nullable(),
  periodStart: z.string(),
  periodEnd: z.string(),
  created: z.string(),
});

export type Invoice = z.infer<typeof invoiceSchema>;

/** Schema for the full billing overview response */
export const billingOverviewSchema = z.object({
  subscription: subscriptionDetailsSchema,
  invoices: z.array(invoiceSchema),
});

export type BillingOverview = z.infer<typeof billingOverviewSchema>;
