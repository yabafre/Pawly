"use client";

import {
  QueryKeyFactory,
  useServerActionMutation,
  useServerActionQuery,
} from "@/lib/hooks/server-action-hooks";
import {
  getEquityCountersAction,
  getQuarterlySummaryAction,
  recalculateCountersAction,
  listEquityRulesAction,
} from "../_actions/equity-counter-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { EquityCounterType } from "@pawly/validators";

export type CounterThreshold = {
  counterType: string;
  max: number;
};

export const useEquityCounters = (
  year: number,
  months: number[],
  counterTypes?: EquityCounterType[],
) => {
  const queryClient = useQueryClient();
  const t = useTranslations("admin.equityCounters.toast");
  const queryKey = QueryKeyFactory.equityCounters(year, months);

  const { data, isPending, isLoading, isFetching, error, refetch } =
    useServerActionQuery(getEquityCountersAction, {
      input: { year, months, counterTypes },
      queryKey,
      placeholderData: (prev: unknown) => prev,
    });

  const invalidateCounters = () => {
    queryClient.invalidateQueries({ queryKey: ["planning", "equity-counters"] });
    queryClient.invalidateQueries({
      queryKey: ["planning", "equity-quarterly"],
    });
    queryClient.invalidateQueries({
      queryKey: QueryKeyFactory.planning(),
    });
  };

  const {
    mutate: recalculate,
    mutateAsync: recalculateAsync,
    isPending: isRecalculating,
  } = useServerActionMutation(recalculateCountersAction, {
    onSuccess: () => {
      invalidateCounters();
      toast.success(t("recalculated"));
    },
    onError: (err: { message?: string }) => {
      toast.error(t("recalculateFailed"), {
        description: err?.message,
      });
    },
  });

  return {
    counters: data ?? [],
    isPending: isPending || isLoading,
    isFetching,
    error,
    refetch,
    recalculate,
    recalculateAsync,
    isRecalculating,
    invalidateCounters,
  };
};

export const useQuarterlySummary = (year: number, quarter: number) => {
  const queryKey = QueryKeyFactory.equityQuarterlySummary(year, quarter);

  const { data, isPending, isLoading, isFetching, error, refetch } =
    useServerActionQuery(getQuarterlySummaryAction, {
      input: { year, quarter },
      queryKey,
      placeholderData: (prev: unknown) => prev,
    });

  return {
    summary: data ?? [],
    isPending: isPending || isLoading,
    isFetching,
    error,
    refetch,
  };
};

/**
 * Fetch ROTATION_EQUITY rules and build a threshold map per counter type.
 * Maps targetDay to counter types: saturday→SATURDAY_WORKED, sunday→WEEKEND_TOTAL.
 */
export const useEquityThresholds = () => {
  const queryKey = QueryKeyFactory.equityThresholds();

  const { data, isPending } = useServerActionQuery(listEquityRulesAction, {
    input: { category: "ROTATION_EQUITY", isActive: true },
    queryKey,
    placeholderData: (prev: unknown) => prev,
  });

  const thresholds: CounterThreshold[] = [];

  if (data && Array.isArray(data)) {
    for (const rule of data) {
      const config = rule.config as {
        targetDay?: string;
        maxPerPeriod?: number;
      } | null;
      if (!config?.targetDay || !config?.maxPerPeriod) continue;

      if (config.targetDay === "saturday") {
        thresholds.push({
          counterType: "SATURDAY_WORKED",
          max: config.maxPerPeriod,
        });
      } else if (config.targetDay === "sunday") {
        thresholds.push({
          counterType: "WEEKEND_TOTAL",
          max: config.maxPerPeriod,
        });
      }
    }
  }

  return { thresholds, isPending };
};
