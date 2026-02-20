"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  generatePlanSchema,
  listShiftsForMonthSchema,
  deleteGeneratedShiftsSchema,
} from "@pawly/validators";

export const generatePlanAction = createServerAction()
  .input(generatePlanSchema)
  .handler(async ({ input }) => {
    return trpc.planning.generatePlan.mutate(input);
  });

export const listShiftsForMonthAction = createServerAction()
  .input(listShiftsForMonthSchema)
  .handler(async ({ input }) => {
    return trpc.planning.listShiftsForMonth.query(input);
  });

export const deleteGeneratedShiftsAction = createServerAction()
  .input(deleteGeneratedShiftsSchema)
  .handler(async ({ input }) => {
    return trpc.planning.deleteGeneratedShifts.mutate(input);
  });
