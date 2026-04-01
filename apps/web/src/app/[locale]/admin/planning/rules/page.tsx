import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { PlanningRulesPanel } from "../../settings/_components/PlanningRulesPanel";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.planningRules" });
  return { title: t("title") };
}

export default async function PlanningRulesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <PlanningRulesPanel />;
}
