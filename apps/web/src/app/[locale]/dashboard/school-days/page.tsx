import { setRequestLocale } from "next-intl/server";
import { SchoolDayCalendar } from "./_components/SchoolDayCalendar";

type Props = {
    params: Promise<{ locale: string }>;
};

export default async function SchoolDaysPage({ params }: Props) {
    const { locale } = await params;
    setRequestLocale(locale);

    return <SchoolDayCalendar />;
}
