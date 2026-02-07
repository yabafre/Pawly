"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  createBillingPortalSessionSchema,
  billingOverviewSchema,
} from "@pawly/validators";

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
