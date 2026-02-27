"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import { getEmployeeScheduleSchema } from "@pawly/validators";

export const getMyScheduleAction = createServerAction()
  .input(getEmployeeScheduleSchema)
  .handler(async ({ input }) => {
    return trpc.employeeSchedule.getMySchedule.query(input);
  });

export const getMyShiftTypesAction = createServerAction().handler(async () => {
  return trpc.employeeSchedule.getMyShiftTypes.query();
});
