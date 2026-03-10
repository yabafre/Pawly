import { getTranslations, setRequestLocale } from "next-intl/server";
import { OfflineClient } from "./_components/OfflineClient";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common.offlinePage" });
  return {
    title: t("title") + " | Pawly",
    description: t("description"),
  };
}

export default async function OfflinePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <OfflineClient />;
}
