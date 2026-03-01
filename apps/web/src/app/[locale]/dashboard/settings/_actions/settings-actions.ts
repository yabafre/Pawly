"use server";

import { createServerAction } from "zsa";
import { z } from "@pawly/zod";
import { trpc } from "@/lib/trpc/client";
import { updateNotificationPreferencesSchema } from "@pawly/validators";

export const getNotificationPreferencesAction = createServerAction().handler(
  async () => {
    return trpc.employeeSchedule.getMyNotificationPreferences.query();
  },
);

export const updateNotificationPreferencesAction = createServerAction()
  .input(updateNotificationPreferencesSchema)
  .handler(async ({ input }) => {
    return trpc.employeeSchedule.updateMyNotificationPreferences.mutate(input);
  });

export const getMyPushSubscriptionAction = createServerAction().handler(
  async () => {
    return trpc.employeeSchedule.getMyPushSubscription.query();
  },
);

export const subscribePushAction = createServerAction()
  .input(
    z.object({
      endpoint: z.string().url(),
      keys: z.object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      }),
    }),
  )
  .handler(async ({ input }) => {
    return trpc.employeeSchedule.subscribePush.mutate(input);
  });

export const unsubscribePushAction = createServerAction()
  .input(z.object({ endpoint: z.string().url() }))
  .handler(async ({ input }) => {
    return trpc.employeeSchedule.unsubscribePush.mutate(input);
  });
