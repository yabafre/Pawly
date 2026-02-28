import { setRequestLocale } from "next-intl/server";
import { LoginPageClient } from "./_components/LoginPageClient";

// Login page uses client hooks — never prerender
export const dynamic = "force-dynamic";

type Props = {
    params: Promise<{ locale: string }>;
};

export default async function LoginPage({ params }: Props) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <LoginPageClient />;
}
