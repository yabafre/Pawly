"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { PreCheckoutForm } from "./PreCheckoutForm";
import { Link } from "@/i18n/navigation";

const validPlans = ["starter", "professional"] as const;
type PlanKey = (typeof validPlans)[number];

const priceIds: Record<PlanKey, string | undefined> = {
  starter: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER,
  professional: process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL,
};

function isPlanKey(value: string | null): value is PlanKey {
  return value !== null && validPlans.includes(value as PlanKey);
}

export function PricingCheckout() {
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const t = useTranslations("landing.pricing");
  const tPage = useTranslations("pricing.page");

  const plan: PlanKey = isPlanKey(planParam) ? planParam : "professional";
  const priceId = priceIds[plan];
  const features: string[] = t.raw(`${plan}.features`) as string[];
  const isFree = t(`${plan}.price`) === "0";

  if (!priceId) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <p className="text-destructive font-medium">
          {tPage("missingPriceIdError")}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
      {/* Left: Plan summary */}
      <div className="border rounded-2xl p-8 bg-card">
        <h2 className="text-2xl font-bold mb-1">
          {t(`${plan}.name`)}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t(`${plan}.description`)}
        </p>

        <div className="flex items-baseline gap-1 mb-6">
          {isFree ? (
            <span className="text-4xl font-bold">
              {t(`${plan}.free`)}
            </span>
          ) : (
            <>
              <span className="text-sm text-muted-foreground">{t("currency")}</span>
              <span className="text-4xl font-bold">
                {t(`${plan}.price`)}
              </span>
              <span className="text-muted-foreground">{t("perMonth")}</span>
            </>
          )}
        </div>

        <ul className="space-y-3 mb-6">
          {features.map((feature, i) => (
            <li key={i} className="flex items-center gap-2.5">
              <Check className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>

        <Link
          href="/#pricing"
          className="text-sm text-primary hover:text-primary/80 transition-colors"
        >
          {tPage("changePlan")}
        </Link>
      </div>

      {/* Right: Form */}
      <div className="border rounded-2xl p-8 bg-card">
        <PreCheckoutForm priceId={priceId} />
      </div>
    </div>
  );
}
