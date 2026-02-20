import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export async function CTASection() {
  const t = await getTranslations("landing.cta");

  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="bg-primary rounded-3xl px-6 py-16 sm:px-12 sm:py-20 text-center relative overflow-hidden">
          {/* Decorative blur */}
          <div
            className="absolute top-[-20%] right-[-10%] w-[400px] h-[400px] bg-white/5 blur-[100px] rounded-full pointer-events-none"
            aria-hidden="true"
          />

          <h2 className="relative text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-primary-foreground leading-tight">
            {t("title")}
          </h2>
          <p className="relative mt-4 text-lg text-primary-foreground/80 leading-relaxed max-w-xl mx-auto">
            {t("subtitle")}
          </p>
          <div className="relative mt-8">
            <Button
              size="lg"
              asChild
              className="bg-white text-primary hover:bg-white/90 rounded-xl text-base h-12 min-w-[220px] font-semibold"
            >
              <Link href="/pricing">{t("button")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
