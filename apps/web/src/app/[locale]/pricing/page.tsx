import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { LandingHeader } from "@/app/[locale]/_components/LandingHeader";
import { LandingFooter } from "@/app/[locale]/_components/LandingFooter";
import { PricingCheckout } from "./_components/PricingCheckout";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing.meta" });
  return {
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: t("title"),
      description: t("description"),
      type: "website",
    },
    twitter: {
      card: "summary",
      title: t("title"),
      description: t("description"),
    },
  };
}

export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pricing.page");

  return (
    <>
      <LandingHeader />
      <main id="main-content" className="min-h-screen bg-[#FDFDFD] pt-24 pb-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-8">
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-4 leading-tight">
              {t("heading")}
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {t("subtitle")}
            </p>
          </div>

          <Suspense>
            <PricingCheckout />
          </Suspense>
        </div>
      </main>
      <LandingFooter />
    </>
  );
}
