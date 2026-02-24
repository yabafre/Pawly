"use client";

import {
  useServerActionQuery,
  useServerActionMutation,
  QueryKeyFactory,
} from "@/lib/hooks/server-action-hooks";
import {
  listAbsencesAction,
  reviewAbsenceAction,
  adminCreateAbsenceAction,
  countPendingAction,
} from "../_actions/admin-absence-actions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export const useAdminAbsences = (filters?: { status?: string; employeeId?: string }) => {
  const { data, isPending, isFetching, error } = useServerActionQuery(
    listAbsencesAction,
    {
      input: filters ?? {},
      queryKey: QueryKeyFactory.adminAbsences(
        `${filters?.status ?? "all"}-${filters?.employeeId ?? "all"}`
      ),
      placeholderData: (prev: unknown) => prev,
    }
  );
  return { absences: data ?? [], isPending, isFetching, error };
};

export const useReviewAbsence = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("admin.absences.toast");

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-absences"] });
    queryClient.invalidateQueries({ queryKey: QueryKeyFactory.pendingAbsenceCount() });
    queryClient.invalidateQueries({ queryKey: QueryKeyFactory.employeeConstraints() });
  };

  const { mutate, isPending, error } = useServerActionMutation(
    reviewAbsenceAction,
    {
      onSuccess: () => {
        invalidateAll();
      },
      onError: (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(message);
      },
    }
  );

  const approve = (absenceId: string) => {
    mutate(
      { absenceId, action: "approve" as const },
      {
        onSuccess: () => toast.success(t("approved")),
        onError: () => toast.error(t("errorApprove")),
      },
    );
  };

  const reject = (absenceId: string, rejectionReason: string) => {
    mutate(
      { absenceId, action: "reject" as const, rejectionReason },
      {
        onSuccess: () => toast.success(t("rejected")),
        onError: () => toast.error(t("errorReject")),
      },
    );
  };

  return { approve, reject, isPending, error };
};

export const useAdminCreateAbsence = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("admin.absences.toast");
  const { mutate, isPending, error } = useServerActionMutation(
    adminCreateAbsenceAction,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["admin-absences"] });
        queryClient.invalidateQueries({ queryKey: QueryKeyFactory.pendingAbsenceCount() });
        queryClient.invalidateQueries({ queryKey: QueryKeyFactory.employeeConstraints() });
        toast.success(t("created"));
      },
      onError: () => {
        toast.error(t("errorCreate"));
      },
    }
  );
  return { createAbsence: mutate, isPending, error };
};

export const usePendingAbsenceCount = () => {
  const { data, isPending } = useServerActionQuery(countPendingAction, {
    input: undefined,
    queryKey: QueryKeyFactory.pendingAbsenceCount(),
    refetchInterval: 30000,
  });
  return { count: data ?? 0, isPending };
};
