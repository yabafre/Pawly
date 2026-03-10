import { setRequestLocale } from "next-intl/server";
import { CallbackClient } from "./_components/CallbackClient";

// Callback uses searchParams + client hooks — never prerender
export const dynamic = "force-dynamic";

export const metadata = {
    title: "Connexion en cours | Pawly",
};

type Props = {
    params: Promise<{ locale: string }>;
    searchParams?: Promise<{
        token?: string;
    }>;
};

export default async function CallbackPage({ params, searchParams }: Props) {
    const { locale } = await params;
    setRequestLocale(locale);
    const search = await searchParams;
    return <CallbackClient token={search?.token} />;
}
