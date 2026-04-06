"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";
import {
  updateClinicNameSchema,
  updateClinicConfigSchema,
  createShiftTypesSchema,
  completeOnboardingSchema,
} from "@pawly/validators";
import { z } from "@pawly/zod";

const onboardingStatusSchema = z.object({
  onboardingCompleted: z.boolean(),
  clinicName: z.string(),
  config: z
    .object({
      workDays: z.array(z.string()),
      defaultStartTime: z.string(),
      defaultEndTime: z.string(),
    })
    .nullable(),
  shiftTypes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      code: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      breakMinutes: z.number(),
      color: z.string(),
    }),
  ),
  onboardingDraft: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const getOnboardingStatusAction = createServerAction()
  .output(onboardingStatusSchema)
  .handler(async () => {
    return trpc.clinic.getOnboardingStatus.query();
  });

export const updateClinicNameAction = createServerAction()
  .input(updateClinicNameSchema)
  .handler(async ({ input }) => {
    return trpc.clinic.updateClinicName.mutate(input);
  });

export const updateClinicConfigAction = createServerAction()
  .input(updateClinicConfigSchema)
  .handler(async ({ input }) => {
    return trpc.clinic.updateClinicConfig.mutate(input);
  });

export const createShiftTypesAction = createServerAction()
  .input(createShiftTypesSchema)
  .handler(async ({ input }) => {
    return trpc.clinic.createShiftTypes.mutate(input);
  });

export const completeOnboardingAction = createServerAction()
  .input(completeOnboardingSchema)
  .handler(async ({ input }) => {
    return trpc.clinic.completeOnboarding.mutate(input);
  });

export const saveOnboardingDraftAction = createServerAction()
  .input(z.object({ step: z.number(), values: z.record(z.string(), z.unknown()) }))
  .handler(async ({ input }) => {
    return trpc.clinic.saveOnboardingDraft.mutate(input);
  });
