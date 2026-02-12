"use client";

import {
  useServerActionQuery,
  useServerActionMutation,
  QueryKeyFactory,
} from "@/lib/hooks/server-action-hooks";
import {
  declareSchoolDaysAction,
  listSchoolDaysAction,
} from "../_actions/school-days-actions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export const useSchoolDays = (employeeId: string, month: string) => {
  const { data, isPending, isFetching, error } = useServerActionQuery(
    listSchoolDaysAction,
    {
      input: { employeeId, month },
      queryKey: QueryKeyFactory.schoolDays(month),
      placeholderData: (prev) => prev,
    },
  );
  return { schoolDays: data ?? [], isPending, isFetching, error };
};

export const useDeclareSchoolDays = (month: string) => {
  const queryClient = useQueryClient();
  const t = useTranslations("dashboard.schoolDays.toast");
  const { mutate, isPending, error } = useServerActionMutation(
    declareSchoolDaysAction,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: QueryKeyFactory.schoolDays(month),
        });
        toast.success(t("declared"));
      },
      onError: () => {
        toast.error(t("error"));
      },
    },
  );
  return { declareSchoolDays: mutate, isPending, error };
};
