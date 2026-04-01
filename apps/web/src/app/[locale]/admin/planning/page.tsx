import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { PlanningPageClient } from "./_components/PlanningPageClient";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.scheduleView" });
  return { title: t("title") };
}

export default async function PlanningPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="h-full flex flex-col animate-in fade-in space-y-6">
      <PlanningPageClient />
    </div>
  );
}
