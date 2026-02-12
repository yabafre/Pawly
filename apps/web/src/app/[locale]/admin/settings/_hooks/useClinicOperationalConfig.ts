"use client";

import {
  QueryKeyFactory,
  useServerActionMutation,
  useServerActionQuery,
} from "@/lib/hooks/server-action-hooks";
import {
  getClinicOperationalConfigAction,
  updateClinicOperationalConfigAction,
} from "../_actions/clinic-operational-config-actions";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export const useClinicOperationalConfig = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.operationalConfig.toast");
  const queryKey = QueryKeyFactory.clinicOperationalConfig();

  const { data, isPending, isLoading, isFetching, error } = useServerActionQuery(
    getClinicOperationalConfigAction,
    {
      input: undefined,
      queryKey,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnReconnect: true,
    },
  );

  const { mutate: updateOperationalConfig, isPending: isUpdating } =
    useServerActionMutation(updateClinicOperationalConfigAction, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
        queryClient.invalidateQueries({ queryKey: QueryKeyFactory.clinic() });
        queryClient.invalidateQueries({ queryKey: QueryKeyFactory.planning() });
        toast.success(t("updated"));
      },
    });

  return {
    config: data,
    isPending: isPending || isLoading,
    isFetching,
    error,
    updateOperationalConfig,
    isUpdating,
  };
};
