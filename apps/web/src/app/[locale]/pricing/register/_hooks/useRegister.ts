"use client";

import { useServerActionMutation } from "@/lib/hooks/server-action-hooks";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { registerAction } from "../_actions/register-actions";
import { createUpgradeSessionAction } from "@/app/[locale]/admin/billing/_actions/billing-actions";
import { useState } from "react";

const PRO_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL ?? "";

export function useRegister(selectedPlan: "starter" | "professional") {
  const router = useRouter();
  const locale = useLocale() as "fr" | "en";
  const [isRedirecting, setIsRedirecting] = useState(false);

  const { mutate: register, isPending: isRegistering } = useServerActionMutation(registerAction, {
    onSuccess: async () => {
      if (selectedPlan === "professional") {
        // Pro: redirect to Stripe Checkout, success → onboarding
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
            // Fallback: go to onboarding anyway (they can upgrade later)
            router.push(`/${locale}/admin/onboarding?plan=starter`);
            return;
          }

          window.location.href = result.url;
        } catch {
          setIsRedirecting(false);
          router.push(`/${locale}/admin/onboarding?plan=starter`);
        }
      } else {
        // Starter: go directly to onboarding
        router.push(`/${locale}/admin/onboarding?plan=starter`);
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Registration failed";
      toast.error(message);
    },
  });

  return { register, isPending: isRegistering || isRedirecting };
}
