import { setRequestLocale } from "next-intl/server";
import { PlanningRulesPanel } from "../../settings/_components/PlanningRulesPanel";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function PlanningRulesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <PlanningRulesPanel />;
}
