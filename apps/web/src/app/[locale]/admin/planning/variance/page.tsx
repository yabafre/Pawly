import { setRequestLocale } from "next-intl/server";
import { VariancePageClient } from "./_components/VariancePageClient";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function VariancePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <VariancePageClient />;
}
