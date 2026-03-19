import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PawlyLogo } from "@/components/pawly-logo";
import { LanguageSwitcher } from "@/components/language-switcher";

export async function LandingFooter() {
  const t = await getTranslations("landing.footer");

  return (
    <footer className="bg-[#171717] text-white py-20 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-12">
        {/* Brand */}
        <div className="col-span-2 md:col-span-1">
          <div className="mb-6">
            <PawlyLogo theme="dark" />
          </div>
          <p className="text-neutral-400 text-sm leading-relaxed">
            {t("description")}
          </p>
        </div>

        {/* Product */}
        <div>
          <h3 className="font-bold text-white mb-4">{t("product")}</h3>
          <ul className="space-y-2">
            <li>
              <Link
                href="/#features"
                className="text-sm text-neutral-400 hover:text-primary transition-colors"
              >
                {t("features")}
              </Link>
            </li>
            <li>
              <Link
                href="/pricing"
                className="text-sm text-neutral-400 hover:text-primary transition-colors"
              >
                {t("pricing")}
              </Link>
            </li>
          </ul>
        </div>

        {/* Company */}
        <div>
          <h3 className="font-bold text-white mb-4">{t("company")}</h3>
          <ul className="space-y-2">
            <li>
              <span className="text-sm text-neutral-500 cursor-default" aria-label={t("about")}>
                {t("about")}
              </span>
            </li>
            <li>
              <a
                href="mailto:contact@pawly.app"
                className="text-sm text-neutral-400 hover:text-primary transition-colors"
              >
                {t("contact")}
              </a>
            </li>
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h3 className="font-bold text-white mb-4">{t("legal")}</h3>
          <ul className="space-y-2">
            <li>
              <span className="text-sm text-neutral-500 cursor-default" aria-label={t("privacy")}>
                {t("privacy")}
              </span>
            </li>
            <li>
              <span className="text-sm text-neutral-500 cursor-default" aria-label={t("terms")}>
                {t("terms")}
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="max-w-7xl mx-auto px-6 mt-16 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-neutral-500">{t("copyright")}</p>
        <LanguageSwitcher />
      </div>
    </footer>
  );
}
