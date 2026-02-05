import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AdminLayoutClient } from "./_components/AdminLayoutClient";

type Props = {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
};

export default async function AdminLayout({ children, params }: Props) {
    const { locale } = await params;
    setRequestLocale(locale);

    // Auth guard: check for auth token cookie
    const cookieStore = await cookies();
    const authToken = cookieStore.get("auth-token")?.value;

    if (!authToken) {
        redirect(`/${locale}/login`);
    }

    // TODO (Epic 3): Add subscription guard here
    // const subscription = await trpc.subscription.getStatus.query();
    // if (!subscription.active || !subscription.onboardingCompleted) {
    //     redirect(`/${locale}/onboarding`);
    // }

    return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
