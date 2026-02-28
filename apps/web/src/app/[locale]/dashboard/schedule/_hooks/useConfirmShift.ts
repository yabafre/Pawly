"use client";

import {
  QueryKeyFactory,
  useServerActionMutation,
} from "@/lib/hooks/server-action-hooks";
import { confirmMyShiftAction } from "../_actions/presence-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { EmployeeScheduleData } from "@pawly/types";
import type { ConfirmShiftResult } from "@pawly/types";

export function useConfirmShift(month?: string) {
  const queryClient = useQueryClient();
  const t = useTranslations("dashboard.schedule.confirmation");

  const queryKey = QueryKeyFactory.mySchedule(month);

  const { mutate: confirmShift, isPending } = useServerActionMutation(
    confirmMyShiftAction,
    {
      onMutate: async ({ shiftId }: { shiftId: string }) => {
        // Capture key at mutation time to prevent stale closure (H1 fix)
        const snapshotKey = QueryKeyFactory.mySchedule(month);
        await queryClient.cancelQueries({ queryKey: snapshotKey });
        const previous = queryClient.getQueryData(snapshotKey);

        // Optimistically update isConfirmed in cache
        queryClient.setQueryData(snapshotKey, (old: unknown) => {
          const data = old as EmployeeScheduleData | undefined;
          if (!data) return old;
          return {
            ...data,
            shifts: data.shifts.map((s) =>
              s.id === shiftId ? { ...s, isConfirmed: true } : s,
            ),
          };
        });

        return { previous, snapshotKey };
      },
      onError: (
        _err: { message?: string },
        _vars: unknown,
        context: unknown,
      ) => {
        // Use snapshotKey from context to rollback correct cache entry (H1 fix)
        const ctx = context as
          | { previous?: unknown; snapshotKey?: unknown[] }
          | undefined;
        if (ctx?.previous && ctx.snapshotKey) {
          queryClient.setQueryData(ctx.snapshotKey, ctx.previous);
        }
        console.error("[useConfirmShift] Confirmation failed:", _err);
        toast.error(t("confirmError"));
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
      },
      onSuccess: (data: unknown) => {
        const result = data as ConfirmShiftResult | undefined;

        // Show a single toast — deviation info if notable, otherwise success (H5 fix)
        if (result && result.deltaMinutes !== 0) {
          const absMin = Math.abs(result.deltaMinutes);
          if (result.deltaMinutes > 0) {
            toast.info(t("lateArrival", { minutes: absMin }), {
              duration: 5000,
            });
          } else {
            toast.info(t("earlyArrival", { minutes: absMin }), {
              duration: 5000,
            });
          }
        } else {
          toast.success(t("confirmSuccess"));
        }

        // Haptic feedback if supported
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(50);
        }
      },
    },
  );

  return { confirmShift, isPending };
}
