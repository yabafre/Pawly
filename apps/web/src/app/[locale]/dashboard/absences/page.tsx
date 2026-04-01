import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { AbsencePageClient } from "./_components/AbsencePageClient";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "employeeAbsences" });
  return { title: t("title") };
}

export default async function AbsencesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AbsencePageClient />;
}
