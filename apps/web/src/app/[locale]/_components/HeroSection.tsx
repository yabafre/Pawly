import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";

export async function HeroSection() {
  const t = await getTranslations("landing.hero");
  const trustBadges: string[] = t.raw("trustBadges") as string[];

  return (
    <section className="pt-32 pb-20 md:pt-48 md:pb-32 px-6 overflow-hidden relative">
      {/* Background blur orbs */}
      <div
        className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-primary/5 blur-[120px] rounded-full pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-[10%] right-[-5%] w-[500px] h-[500px] bg-orange-500/5 blur-[120px] rounded-full pointer-events-none"
        aria-hidden="true"
      />

      <div className="max-w-7xl mx-auto text-center relative z-10">
        {/* Announcement badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-neutral-200 shadow-sm mb-8">
          <Star className="h-3.5 w-3.5 text-orange-500 fill-orange-500" />
          <span className="text-xs font-bold text-foreground uppercase tracking-wide">
            {t("badge")}
          </span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-6 leading-[1.1]">
          {t("title")}
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          {t("subtitle")}
        </p>

        <div className="flex flex-col md:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            asChild
            className="w-full md:w-auto min-w-[200px] rounded-xl text-base h-12"
          >
            <Link href="/pricing">{t("cta")}</Link>
          </Button>
          <Button
            variant="outline"
            size="lg"
            asChild
            className="w-full md:w-auto min-w-[200px] rounded-xl text-base h-12"
          >
            <a href="#features">{t("secondaryCta")}</a>
          </Button>
        </div>

        {/* Trust badges */}
        <div className="mt-16 pt-8 border-t border-neutral-100 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 opacity-60 hover:opacity-100 transition-all duration-500">
          <span className="text-sm font-bold text-muted-foreground">
            {t("trustTitle")}
          </span>
          <div className="flex gap-8 items-center">
            {trustBadges.map((badge) => (
              <span key={badge} className="font-bold text-xl text-foreground">
                {badge}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
