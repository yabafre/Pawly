"use client";

import { useServerActionMutation } from "@/lib/hooks/server-action-hooks";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { registerAction } from "../_actions/register-actions";
import { createUpgradeSessionAction } from "@/app/[locale]/admin/billing/_actions/billing-actions";
import { useState } from "react";

const PRO_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL ?? "";

const ERROR_KEYS = [
  "EMAIL_ALREADY_EXISTS", "TURNSTILE_FAILED", "serverError",
] as const;

export function useRegister(selectedPlan: "starter" | "professional") {
  const router = useRouter();
  const locale = useLocale() as "fr" | "en";
  const tErrors = useTranslations("auth.errors");
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { mutate: register, isPending: isRegistering } = useServerActionMutation(registerAction, {
    onSuccess: async () => {
      setServerError(null);
      if (selectedPlan === "professional") {
        setIsRedirecting(true);
        try {
          const [result, err] = await createUpgradeSessionAction({
            priceId: PRO_PRICE_ID,
            locale,
            successPath: "/admin/onboarding?plan=professional",
          });

          if (err || !result?.url) {
            toast.error("Failed to create checkout session");
            setIsRedirecting(false);
            router.push(`/${locale}/admin/onboarding?plan=starter`);
            return;
          }

          window.location.href = result.url;
        } catch {
          setIsRedirecting(false);
          router.push(`/${locale}/admin/onboarding?plan=starter`);
        }
      } else {
        router.push(`/${locale}/admin/onboarding?plan=starter`);
      }
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : "";
      const matched = ERROR_KEYS.find((k) => msg.includes(k));
      const translated = matched ? tErrors(matched) : tErrors("generic");
      setServerError(translated);
      toast.error(translated);
    },
  });

  return { register, isPending: isRegistering || isRedirecting, serverError, clearServerError: () => setServerError(null) };
}
