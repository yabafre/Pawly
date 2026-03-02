import { z } from "@pawly/zod";

export const updateNotificationPreferencesSchema = z.object({
  notifyOnPublish: z.boolean(),
});

export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;

export const notificationPreferencesResponseSchema = updateNotificationPreferencesSchema;

export type NotificationPreferencesResponse = z.infer<typeof notificationPreferencesResponseSchema>;
