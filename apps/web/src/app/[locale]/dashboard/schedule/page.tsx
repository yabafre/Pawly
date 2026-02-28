import { setRequestLocale } from "next-intl/server";
import { SchedulePageClient } from "./_components/SchedulePageClient";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function SchedulePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SchedulePageClient />;
}
