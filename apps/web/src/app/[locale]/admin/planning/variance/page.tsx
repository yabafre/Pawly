import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { VariancePageClient } from "./_components/VariancePageClient";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.variance" });
  return { title: t("title") };
}

export default async function VariancePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <VariancePageClient />;
}
