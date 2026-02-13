"use client";

import {
  QueryKeyFactory,
  useServerActionMutation,
  useServerActionQuery,
} from "@/lib/hooks/server-action-hooks";
import {
  listShiftTypesAction,
  createShiftTypeAction,
  updateShiftTypeAction,
  deleteShiftTypeAction,
} from "../_actions/shift-type-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export type ShiftTypeRecord = {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  color: string;
};

export const useClinicShiftTypes = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.shiftTypes.toast");
  const queryKey = QueryKeyFactory.clinicShiftTypes();

  const { data, isPending, isLoading, isFetching, error, refetch } =
    useServerActionQuery(listShiftTypesAction, {
      input: {},
      queryKey,
      placeholderData: (prev: unknown) => prev,
    });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({
      queryKey: QueryKeyFactory.planningRules(),
    });
  };

  const { mutate: createShiftType, isPending: isCreating } =
    useServerActionMutation(createShiftTypeAction, {
      onSuccess: () => {
        invalidate();
        toast.success(t("created"));
      },
      onError: (err: { message?: string }) => {
        toast.error(t("createFailed"), { description: err?.message });
      },
    });

  const { mutate: updateShiftType, isPending: isUpdating } =
    useServerActionMutation(updateShiftTypeAction, {
      onSuccess: () => {
        invalidate();
        toast.success(t("updated"));
      },
      onError: (err: { message?: string }) => {
        toast.error(t("updateFailed"), { description: err?.message });
      },
    });

  const { mutate: deleteShiftType, isPending: isDeleting } =
    useServerActionMutation(deleteShiftTypeAction, {
      onSuccess: () => {
        invalidate();
        toast.success(t("deleted"));
      },
      onError: (err: { message?: string }) => {
        toast.error(t("deleteFailed"), { description: err?.message });
      },
    });

  return {
    shiftTypes: (data ?? []) as ShiftTypeRecord[],
    isPending: isPending || isLoading,
    isFetching,
    error,
    refetch,
    createShiftType,
    isCreating,
    updateShiftType,
    isUpdating,
    deleteShiftType,
    isDeleting,
  };
};
