import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const plans = ["starter", "professional"] as const;

export async function PricingPreviewSection() {
  const t = await getTranslations("landing.pricing");

  return (
    <section id="pricing" className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
            {t("badge")}
          </p>
          <h2 className="text-3xl lg:text-4xl font-bold tracking-tight">
            {t("title")}
          </h2>
          <p className="text-muted-foreground mt-3 text-sm">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {plans.map((plan) => {
            const isPopular = plan === "professional";
            const features: string[] = t.raw(`${plan}.features`) as string[];

            return (
              <div
                key={plan}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-6 transition-shadow",
                  isPopular
                    ? "border-primary shadow-md bg-card"
                    : "bg-card hover:shadow-md"
                )}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-primary text-white text-[11px] font-semibold">
                    <Sparkles className="h-3 w-3" />
                    {t(`${plan}.popular`)}
                  </div>
                )}

                <h3 className="text-sm font-semibold mb-1">
                  {t(`${plan}.name`)}
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  {t(`${plan}.description`)}
                </p>

                <div className="flex items-end gap-0.5 mb-6">
                  {t(`${plan}.price`) === "0" ? (
                    <span className="text-4xl font-bold tracking-tighter">
                      {t(`${plan}.free`)}
                    </span>
                  ) : (
                    <>
                      <span className="text-sm text-muted-foreground">{t("currency")}</span>
                      <span className="text-4xl font-bold tracking-tighter">
                        {t(`${plan}.price`)}
                      </span>
                      <span className="text-sm text-muted-foreground mb-1">{t("perMonth")}</span>
                    </>
                  )}
                </div>

                <ul className="space-y-2.5 mb-6 flex-1">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  variant={isPopular ? "default" : "outline"}
                  className="w-full"
                >
                  <Link href={`/pricing/register?plan=${plan}`}>{t("cta")}</Link>
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
