import { getTranslations } from "next-intl/server";
import {
  Calendar,
  Users,
  CreditCard,
  Smartphone,
  Globe,
  Shield,
} from "lucide-react";
import { BentoItem } from "./_BentoItem";

const featureConfig = {
  scheduling: { icon: Calendar, color: "text-indigo-600", bg: "bg-indigo-50", grid: "sm:col-span-2 lg:col-span-2 lg:row-span-2" },
  team: { icon: Users, color: "text-orange-600", bg: "bg-orange-50", grid: "lg:row-span-2" },
  billing: { icon: CreditCard, color: "text-primary", bg: "bg-primary/10", grid: "" },
  mobile: { icon: Smartphone, color: "text-blue-600", bg: "bg-blue-50", grid: "" },
  i18n: { icon: Globe, color: "text-purple-600", bg: "bg-purple-50", grid: "sm:col-span-2 lg:col-span-2" },
  security: { icon: Shield, color: "text-rose-600", bg: "bg-rose-50", grid: "" },
} as const;

const featureKeys = Object.keys(featureConfig) as (keyof typeof featureConfig)[];

export async function FeaturesSection() {
  const t = await getTranslations("landing.features");

  return (
    <section id="features" className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
            {t("badge")}
          </p>
          <h2 className="text-3xl lg:text-4xl font-bold tracking-tight">
            {t("title")}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-min">
          {featureKeys.map((key) => {
            const { icon: Icon, color, bg, grid } = featureConfig[key];
            const isBig = key === "scheduling";

            return (
              <BentoItem key={key} className={grid}>
                <div
                  className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center mb-4`}
                >
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <h3
                  className={`font-semibold mb-2 ${isBig ? "text-xl" : "text-base"}`}
                >
                  {t(`${key}.title`)}
                </h3>
                <p
                  className={`text-muted-foreground leading-relaxed ${isBig ? "text-base" : "text-sm"}`}
                >
                  {t(`${key}.description`)}
                </p>
              </BentoItem>
            );
          })}
        </div>
      </div>
    </section>
  );
}
