"use client";

import {
  useServerActionQuery,
  QueryKeyFactory,
} from "@/lib/hooks/server-action-hooks";
import { getDashboardStatsAction } from "../_actions/dashboard-actions";

export const useDashboardStats = () => {
  const { data, isPending, error } = useServerActionQuery(
    getDashboardStatsAction,
    {
      input: undefined,
      queryKey: QueryKeyFactory.dashboardStats(),
      refetchInterval: 60_000,
    },
  );

  return {
    stats: data ?? null,
    isPending,
    error,
  };
};
