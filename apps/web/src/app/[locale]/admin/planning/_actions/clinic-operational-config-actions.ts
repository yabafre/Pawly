"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  clinicOperationalConfigSchema,
  updateClinicOperationalConfigSchema,
} from "@pawly/validators";

export const getClinicOperationalConfigAction = createServerAction()
  .output(clinicOperationalConfigSchema)
  .handler(async () => {
    const response = await trpc.clinic.getOperationalConfig.query();
    return clinicOperationalConfigSchema.parse(response);
  });

export const updateClinicOperationalConfigAction = createServerAction()
  .input(updateClinicOperationalConfigSchema)
  .output(clinicOperationalConfigSchema)
  .handler(async ({ input }) => {
    const response = await trpc.clinic.updateOperationalConfig.mutate(input);
    return clinicOperationalConfigSchema.parse(response);
  });
