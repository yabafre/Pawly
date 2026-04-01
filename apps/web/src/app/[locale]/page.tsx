import { getTranslations, setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LandingHeader } from "./_components/LandingHeader";
import { HeroSection } from "./_components/HeroSection";
import { FeaturesSection } from "./_components/FeaturesSection";
import { PricingPreviewSection } from "./_components/PricingPreviewSection";
import { TestimonialsSection } from "./_components/TestimonialsSection";
import { CTASection } from "./_components/CTASection";
import { LandingFooter } from "./_components/LandingFooter";
import { IntegrationsSection } from "./_components/IntegrationsSection";

type Props = {
  params: Promise<{ locale: string }>;
};

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pawly.com";

const PRICING = {
  LOW: "0",
  HIGH: "29",
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
          url: `${baseUrl}/og-image-${locale}.png`,
          width: 1200,
          height: 630,
          alt: t("meta.title"),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: t("meta.title"),
      description: t("meta.description"),
      images: [`${baseUrl}/og-image-${locale}.png`],
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

  // Redirect authenticated users — just check cookie presence,
  // the destination layout validates the token (avoids blocking if API is slow)
  const cookieStore = await cookies();
  const authToken = cookieStore.get("auth-token")?.value;
  if (authToken) {
    const prefix = locale === "fr" ? "" : `/${locale}`;
    redirect(`${prefix}/admin/dashboard`);
  }

  const t2 = await getTranslations({ locale, namespace: "landing.meta" });

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Pawly",
      url: baseUrl,
      description: t2("description"),
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      image: `${baseUrl}/og-image-${locale}.png`,
      author: {
        "@type": "Organization",
        name: "Pawly",
        url: baseUrl,
      },
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: PRICING.CURRENCY,
        lowPrice: PRICING.LOW,
        highPrice: PRICING.HIGH,
        offerCount: "2",
        url: `${baseUrl}/pricing`,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Pawly",
      url: baseUrl,
      logo: `${baseUrl}/icons/icon-512x512.png`,
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        url: baseUrl,
        availableLanguage: ["French", "English"],
      },
    },
  ];

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground antialiased selection:bg-primary/30">
      {/* Safe: jsonLd is a static object built from constants, no user input */}
      {jsonLd.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
      <LandingHeader />
      <main id="main-content" className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <IntegrationsSection />
        <PricingPreviewSection />
        <TestimonialsSection />
        <CTASection />
      </main>
      <LandingFooter />
    </div>
  );
}
