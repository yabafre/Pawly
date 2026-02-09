import { getTranslations } from "next-intl/server";
import {
  Calendar,
  Users,
  CreditCard,
  Smartphone,
  Globe,
  Shield,
} from "lucide-react";

const featureConfig = {
  scheduling: { icon: Calendar, color: "text-indigo-600", bg: "bg-indigo-50" },
  team: { icon: Users, color: "text-orange-500", bg: "bg-orange-50" },
  billing: { icon: CreditCard, color: "text-primary", bg: "bg-primary/10" },
  mobile: { icon: Smartphone, color: "text-blue-600", bg: "bg-blue-50" },
  i18n: { icon: Globe, color: "text-purple-600", bg: "bg-purple-50" },
  security: { icon: Shield, color: "text-rose-600", bg: "bg-rose-50" },
} as const;

const featureKeys = Object.keys(featureConfig) as (keyof typeof featureConfig)[];

export async function FeaturesSection() {
  const t = await getTranslations("landing.features");

  return (
    <section id="features" className="py-24 bg-neutral-50">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {featureKeys.map((key) => {
            const { icon: Icon, color, bg } = featureConfig[key];
            return (
              <div
                key={key}
                className="bg-white p-8 rounded-3xl border border-neutral-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
              >
                <div
                  className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}
                >
                  <Icon className={`w-7 h-7 ${color}`} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3">
                  {t(`${key}.title`)}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {t(`${key}.description`)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
