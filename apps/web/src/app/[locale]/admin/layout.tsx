import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { trpc } from "@/lib/trpc/client";
import { AdminLayoutClient } from "./_components/AdminLayoutClient";
import { SubscriptionProvider } from "@/lib/contexts/subscription-context";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@pawly/validators";

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
            // Clinic not created yet - redirect to onboarding unless already there
            if (!isOnboardingRoute) {
                redirect(`/${locale}/admin/onboarding`);
            }
            // On onboarding route - render layout without subscription context
            return <AdminLayoutClient>{children}</AdminLayoutClient>;
        }
        // Re-throw all other errors to prevent silent failures
        throw err;
    }

    // Subscription guard: server-side check (after auth + onboarding)
    const isBillingPage = pathname.includes("/admin/billing");
    const subscriptionStatus = await trpc.stripe.getSubscriptionStatus.query();

    const isSubscriptionActive = subscriptionStatus &&
        (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(subscriptionStatus.status);

    if (!isSubscriptionActive && !isBillingPage && !isOnboardingRoute) {
        redirect(`/${locale}/admin/billing`);
    }

    return (
        <SubscriptionProvider
            status={subscriptionStatus?.status ?? null}
            entitlementTier={subscriptionStatus?.entitlementTier ?? "starter"}
        >
            <AdminLayoutClient>{children}</AdminLayoutClient>
        </SubscriptionProvider>
    );
}
