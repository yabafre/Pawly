import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { LoginPageClient } from "./_components/LoginPageClient";

// Login page uses client hooks — never prerender
export const dynamic = "force-dynamic";

type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return { title: t("title") };
}

export default async function LoginPage({ params }: Props) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <LoginPageClient />;
}
