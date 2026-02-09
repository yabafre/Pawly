import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { LandingHeader } from "./_components/LandingHeader";
import { HeroSection } from "./_components/HeroSection";
import { FeaturesSection } from "./_components/FeaturesSection";
import { PricingPreviewSection } from "./_components/PricingPreviewSection";
import { TestimonialsSection } from "./_components/TestimonialsSection";
import { CTASection } from "./_components/CTASection";
import { LandingFooter } from "./_components/LandingFooter";

type Props = {
  params: Promise<{ locale: string }>;
};

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pawly.com";

const PRICING = {
  LOW: "29",
  HIGH: "99",
  CURRENCY: "EUR",
} as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
      url: locale === "fr" ? baseUrl : `${baseUrl}/en`,
      siteName: "Pawly",
      locale: locale === "fr" ? "fr_FR" : "en_US",
      type: "website",
      images: [
        {
          url: `${baseUrl}/og-image.png`,
          width: 1200,
          height: 630,
          alt: "Pawly - Veterinary Practice Management",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: t("meta.title"),
      description: t("meta.description"),
      images: [`${baseUrl}/og-image.png`],
    },
    alternates: {
      canonical: locale === "fr" ? baseUrl : `${baseUrl}/en`,
      languages: {
        fr: baseUrl,
        en: `${baseUrl}/en`,
      },
    },
  };
}

export default async function LandingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Pawly",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: PRICING.CURRENCY,
      lowPrice: PRICING.LOW,
      highPrice: PRICING.HIGH,
    },
  };

  return (
    <>
      {/* Safe: jsonLd is a static object built from constants, no user input */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingHeader />
      <main id="main-content">
        <HeroSection />
        <FeaturesSection />
        <PricingPreviewSection />
        <TestimonialsSection />
        <CTASection />
      </main>
      <LandingFooter />
    </>
  );
}
