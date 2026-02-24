"use server";

import { createServerAction } from "zsa";
import { trpc } from "@/lib/trpc/client";

export const getDashboardStatsAction = createServerAction().handler(
  async () => {
    return trpc.dashboard.getStats.query();
  },
);
