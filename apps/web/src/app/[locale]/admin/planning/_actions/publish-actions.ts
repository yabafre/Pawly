"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import { publishPlanInputSchema } from "@pawly/validators";

export const publishPlanAction = createServerAction()
  .input(publishPlanInputSchema)
  .handler(async ({ input }) => {
    return trpc.planning.publishPlan.mutate(input);
  });

export const getPublicationStatusAction = createServerAction()
  .input(publishPlanInputSchema)
  .handler(async ({ input }) => {
    return trpc.planning.getPublicationStatus.query(input);
  });

export const getPublishPreviewAction = createServerAction()
  .input(publishPlanInputSchema)
  .handler(async ({ input }) => {
    return trpc.planning.getPublishPreview.query(input);
  });
