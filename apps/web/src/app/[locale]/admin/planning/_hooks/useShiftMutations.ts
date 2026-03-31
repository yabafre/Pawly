"use client";

import {
  QueryKeyFactory,
  useServerActionMutation,
} from "@/lib/hooks/server-action-hooks";
import {
  moveShiftAction,
  createManualShiftAction,
  deleteShiftAction,
} from "../_actions/shift-mutation-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export const useShiftMutations = (month?: string) => {
  const queryClient = useQueryClient();
  const t = useTranslations("admin.dragDrop");

  const invalidateSchedule = () => {
    queryClient.invalidateQueries({
      queryKey: QueryKeyFactory.planningScheduleView(month),
    });
    queryClient.invalidateQueries({
      queryKey: QueryKeyFactory.planningShifts(month),
    });
    queryClient.invalidateQueries({
      queryKey: ["planning", "equity-counters"],
    });
  };

  const { mutate: moveShift, isPending: isMoving } =
    useServerActionMutation(moveShiftAction, {
      onMutate: async () => {
        // Cancel in-flight queries for this month to avoid overwriting rollback snapshot
        await queryClient.cancelQueries({ queryKey: QueryKeyFactory.planningScheduleView(month) });
        // Snapshot previous data for rollback
        const previous = queryClient.getQueryData(QueryKeyFactory.planningScheduleView(month));
        return { previous };
      },
      onSuccess: () => {
        toast.success(t("moveSuccess"));
      },
      onError: (_err: { message?: string }, _vars: unknown, context: unknown) => {
        // Rollback on error
        const ctx = context as { previous?: unknown } | undefined;
        if (ctx?.previous) {
          queryClient.setQueryData(QueryKeyFactory.planningScheduleView(month), ctx.previous);
        }
        toast.error(t("moveError"), { description: _err?.message });
      },
      onSettled: () => {
        invalidateSchedule();
      },
    });

  const { mutate: createManualShift, isPending: isCreating } =
    useServerActionMutation(createManualShiftAction, {
      onSuccess: () => {
        invalidateSchedule();
        toast.success(t("createSuccess"));
      },
      onError: (err: { message?: string }) => {
        toast.error(t("createError"), { description: err?.message });
      },
    });

  const { mutate: deleteShift, isPending: isDeleting } =
    useServerActionMutation(deleteShiftAction, {
      onSuccess: () => {
        invalidateSchedule();
        toast.success(t("deleteSuccess"));
      },
      onError: (err: { message?: string }) => {
        toast.error(t("deleteError"), { description: err?.message });
      },
    });

  return {
    moveShift,
    isMoving,
    createManualShift,
    isCreating,
    deleteShift,
    isDeleting,
    invalidateSchedule,
  };
};
