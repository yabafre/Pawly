"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import { createCheckoutSessionSchema } from "@pawly/validators";
import { z } from "@pawly/zod";

const checkoutResponseSchema = z.object({
  sessionId: z.string(),
  url: z.string().url().refine(
    (u) => u.startsWith("https://checkout.stripe.com/"),
    { message: "Invalid checkout URL domain" }
  ),
});

export const createCheckoutSessionAction = createServerAction()
  .input(createCheckoutSessionSchema)
  .output(checkoutResponseSchema)
  .handler(async ({ input }) => {
    return trpc.stripe.createCheckoutSession.mutate(input);
  });
