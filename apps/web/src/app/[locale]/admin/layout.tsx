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
    } catch (err) {
        // Only allow access if clinic truly doesn't exist yet (first-time login)
        // All other errors (network, auth, validation, corruption) should bubble up
        if (
            err &&
            typeof err === "object" &&
            "message" in err &&
            typeof err.message === "string" &&
            err.message.toLowerCase().includes("not found")
        ) {
            // Clinic not created yet - allow access for first-time setup
            return;
        }
        // Re-throw all other errors to prevent silent failures
        throw err;
    }

    return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
