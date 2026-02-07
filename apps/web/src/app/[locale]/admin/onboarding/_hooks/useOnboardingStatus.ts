"use client";

import { useServerActionQuery } from "@/lib/hooks/server-action-hooks";
import { getOnboardingStatusAction } from "../_actions/onboarding-actions";

export const useOnboardingStatus = () => {
  const { data, isLoading, isError } = useServerActionQuery(
    getOnboardingStatusAction,
    {
      input: undefined,
      queryKey: ["clinic"],
    },
  );

  const initialData = data
    ? {
        clinicName: data.clinicName,
        config: data.config
          ? {
              workDays: data.config.workDays,
              defaultStartTime: data.config.defaultStartTime,
              defaultEndTime: data.config.defaultEndTime,
            }
          : null,
        shiftTypes: data.shiftTypes.map((st) => ({
          name: st.name,
          code: st.code,
          startTime: st.startTime,
          endTime: st.endTime,
          color: st.color,
        })),
      }
    : null;

  return {
    initialData,
    isLoading,
    isError,
  };
};
