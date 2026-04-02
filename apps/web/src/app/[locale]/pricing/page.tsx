import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { LandingHeader } from "@/app/[locale]/_components/LandingHeader";
import { LandingFooter } from "@/app/[locale]/_components/LandingFooter";
import { PricingCheckout } from "./_components/PricingCheckout";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ locale: string }>;
};

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pawly.com";

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
      url: locale === "fr" ? `${baseUrl}/pricing` : `${baseUrl}/en/pricing`,
      siteName: "Pawly",
      locale: locale === "fr" ? "fr_FR" : "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
    },
    alternates: {
      canonical: locale === "fr" ? `${baseUrl}/pricing` : `${baseUrl}/en/pricing`,
      languages: {
        fr: `${baseUrl}/pricing`,
        en: `${baseUrl}/en/pricing`,
      },
    },
  };
}

export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pricing.page");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Pawly",
        item: baseUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: t("heading"),
        item: locale === "fr" ? `${baseUrl}/pricing` : `${baseUrl}/en/pricing`,
      },
    ],
  };

  return (
    <>
      {/* Safe: jsonLd is a static object built from constants, no user input */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingHeader />
      <main id="main-content" className="min-h-screen bg-background pt-24 pb-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight mb-3">
              {t("heading")}
            </h1>
            <p className="text-muted-foreground">
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
