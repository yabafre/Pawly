"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  listAbsencesSchema,
  reviewAbsenceSchema,
  adminCreateAbsenceSchema,
} from "@pawly/validators";

export const listAbsencesAction = createServerAction()
  .input(listAbsencesSchema)
  .handler(async ({ input }) => {
    return trpc.employee.listAbsences.query(input);
  });

export const reviewAbsenceAction = createServerAction()
  .input(reviewAbsenceSchema)
  .handler(async ({ input }) => {
    return trpc.employee.reviewAbsence.mutate(input);
  });

export const adminCreateAbsenceAction = createServerAction()
  .input(adminCreateAbsenceSchema)
  .handler(async ({ input }) => {
    return trpc.employee.adminCreateAbsence.mutate(input);
  });

export const countPendingAction = createServerAction()
  .handler(async () => {
    return trpc.employee.countPendingAbsences.query();
  });

export const listEmployeesAction = createServerAction()
  .handler(async () => {
    return trpc.employee.list.query({});
  });
