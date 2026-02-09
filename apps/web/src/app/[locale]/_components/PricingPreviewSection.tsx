import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const plans = ["starter", "professional", "enterprise"] as const;

export async function PricingPreviewSection() {
  const t = await getTranslations("landing.pricing");

  return (
    <section id="pricing" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section heading with badge */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-block px-3 py-1 mb-4 text-xs font-bold tracking-widest text-primary uppercase bg-secondary rounded-full">
            {t("badge")}
          </span>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-4 leading-tight">
            {t("title")}
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {plans.map((plan) => {
            const isPopular = plan === "professional";
            const features: string[] = t.raw(`${plan}.features`) as string[];

            return (
              <div
                key={plan}
                className={`relative p-8 rounded-3xl border transition-all duration-300 ${
                  isPopular
                    ? "border-primary shadow-[0_20px_40px_-10px_rgba(0,149,136,0.15)] bg-white scale-105 z-10"
                    : "border-neutral-200 bg-white hover:border-neutral-300"
                }`}
              >
                {isPopular && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg">
                    {t("professional.popular")}
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-foreground">
                    {t(`${plan}.name`)}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 h-10">
                    {t(`${plan}.description`)}
                  </p>
                </div>

                <div className="my-8">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-foreground">
                      {t(`${plan}.price`)}
                      {t("currency")}
                    </span>
                    <span className="text-muted-foreground">
                      {t("perMonth")}
                    </span>
                  </div>
                </div>

                <ul className="space-y-4 mb-8">
                  {features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm text-muted-foreground">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={isPopular ? "default" : "outline"}
                  size="lg"
                  asChild
                  className="w-full rounded-xl"
                >
                  <Link href="/pricing">{t("cta")}</Link>
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
