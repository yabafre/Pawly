"use client";

import {
  QueryKeyFactory,
  useServerActionMutation,
  useServerActionQuery,
} from "@/lib/hooks/server-action-hooks";
import {
  createEmployeeConstraintAction,
  deleteEmployeeConstraintAction,
  listEmployeeConstraintsAction,
  updateEmployeeConstraintAction,
} from "../_actions/employee-constraint-actions";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const useEmployeeConstraints = (employeeId: string) => {
  const queryClient = useQueryClient();
  const t = useTranslations("employees.constraints.toast");
  const queryKey = QueryKeyFactory.employeeConstraints(employeeId);

  const { data, isPending, error } = useServerActionQuery(
    listEmployeeConstraintsAction,
    {
      input: { employeeId },
      queryKey,
      enabled: !!employeeId,
    },
  );

  const { mutate: createConstraint, isPending: isCreating } = useServerActionMutation(
    createEmployeeConstraintAction,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
        toast.success(t("created"));
      },
    },
  );

  const { mutate: updateConstraint, isPending: isUpdating } = useServerActionMutation(
    updateEmployeeConstraintAction,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
        toast.success(t("updated"));
      },
    },
  );

  const { mutate: deleteConstraint, isPending: isDeleting } = useServerActionMutation(
    deleteEmployeeConstraintAction,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
        toast.success(t("deleted"));
      },
    },
  );

  return {
    constraints: (data ?? []) as Array<{
      id: string;
      type: "SCHOOL" | "VACATION" | "SICK" | "OTHER";
      startDate: string | Date;
      endDate: string | Date;
      reason: string | null;
      daysOfWeek: number[];
    }>,
    isPending,
    error,
    createConstraint,
    updateConstraint,
    deleteConstraint,
    isCreating,
    isUpdating,
    isDeleting,
  };
};
