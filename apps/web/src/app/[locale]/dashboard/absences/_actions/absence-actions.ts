"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import { z } from "@pawly/zod";
import {
  createAbsenceRequestSchema,
  listAbsencesSchema,
} from "@pawly/validators";

export const createAbsenceRequestAction = createServerAction()
  .input(createAbsenceRequestSchema)
  .handler(async ({ input }) => {
    return trpc.employee.createAbsenceRequest.mutate(input);
  });

export const listMyAbsencesAction = createServerAction()
  .input(listAbsencesSchema)
  .handler(async ({ input }) => {
    return trpc.employee.listAbsences.query(input);
  });

export const checkOverlapAction = createServerAction()
  .input(
    z.object({
      employeeId: z.string().uuid(),
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    })
  )
  .handler(async ({ input }) => {
    return trpc.employee.checkAbsenceOverlap.query(input);
  });
