import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { FallingAnimals } from "@/components/ui/falling-animals";

export async function HeroSection() {
  const t = await getTranslations("landing.hero");

  return (
    <section className="relative overflow-hidden min-h-[calc(100dvh-3.5rem)] flex items-center">
      <FallingAnimals
        color="#009588"
        speed={0.8}
        size={14}
        gap={48}
        className="absolute inset-0 h-full w-full [mask-image:radial-gradient(ellipse_at_center,transparent_30%,black_70%)]"
      />
      <div className="relative z-10 max-w-4xl mx-auto px-6 pt-28 pb-24 text-center">
        <p className="text-xs font-mono mb-6 inline-block text-muted-foreground">
          {t("badge")}
        </p>

        <h1 className="text-5xl lg:text-7xl font-bold tracking-tighter leading-[1.08] mb-5">
          {t("titleLine1")}
          <br />
          <span className="text-muted-foreground">{t("titleLine2")}</span>
        </h1>

        <p className="text-base lg:text-lg text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
          {t("subtitle")}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button size="lg" asChild className="gap-2">
            <Link href="/pricing?plan=starter">
              {t("cta")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <a href="#pricing">{t("secondaryCta")}</a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          {t("trialNote")}
        </p>
      </div>
    </section>
  );
}
