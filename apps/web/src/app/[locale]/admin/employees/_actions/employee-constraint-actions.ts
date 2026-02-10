"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  listUnavailabilitiesSchema,
  createUnavailabilitySchema,
  updateUnavailabilitySchema,
  unavailabilityIdSchema,
  hardRuleRangeSchema,
} from "@pawly/validators";

export const listEmployeeConstraintsAction = createServerAction()
  .input(listUnavailabilitiesSchema)
  .handler(async ({ input }) => {
    return trpc.employee.listConstraints.query(input);
  });

export const createEmployeeConstraintAction = createServerAction()
  .input(createUnavailabilitySchema)
  .handler(async ({ input }) => {
    return trpc.employee.createConstraint.mutate(input);
  });

export const updateEmployeeConstraintAction = createServerAction()
  .input(updateUnavailabilitySchema)
  .handler(async ({ input }) => {
    return trpc.employee.updateConstraint.mutate(input);
  });

export const deleteEmployeeConstraintAction = createServerAction()
  .input(unavailabilityIdSchema)
  .handler(async ({ input }) => {
    return trpc.employee.deleteConstraint.mutate(input);
  });

export const listHardRulesAction = createServerAction()
  .input(hardRuleRangeSchema)
  .handler(async ({ input }) => {
    return trpc.employee.listHardRules.query(input);
  });

