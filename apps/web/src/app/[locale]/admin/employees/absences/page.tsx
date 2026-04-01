import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { AdminAbsencePageClient } from "./_components/AdminAbsencePageClient";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.absences" });
  return { title: t("title") };
}

export default async function AdminAbsencesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AdminAbsencePageClient />;
}
