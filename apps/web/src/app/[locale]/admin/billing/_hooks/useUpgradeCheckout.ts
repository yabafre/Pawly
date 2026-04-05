"use client";

import { useServerActionMutation } from "@/lib/hooks/server-action-hooks";
import { createUpgradeSessionAction } from "../_actions/billing-actions";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

const PRO_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL ?? "";

export function useUpgradeCheckout(locale: string) {
  const t = useTranslations("billing");

  const mutation = useServerActionMutation(createUpgradeSessionAction, {
    returnError: true,
  });

  const upgrade = async () => {
    const [result, err] = await mutation.mutateAsync({
      priceId: PRO_PRICE_ID,
      locale: locale as "fr" | "en",
    });

    if (err) {
      toast.error(t("errors.upgradeFailed"));
      return;
    }

    if (result?.url) {
      window.location.href = result.url;
    }
  };

  return { upgrade, isPending: mutation.isPending };
}
