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

    // Fetch onboarding status — separate data fetching from redirect logic
    // redirect() throws NEXT_REDIRECT internally and MUST NOT be inside try-catch
    let onboardingStatus: { onboardingCompleted: boolean } | null = null;
    let clinicNotFound = false;

    try {
        onboardingStatus = await trpc.clinic.getOnboardingStatus.query();
    } catch (err) {
        if (
            err &&
            typeof err === "object" &&
            "message" in err &&
            typeof err.message === "string" &&
            err.message.toLowerCase().includes("not found")
        ) {
            clinicNotFound = true;
        } else {
            throw err;
        }
    }

    // Redirect logic — outside try-catch so NEXT_REDIRECT propagates correctly
    if (clinicNotFound) {
        if (!isOnboardingRoute) {
            redirect(`/${locale}/admin/onboarding`);
        }
        return <AdminLayoutClient>{children}</AdminLayoutClient>;
    }

    if (onboardingStatus && !onboardingStatus.onboardingCompleted && !isOnboardingRoute) {
        redirect(`/${locale}/admin/onboarding`);
    }

    if (onboardingStatus?.onboardingCompleted && isOnboardingRoute) {
        redirect(`/${locale}/admin/dashboard`);
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
