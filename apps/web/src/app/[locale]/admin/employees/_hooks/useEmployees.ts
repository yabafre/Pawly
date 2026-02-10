"use client";

import {
  useServerActionQuery,
  useServerActionMutation,
  QueryKeyFactory,
} from "@/lib/hooks/server-action-hooks";
import {
  listEmployeesAction,
  getEmployeeAction,
  createEmployeeAction,
  updateEmployeeAction,
  toggleEmployeeActiveAction,
} from "../_actions/employee-actions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { ListEmployeesInput } from "@pawly/validators";

export const useEmployees = (filters?: ListEmployeesInput) => {
  const { data, isPending, error } = useServerActionQuery(listEmployeesAction, {
    input: filters ?? {},
    queryKey: QueryKeyFactory.employees(),
  });
  return { employees: data ?? [], isPending, error };
};

export const useEmployee = (id: string) => {
  const { data, isPending, error } = useServerActionQuery(getEmployeeAction, {
    input: { id },
    queryKey: QueryKeyFactory.employees(),
  });
  return { employee: data, isPending, error };
};

export const useCreateEmployee = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("employees.toast");
  const { mutate, isPending, error } = useServerActionMutation(
    createEmployeeAction,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QueryKeyFactory.employees() });
        toast.success(t("created"));
      },
    },
  );
  return { createEmployee: mutate, isPending, error };
};

export const useUpdateEmployee = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("employees.toast");
  const { mutate, isPending, error } = useServerActionMutation(
    updateEmployeeAction,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QueryKeyFactory.employees() });
        toast.success(t("updated"));
      },
    },
  );
  return { updateEmployee: mutate, isPending, error };
};

export const useToggleEmployeeActive = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("employees.toast");
  const { mutate, isPending, error } = useServerActionMutation(
    toggleEmployeeActiveAction,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QueryKeyFactory.employees() });
        toast.success(t("deactivated"));
      },
    },
  );
  return { toggleActive: mutate, isPending, error };
};
