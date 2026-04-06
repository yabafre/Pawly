import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PawlyLogo } from "@/components/pawly-logo";
import { LanguageSwitcher } from "@/components/language-switcher";

export async function LandingFooter() {
  const t = await getTranslations("landing.footer");

  return (
    <footer className="py-10 px-6 border-t">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-8">
          <div className="space-y-3">
            <PawlyLogo />
            <p className="text-xs text-muted-foreground max-w-xs">
              {t("tagline")}
            </p>
          </div>

          <nav className="flex gap-8" aria-label="Footer navigation">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground">{t("product")}</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">{t("features")}</a></li>
                <li><Link href="/pricing" className="hover:text-foreground transition-colors">{t("pricing")}</Link></li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground">{t("legal")}</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li><Link href="/privacy" className="hover:text-foreground transition-colors">{t("privacy")}</Link></li>
                <li><Link href="/terms" className="hover:text-foreground transition-colors">{t("terms")}</Link></li>
              </ul>
            </div>
          </nav>

          <LanguageSwitcher />
        </div>

        <div className="mt-8 pt-6 border-t border-border/40 text-center">
          <p className="text-xs text-muted-foreground">{t("copyright")}</p>
        </div>
      </div>
    </footer>
  );
}
