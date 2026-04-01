import { setRequestLocale } from "next-intl/server";
import { ResetPasswordClient } from "./_components/ResetPasswordClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);

  return <ResetPasswordClient token={token} />;
}
