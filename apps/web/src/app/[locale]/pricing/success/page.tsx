import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle, Mail } from "lucide-react";
import { LandingHeader } from "@/app/[locale]/_components/LandingHeader";
import { LandingFooter } from "@/app/[locale]/_components/LandingFooter";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing.success" });
  return {
    title: t("title"),
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutSuccessPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pricing.success");

  return (
    <>
      <LandingHeader />
      <main
        id="main-content"
        className="min-h-screen flex items-center justify-center bg-[#FDFDFD] px-4 pt-20"
      >
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-[#009588]" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-neutral-900">
              {t("title")}
            </h1>
            <p className="text-neutral-600">{t("description")}</p>
          </div>

          <div className="bg-white border border-neutral-200 rounded-3xl p-6 space-y-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
              <Mail className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-neutral-900">
                {t("checkEmail")}
              </p>
              <p className="text-sm text-neutral-500">
                {t("checkEmailDescription")}
              </p>
            </div>
          </div>

          <p className="text-xs text-neutral-400">{t("spamNote")}</p>

          <Button variant="outline" asChild className="rounded-xl">
            <Link href="/">
              {t("backToHome")}
            </Link>
          </Button>
        </div>
      </main>
      <LandingFooter />
    </>
  );
}
