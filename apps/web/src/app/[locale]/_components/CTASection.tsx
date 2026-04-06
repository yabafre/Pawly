import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export async function CTASection() {
  const t = await getTranslations("landing.cta");

  return (
    <section className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="rounded-2xl border bg-primary/[0.03] px-6 py-16 sm:px-12 sm:py-20 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">
            {t("title")}
          </h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
            {t("subtitle")}
          </p>
          <Button size="lg" asChild className="gap-2">
            <Link href="/pricing/register?plan=starter">
              {t("button")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
