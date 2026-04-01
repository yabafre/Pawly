"use client";

import { useCallback } from "react";
import {
  QueryKeyFactory,
  useServerActionMutation,
  useServerActionQuery,
} from "@/lib/hooks/server-action-hooks";
import {
  generatePlanAction,
  listShiftsForMonthAction,
  deleteGeneratedShiftsAction,
} from "../_actions/generation-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export const useGeneration = (month?: string) => {
  const queryClient = useQueryClient();
  const t = useTranslations("admin.planningGeneration.toast");
  const shiftsQueryKey = QueryKeyFactory.planningShifts(month);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["planning", "shifts"],
    });
    queryClient.invalidateQueries({
      queryKey: ["planning", "schedule-view"],
    });
    queryClient.invalidateQueries({
      queryKey: ["planning", "equity-counters"],
    });
    queryClient.invalidateQueries({
      queryKey: QueryKeyFactory.planningGeneration(),
    });
  }, [queryClient]);

  const {
    data: shifts,
    isPending: isLoadingShifts,
    isFetching: isFetchingShifts,
    refetch: refetchShifts,
  } = useServerActionQuery(listShiftsForMonthAction, {
    input: { month: month ?? "" },
    queryKey: shiftsQueryKey,
    enabled: !!month && month.length > 0,
    placeholderData: (prev: unknown) => prev,
  });

  const { mutate: generatePlan, isPending: isGenerating } =
    useServerActionMutation(generatePlanAction, {
      onSuccess: () => {
        invalidateAll();
        toast.success(t("generated"));
      },
      onError: (err: { message?: string }) => {
        toast.error(t("generateFailed"), { description: err?.message });
      },
    });

  const { mutate: deleteGenerated, isPending: isDeleting } =
    useServerActionMutation(deleteGeneratedShiftsAction, {
      onSuccess: () => {
        invalidateAll();
        toast.success(t("deleted"));
      },
      onError: (err: { message?: string }) => {
        toast.error(t("deleteFailed"), { description: err?.message });
      },
    });

  return {
    shifts: shifts ?? [],
    isLoadingShifts,
    isFetchingShifts,
    refetchShifts,
    generatePlan,
    isGenerating,
    deleteGenerated,
    isDeleting,
    invalidateAll,
  };
};
