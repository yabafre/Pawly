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
  scheduling: { icon: Calendar, color: "text-indigo-600", bg: "bg-indigo-50" },
  team: { icon: Users, color: "text-orange-600", bg: "bg-orange-50" },
  billing: { icon: CreditCard, color: "text-primary", bg: "bg-primary/10" },
  mobile: { icon: Smartphone, color: "text-blue-600", bg: "bg-blue-50" },
  i18n: { icon: Globe, color: "text-purple-600", bg: "bg-purple-50" },
  security: { icon: Shield, color: "text-rose-600", bg: "bg-rose-50" },
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

        {/* Bento grid: 2 large on top, 4 small below */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {featureKeys.map((key) => {
            const { icon: Icon, color, bg } = featureConfig[key];
            const isLarge = key === "scheduling" || key === "team";

            return (
              <BentoItem
                key={key}
                className={isLarge ? "sm:col-span-2" : ""}
              >
                <div
                  className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center mb-4`}
                >
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <h3
                  className={`font-semibold mb-2 ${isLarge ? "text-xl" : "text-base"}`}
                >
                  {t(`${key}.title`)}
                </h3>
                <p
                  className={`text-muted-foreground leading-relaxed ${isLarge ? "text-base" : "text-sm"}`}
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
