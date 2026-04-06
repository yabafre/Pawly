"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  createBillingPortalSessionSchema,
  billingOverviewSchema,
} from "@pawly/validators";
import { z } from "@pawly/zod";

export const getBillingOverviewAction = createServerAction()
  .output(billingOverviewSchema)
  .handler(async () => {
    return trpc.stripe.getBillingOverview.query();
  });

export const createBillingPortalSessionAction = createServerAction()
  .input(createBillingPortalSessionSchema)
  .handler(async ({ input }) => {
    return trpc.stripe.createBillingPortalSession.mutate(input);
  });

export const createUpgradeSessionAction = createServerAction()
  .input(z.object({ priceId: z.string(), locale: z.enum(["fr", "en"]).optional(), successPath: z.string().optional() }))
  .handler(async ({ input }) => {
    return trpc.stripe.createUpgradeSession.mutate(input);
  });

export const setupStarterSubscriptionAction = createServerAction()
  .handler(async () => {
    return trpc.stripe.setupStarterSubscription.mutate();
  });

export const syncAfterCheckoutAction = createServerAction()
  .handler(async () => {
    return trpc.stripe.syncAfterCheckout.mutate();
  });
