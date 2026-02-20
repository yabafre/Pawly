"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import { scheduleViewInputSchema } from "@pawly/validators";

export const getScheduleViewAction = createServerAction()
  .input(scheduleViewInputSchema)
  .handler(async ({ input }) => {
    return trpc.planning.getScheduleView.query(input);
  });
