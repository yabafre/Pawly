"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { PreCheckoutForm } from "./PreCheckoutForm";
import { Link } from "@/i18n/navigation";

const validPlans = ["starter", "professional", "enterprise"] as const;
type PlanKey = (typeof validPlans)[number];

const priceIds: Record<PlanKey, string | undefined> = {
  starter: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER,
  professional: process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL,
  enterprise: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE,
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

  if (!priceId) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <p className="text-red-600 font-medium">
          {tPage("missingPriceIdError")}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Plan summary card */}
      <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-[0_8px_30px_rgba(0,0,0,0.04)] mb-8">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-foreground">
            {t(`${plan}.name`)}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t(`${plan}.description`)}
          </p>
        </div>

        <div className="text-center my-6">
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-4xl font-bold text-foreground">
              {t(`${plan}.price`)}
              {t("currency")}
            </span>
            <span className="text-muted-foreground">{t("perMonth")}</span>
          </div>
        </div>

        <ul className="space-y-3 mb-6">
          {features.map((feature, i) => (
            <li key={i} className="flex items-center gap-3">
              <Check className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>

        <div className="text-center">
          <Link
            href="/#pricing"
            className="text-sm text-[#009588] hover:text-[#00796B] transition-colors"
          >
            {tPage("changePlan")}
          </Link>
        </div>
      </div>

      {/* Pre-checkout form */}
      <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <PreCheckoutForm priceId={priceId} />
      </div>
    </div>
  );
}
