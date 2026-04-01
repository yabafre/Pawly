"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  changePasswordSchema,
  updateAdminProfileSchema,
} from "@pawly/validators";
import { z } from "@pawly/zod";

export const changePasswordAction = createServerAction()
  .input(changePasswordSchema)
  .handler(async ({ input }) => {
    return trpc.auth.changePassword.mutate(input);
  });

export const updateAdminProfileAction = createServerAction()
  .input(updateAdminProfileSchema)
  .handler(async ({ input }) => {
    return trpc.auth.updateProfile.mutate(input);
  });

export const updateClinicNameAction = createServerAction()
  .input(z.object({ name: z.string().min(2).max(100).trim() }))
  .handler(async ({ input }) => {
    return trpc.clinic.updateClinicName.mutate(input);
  });

export const getClinicProfileAction = createServerAction()
  .handler(async () => {
    return trpc.clinic.getProfile.query();
  });

export const getAdminMeAction = createServerAction()
  .handler(async () => {
    return trpc.auth.getMe.query();
  });
