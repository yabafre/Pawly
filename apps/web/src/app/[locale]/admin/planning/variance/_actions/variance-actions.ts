"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  listVarianceEventsSchema,
  reviewVarianceSchema,
  getVarianceStatsSchema,
  exportVarianceSchema,
} from "@pawly/validators";

export const listVarianceEventsAction = createServerAction()
  .input(listVarianceEventsSchema)
  .handler(async ({ input }) => {
    return trpc.variance.list.query(input);
  });

export const reviewVarianceAction = createServerAction()
  .input(reviewVarianceSchema)
  .handler(async ({ input }) => {
    return trpc.variance.review.mutate(input);
  });

export const getVarianceStatsAction = createServerAction()
  .input(getVarianceStatsSchema)
  .handler(async ({ input }) => {
    return trpc.variance.getStats.query(input);
  });

export const countPendingVarianceAction = createServerAction().handler(
  async () => {
    return trpc.variance.countPending.query();
  },
);

export const exportVarianceCsvAction = createServerAction()
  .input(exportVarianceSchema)
  .handler(async ({ input }) => {
    return trpc.variance.exportCsv.mutate(input);
  });
