"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  getEquityCountersSchema,
  getQuarterlySummarySchema,
  recalculateCountersSchema,
  listPlanningRulesSchema,
} from "@pawly/validators";

export const getEquityCountersAction = createServerAction()
  .input(getEquityCountersSchema)
  .handler(async ({ input }) => {
    return trpc.planning.getEquityCounters.query(input);
  });

export const getQuarterlySummaryAction = createServerAction()
  .input(getQuarterlySummarySchema)
  .handler(async ({ input }) => {
    return trpc.planning.getQuarterlySummary.query(input);
  });

export const recalculateCountersAction = createServerAction()
  .input(recalculateCountersSchema)
  .handler(async ({ input }) => {
    return trpc.planning.recalculateCounters.mutate(input);
  });

export const listEquityRulesAction = createServerAction()
  .input(listPlanningRulesSchema)
  .handler(async ({ input }) => {
    return trpc.planning.listRules.query(input);
  });
