"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  declareSchoolDaysSchema,
  listSchoolDaysSchema,
} from "@pawly/validators";

export const declareSchoolDaysAction = createServerAction()
  .input(declareSchoolDaysSchema)
  .handler(async ({ input }) => {
    return trpc.employee.declareSchoolDays.mutate(input);
  });

export const listSchoolDaysAction = createServerAction()
  .input(listSchoolDaysSchema)
  .handler(async ({ input }) => {
    return trpc.employee.listSchoolDays.query(input);
  });
