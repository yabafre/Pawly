import { setRequestLocale } from "next-intl/server";
import { ForgotPasswordClient } from "./_components/ForgotPasswordClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ForgotPasswordPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ForgotPasswordClient />;
}
