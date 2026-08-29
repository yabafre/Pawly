"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  changePasswordSchema,
  updateAdminProfileSchema,
  updateClinicNameSchema,
} from "@pawly/validators";

export const changePasswordAction = createServerAction()
  .input(changePasswordSchema)
  // Without this, zsa swaps the message for a generic one and the panel — which
  // decides between "wrong current password" and "something went wrong" by
  // reading it — could only ever say the latter.
  .experimental_shapeError(({ err }) => ({
    message: err instanceof Error ? err.message : "UNKNOWN",
  }))
  .handler(async ({ input }) => {
    return trpc.auth.changePassword.mutate(input);
  });

export const updateAdminProfileAction = createServerAction()
  .input(updateAdminProfileSchema)
  .handler(async ({ input }) => {
    return trpc.auth.updateProfile.mutate(input);
  });

// The shared schema, not a local restatement of it: this action used to declare
// `{ name }` while the router validated `{ clinicName }`, so every rename was an
// input error before it reached the service.
export const updateClinicNameAction = createServerAction()
  .input(updateClinicNameSchema)
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
