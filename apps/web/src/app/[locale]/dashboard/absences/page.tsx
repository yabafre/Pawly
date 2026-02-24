import { setRequestLocale } from "next-intl/server";
import { AbsencePageClient } from "./_components/AbsencePageClient";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AbsencesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AbsencePageClient />;
}
