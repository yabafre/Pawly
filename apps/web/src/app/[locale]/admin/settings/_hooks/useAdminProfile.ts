"use client";

import {
  useServerActionQuery,
  QueryKeyFactory,
  useServerActionMutation,
} from "@/lib/hooks/server-action-hooks";
import {
  changePasswordAction,
  updateAdminProfileAction,
  getClinicProfileAction,
  getAdminMeAction,
} from "../_actions/settings-actions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export const useAdminMe = () => {
  const { data, isPending, error } = useServerActionQuery(getAdminMeAction, {
    input: undefined,
    queryKey: QueryKeyFactory.adminMe(),
  });
  return { me: data ?? null, isPending, error };
};

export const useClinicProfile = () => {
  const { data, isPending, error } = useServerActionQuery(
    getClinicProfileAction,
    {
      input: undefined,
      queryKey: QueryKeyFactory.clinicProfile(),
    },
  );
  return { clinic: data ?? null, isPending, error };
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.account");

  const { mutate, isPending } = useServerActionMutation(
    updateAdminProfileAction,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QueryKeyFactory.adminMe() });
        toast.success(t("saved"));
      },
      onError: () => toast.error(t("saveError")),
    },
  );

  return { updateProfile: mutate, isPending };
};

export const useChangePassword = () => {
  const t = useTranslations("settings.account");

  const { mutate, isPending, error } = useServerActionMutation(
    changePasswordAction,
    {
      onSuccess: () => toast.success(t("passwordChanged")),
    },
  );

  return { changePassword: mutate, isPending, error };
};
