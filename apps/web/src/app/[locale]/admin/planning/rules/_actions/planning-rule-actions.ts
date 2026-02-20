"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  createPlanningRuleSchema,
  updatePlanningRuleSchema,
  togglePlanningRuleSchema,
  planningRuleIdSchema,
  listPlanningRulesSchema,
  validateShiftsSchema,
} from "@pawly/validators";

export const listPlanningRulesAction = createServerAction()
  .input(listPlanningRulesSchema)
  .handler(async ({ input }) => {
    return trpc.planning.listRules.query(input);
  });

export const getPlanningRuleByIdAction = createServerAction()
  .input(planningRuleIdSchema)
  .handler(async ({ input }) => {
    return trpc.planning.getRuleById.query(input);
  });

export const createPlanningRuleAction = createServerAction()
  .input(createPlanningRuleSchema)
  .handler(async ({ input }) => {
    return trpc.planning.createRule.mutate(input);
  });

export const updatePlanningRuleAction = createServerAction()
  .input(updatePlanningRuleSchema)
  .handler(async ({ input }) => {
    return trpc.planning.updateRule.mutate(input);
  });

export const deletePlanningRuleAction = createServerAction()
  .input(planningRuleIdSchema)
  .handler(async ({ input }) => {
    return trpc.planning.deleteRule.mutate(input);
  });

export const togglePlanningRuleAction = createServerAction()
  .input(togglePlanningRuleSchema)
  .handler(async ({ input }) => {
    return trpc.planning.toggleRule.mutate(input);
  });

export const validateShiftsAction = createServerAction()
  .input(validateShiftsSchema)
  .handler(async ({ input }) => {
    return trpc.planning.validateShifts.query(input);
  });
