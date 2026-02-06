import { z } from "@pawly/zod";

/** Schema for the pre-checkout form → createCheckoutSession tRPC mutation */
export const createCheckoutSessionSchema = z.object({
  clinicName: z.string().min(1).max(255),
  adminName: z.string().min(1).max(255),
  adminEmail: z.string().email(),
  priceId: z.string().min(1),
  locale: z.enum(["fr", "en"]).default("fr"),
});

export type CreateCheckoutSessionInput = z.infer<
  typeof createCheckoutSessionSchema
>;
