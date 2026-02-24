"use client";

import {
  useServerActionQuery,
  useServerActionMutation,
  QueryKeyFactory,
} from "@/lib/hooks/server-action-hooks";
import {
  listMyAbsencesAction,
  createAbsenceRequestAction,
  checkOverlapAction,
} from "../_actions/absence-actions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export const useMyAbsences = (employeeId: string) => {
  const { data, isPending, isFetching, error } = useServerActionQuery(
    listMyAbsencesAction,
    {
      input: { employeeId },
      queryKey: QueryKeyFactory.absences(employeeId),
      placeholderData: (prev: unknown) => prev,
    }
  );
  return { absences: data ?? [], isPending, isFetching, error };
};

export const useCreateAbsenceRequest = (employeeId: string) => {
  const queryClient = useQueryClient();
  const t = useTranslations("dashboard.absences.toast");
  const { mutate, isPending, error } = useServerActionMutation(
    createAbsenceRequestAction,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: QueryKeyFactory.absences(employeeId),
        });
        queryClient.invalidateQueries({
          queryKey: QueryKeyFactory.pendingAbsenceCount(),
        });
        toast.success(t("success"));
      },
      onError: () => {
        toast.error(t("error"));
      },
    }
  );
  return { createAbsence: mutate, isPending, error };
};

const EMPTY_OVERLAP = { hasOverlap: false, overlappingAbsences: [], overlappingUnavailabilities: [] } as const;

export const useCheckOverlap = (
  employeeId: string,
  startDate: string | undefined,
  endDate: string | undefined
) => {
  const enabled = !!startDate && !!endDate;
  const { data, isPending } = useServerActionQuery(checkOverlapAction, {
    input: { employeeId, startDate: startDate ?? "", endDate: endDate ?? "" },
    queryKey: QueryKeyFactory.absences(`${employeeId}-overlap-${startDate}-${endDate}`),
    enabled,
  });
  return {
    overlap: enabled ? (data ?? EMPTY_OVERLAP) : EMPTY_OVERLAP,
    isChecking: isPending && enabled,
  };
};
