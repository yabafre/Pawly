import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RegisterPageClient } from "./_components/RegisterPageClient";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ plan?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "register" });
  return { title: t("pageTitle") };
}

export default async function RegisterPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { plan } = await searchParams;
  const selectedPlan = plan === "professional" ? "professional" : "starter";

  return <RegisterPageClient selectedPlan={selectedPlan} />;
}
