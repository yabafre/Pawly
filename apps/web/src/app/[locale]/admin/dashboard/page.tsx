import { setRequestLocale } from "next-intl/server";
import { DashboardPageClient } from "./_components/DashboardPageClient";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AdminDashboardPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <DashboardPageClient />;
}
