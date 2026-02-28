"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import { confirmShiftSchema } from "@pawly/validators";

export const confirmMyShiftAction = createServerAction()
  .input(confirmShiftSchema)
  .handler(async ({ input }) => {
    return trpc.presenceConfirmation.confirmMyShift.mutate(input);
  });
