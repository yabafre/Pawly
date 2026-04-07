import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { LandingHeader } from "../_components/LandingHeader";
import { LandingFooter } from "../_components/LandingFooter";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.terms" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: true, follow: true },
  };
}

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.terms");

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1 py-16 px-6">
        <article className="max-w-3xl mx-auto prose prose-neutral dark:prose-invert prose-headings:tracking-tight">
          <h1>{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("lastUpdated")}</p>

          <h2>{t("sections.acceptance.title")}</h2>
          <p>{t("sections.acceptance.content")}</p>

          <h2>{t("sections.service.title")}</h2>
          <p>{t("sections.service.content")}</p>

          <h2>{t("sections.accounts.title")}</h2>
          <p>{t("sections.accounts.content")}</p>

          <h2>{t("sections.subscription.title")}</h2>
          <p>{t("sections.subscription.content")}</p>

          <h2>{t("sections.ip.title")}</h2>
          <p>{t("sections.ip.content")}</p>

          <h2>{t("sections.limitation.title")}</h2>
          <p>{t("sections.limitation.content")}</p>

          <h2>{t("sections.termination.title")}</h2>
          <p>{t("sections.termination.content")}</p>

          <h2>{t("sections.law.title")}</h2>
          <p>{t("sections.law.content")}</p>

          <h2>{t("sections.contact.title")}</h2>
          <p>{t("sections.contact.content")}</p>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
