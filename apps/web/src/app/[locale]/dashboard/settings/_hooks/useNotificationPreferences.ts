"use client";

import {
  QueryKeyFactory,
  useServerActionQuery,
  useServerActionMutation,
} from "@/lib/hooks/server-action-hooks";
import { useQueryClient } from "@tanstack/react-query";
import {
  getNotificationPreferencesAction,
  updateNotificationPreferencesAction,
} from "../_actions/settings-actions";
import type { NotificationPreferencesResponse } from "@pawly/validators";

export function useNotificationPreferences() {
  const result = useServerActionQuery(getNotificationPreferencesAction, {
    queryKey: QueryKeyFactory.myNotificationPreferences(),
    input: undefined,
    staleTime: 5 * 60 * 1000,
  });

  const data = result.data as NotificationPreferencesResponse | undefined;

  return {
    ...result,
    data,
  };
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useServerActionMutation(updateNotificationPreferencesAction, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeyFactory.myNotificationPreferences() });
    },
  });
}
