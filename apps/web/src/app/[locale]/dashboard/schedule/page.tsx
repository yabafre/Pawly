import { getTranslations, setRequestLocale } from "next-intl/server";
import { SchedulePageClient } from "./_components/SchedulePageClient";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return {
    title: t("schedule.title"),
  };
}

export default async function SchedulePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SchedulePageClient />;
}
