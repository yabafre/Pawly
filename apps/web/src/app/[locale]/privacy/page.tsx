import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { LandingHeader } from "../_components/LandingHeader";
import { LandingFooter } from "../_components/LandingFooter";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: true, follow: true },
  };
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.privacy");

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1 py-16 px-6">
        <article className="max-w-3xl mx-auto prose prose-neutral dark:prose-invert prose-headings:tracking-tight">
          <h1>{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("lastUpdated")}</p>

          <h2>{t("sections.collection.title")}</h2>
          <p>{t("sections.collection.content")}</p>

          <h2>{t("sections.usage.title")}</h2>
          <p>{t("sections.usage.content")}</p>

          <h2>{t("sections.storage.title")}</h2>
          <p>{t("sections.storage.content")}</p>

          <h2>{t("sections.sharing.title")}</h2>
          <p>{t("sections.sharing.content")}</p>

          <h2>{t("sections.rights.title")}</h2>
          <p>{t("sections.rights.content")}</p>

          <h2>{t("sections.cookies.title")}</h2>
          <p>{t("sections.cookies.content")}</p>

          <h2>{t("sections.contact.title")}</h2>
          <p>{t("sections.contact.content")}</p>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
