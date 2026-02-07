"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useServerActionQuery, useServerActionMutation } from "@/lib/hooks/server-action-hooks";
import {
  getBillingOverviewAction,
  createBillingPortalSessionAction,
} from "../_actions/billing-actions";

export const useBilling = (locale: string) => {
  const t = useTranslations("billing");

  const {
    data: billingData,
    isLoading,
    isError,
    error,
  } = useServerActionQuery(getBillingOverviewAction, {
    input: undefined,
    queryKey: ["billing"],
  });

  const portalMutation = useServerActionMutation(
    createBillingPortalSessionAction,
    {
      onError: () => {
        toast.error(t("errors.portalFailed"));
      },
    },
  );

  const openBillingPortal = async () => {
    const returnUrl = `${window.location.origin}/${locale}/admin/billing`;
    const [result, err] = await portalMutation.mutateAsync({
      returnUrl,
      locale: locale as "fr" | "en",
    });

    if (!err && result?.url) {
      window.location.href = result.url;
    }
  };

  return {
    subscription: billingData?.subscription ?? null,
    invoices: billingData?.invoices ?? [],
    isLoading,
    isError,
    error,
    errorMessage: isError ? t("errors.loadFailed") : null,
    openBillingPortal,
    isPortalPending: portalMutation.isPending,
  };
};
