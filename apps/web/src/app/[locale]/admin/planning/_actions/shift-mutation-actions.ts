"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  moveShiftInputSchema,
  createManualShiftInputSchema,
  deleteShiftInputSchema,
  preValidateMoveInputSchema,
} from "@pawly/validators";

export const moveShiftAction = createServerAction()
  .input(moveShiftInputSchema)
  .handler(async ({ input }) => {
    return trpc.planning.moveShift.mutate(input);
  });

export const createManualShiftAction = createServerAction()
  .input(createManualShiftInputSchema)
  .handler(async ({ input }) => {
    return trpc.planning.createManualShift.mutate(input);
  });

export const deleteShiftAction = createServerAction()
  .input(deleteShiftInputSchema)
  .handler(async ({ input }) => {
    return trpc.planning.deleteShift.mutate(input);
  });

export const preValidateMoveAction = createServerAction()
  .input(preValidateMoveInputSchema)
  .handler(async ({ input }) => {
    return trpc.planning.preValidateMove.mutate(input);
  });
