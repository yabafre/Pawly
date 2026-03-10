import { setRequestLocale } from "next-intl/server";
import { ActivateClient } from "./_components/ActivateClient";

// Activation uses searchParams + client hooks — never prerender
export const dynamic = "force-dynamic";

export const metadata = {
    title: "Activation du compte | Pawly",
};

type Props = {
    params: Promise<{ locale: string }>;
    searchParams?: Promise<{
        token?: string;
    }>;
};

export default async function ActivatePage({ params, searchParams }: Props) {
    const { locale } = await params;
    setRequestLocale(locale);
    const search = await searchParams;
    return <ActivateClient token={search?.token} />;
}
