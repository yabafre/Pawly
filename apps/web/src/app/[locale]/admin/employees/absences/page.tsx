import { setRequestLocale } from "next-intl/server";
import { AdminAbsencePageClient } from "./_components/AdminAbsencePageClient";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AdminAbsencesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AdminAbsencePageClient />;
}
