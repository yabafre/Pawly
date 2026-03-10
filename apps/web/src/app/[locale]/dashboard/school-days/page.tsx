import { getTranslations, setRequestLocale } from "next-intl/server";
import { SchoolDayCalendar } from "./_components/SchoolDayCalendar";
import type { Metadata } from "next";

type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "dashboard" });
    return {
        title: t("schoolDays.title"),
    };
}

export default async function SchoolDaysPage({ params }: Props) {
    const { locale } = await params;
    setRequestLocale(locale);

    return <SchoolDayCalendar />;
}
