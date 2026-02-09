import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PawlyLogo } from "@/components/pawly-logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";

export async function LandingHeader() {
  const t = await getTranslations("landing.header");

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
      <header className="fixed top-0 z-40 w-full bg-white/80 backdrop-blur-xl border-b border-neutral-100">
        <nav className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" aria-label="Pawly Home">
            <PawlyLogo />
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              {t("navFeatures")}
            </a>
            <a
              href="#pricing"
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              {t("navPricing")}
            </a>
          </div>

          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="hidden sm:inline-flex font-bold"
            >
              <Link href="/login">{t("login")}</Link>
            </Button>
            <Button size="sm" asChild className="hidden md:inline-flex">
              <Link href="/pricing">{t("cta")}</Link>
            </Button>
          </div>
        </nav>
      </header>
    </>
  );
}
