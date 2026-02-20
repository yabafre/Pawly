"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  createShiftTypeSchema,
  updateShiftTypeSchema,
  deleteShiftTypeSchema,
  listShiftTypesSchema,
} from "@pawly/validators";

export const listShiftTypesAction = createServerAction()
  .input(listShiftTypesSchema)
  .handler(async () => {
    return trpc.clinic.listShiftTypes.query({});
  });

export const createShiftTypeAction = createServerAction()
  .input(createShiftTypeSchema)
  .handler(async ({ input }) => {
    return trpc.clinic.createShiftType.mutate(input);
  });

export const updateShiftTypeAction = createServerAction()
  .input(updateShiftTypeSchema)
  .handler(async ({ input }) => {
    return trpc.clinic.updateShiftType.mutate(input);
  });

export const deleteShiftTypeAction = createServerAction()
  .input(deleteShiftTypeSchema)
  .handler(async ({ input }) => {
    return trpc.clinic.deleteShiftType.mutate(input);
  });
