"use client";

import { useServerActionQuery } from "@/lib/hooks/server-action-hooks";
import { getMyScheduleAction, getMyShiftTypesAction } from "../_actions/schedule-actions";

export function useMySchedule(month?: string) {
  return useServerActionQuery(getMyScheduleAction, {
    input: { month },
    queryKey: ["my-schedule", month ?? "current"],
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    networkMode: "offlineFirst" as const,
    placeholderData: (prev: unknown) => prev,
  });
}

export function useMyShiftTypes() {
  return useServerActionQuery(getMyShiftTypesAction, {
    input: undefined,
    queryKey: ["my-shift-types"],
    staleTime: 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    networkMode: "offlineFirst" as const,
  });
}
