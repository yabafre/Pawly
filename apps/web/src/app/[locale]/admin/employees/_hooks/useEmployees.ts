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
  const { data, isPending, isFetching, error } = useServerActionQuery(listEmployeesAction, {
    input: filters ?? {},
    queryKey: [...QueryKeyFactory.employees(), filters ?? {}] as unknown as readonly ["employees"],
    placeholderData: (prev: unknown) => prev, // keep previous data while refetching — prevents UI unmount
  });
  return { employees: data ?? [], isPending, isFetching, error };
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
      onSuccess: (employee?: { isActive: boolean }) => {
        queryClient.invalidateQueries({ queryKey: QueryKeyFactory.employees() });
        toast.success(employee?.isActive ? t("activated") : t("deactivated"));
      },
    },
  );
  return { toggleActive: mutate, isPending, error };
};
