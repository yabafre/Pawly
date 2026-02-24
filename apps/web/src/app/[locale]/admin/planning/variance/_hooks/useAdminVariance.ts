"use client";

import {
  useServerActionQuery,
  useServerActionMutation,
  QueryKeyFactory,
} from "@/lib/hooks/server-action-hooks";
import {
  listVarianceEventsAction,
  reviewVarianceAction,
  getVarianceStatsAction,
  countPendingVarianceAction,
  exportVarianceCsvAction,
} from "../_actions/variance-actions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export const useAdminVarianceEvents = (filters?: {
  status?: string;
  employeeId?: string;
  month?: string;
  type?: string;
}) => {
  const { data, isPending, isFetching, error } = useServerActionQuery(
    listVarianceEventsAction,
    {
      input: filters ?? {},
      queryKey: QueryKeyFactory.varianceEvents(
        `${filters?.status ?? "all"}-${filters?.employeeId ?? "all"}-${filters?.month ?? "all"}-${filters?.type ?? "all"}`,
      ),
      placeholderData: (prev: unknown) => prev,
    },
  );
  return { events: data ?? [], isPending, isFetching, error };
};

export const useVarianceStats = (month?: string) => {
  const { data, isPending, error } = useServerActionQuery(
    getVarianceStatsAction,
    {
      input: { month },
      queryKey: QueryKeyFactory.varianceStats(month),
    },
  );
  return { stats: data ?? null, isPending, error };
};

export const usePendingVarianceCount = () => {
  const { data, isPending } = useServerActionQuery(
    countPendingVarianceAction,
    {
      input: undefined,
      queryKey: QueryKeyFactory.pendingVarianceCount(),
      refetchInterval: 30_000,
    },
  );
  return { count: data ?? 0, isPending };
};

export const useReviewVariance = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("admin.variance.toast");

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["variance-events"] });
    queryClient.invalidateQueries({
      queryKey: QueryKeyFactory.pendingVarianceCount(),
    });
  };

  const { mutate, isPending, error } = useServerActionMutation(
    reviewVarianceAction,
    {
      onSuccess: () => {
        invalidateAll();
      },
    },
  );

  const approve = (varianceId: string) => {
    mutate(
      { varianceId, action: "approve" as const },
      {
        onSuccess: () => toast.success(t("approved")),
        onError: () => toast.error(t("errorApprove")),
      },
    );
  };

  const reject = (varianceId: string, exceptionNote: string) => {
    mutate(
      { varianceId, action: "reject" as const, exceptionNote },
      {
        onSuccess: () => toast.success(t("rejected")),
        onError: () => toast.error(t("errorReject")),
      },
    );
  };

  return { approve, reject, isPending, error };
};

export const useExportVarianceCsv = () => {
  const t = useTranslations("admin.variance.toast");

  const { mutate, isPending } = useServerActionMutation(
    exportVarianceCsvAction,
  );

  const exportCsv = (month: string, employeeId?: string) => {
    mutate(
      { month, employeeId },
      {
        onSuccess: (csv) => {
          const blob = new Blob(["\uFEFF" + csv], {
            type: "text/csv;charset=utf-8;",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `ecarts-${month}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success(t("exported"));
        },
        onError: () => {
          toast.error(t("errorExport"));
        },
      },
    );
  };

  return { exportCsv, isPending };
};
