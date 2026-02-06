import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { trpc } from "@/lib/trpc/client";
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

    // Onboarding guard: server-side check
    const headersList = await headers();
    const pathname = headersList.get("x-pathname") ?? "";
    const isOnboardingRoute = pathname.includes("/admin/onboarding");

    try {
        const status = await trpc.clinic.getOnboardingStatus.query();

        if (!status.onboardingCompleted && !isOnboardingRoute) {
            redirect(`/${locale}/admin/onboarding`);
        }

        if (status.onboardingCompleted && isOnboardingRoute) {
            redirect(`/${locale}/admin/dashboard`);
        }
    } catch {
        // If tRPC call fails (e.g., clinic not yet created), allow access
    }

    return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
