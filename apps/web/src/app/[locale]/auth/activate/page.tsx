import { setRequestLocale } from "next-intl/server";
import { ActivateClient } from "./_components/ActivateClient";

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
