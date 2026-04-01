import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { SettingsPageClient } from "./_components/SettingsPageClient";

type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "employeeSettings" });
  return { title: t("title") };
}

export default async function SettingsPage({ params }: Props) {
    const { locale } = await params;
    setRequestLocale(locale);

    return <SettingsPageClient />;
}
