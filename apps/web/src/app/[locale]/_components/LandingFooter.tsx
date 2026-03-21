import { getTranslations } from "next-intl/server";
import { PawlyLogo } from "@/components/pawly-logo";
import { LanguageSwitcher } from "@/components/language-switcher";

export async function LandingFooter() {
  const t = await getTranslations("landing.footer");

  return (
    <footer className="py-8 px-6 border-t">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <PawlyLogo />
        <div className="flex items-center gap-6">
          <LanguageSwitcher />
          <p className="text-xs text-muted-foreground">
            {t("copyright")}
          </p>
        </div>
      </div>
    </footer>
  );
}
