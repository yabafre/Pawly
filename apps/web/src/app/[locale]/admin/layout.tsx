import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { trpc } from "@/lib/trpc/client";
import { AdminLayoutClient } from "./_components/AdminLayoutClient";
import { SubscriptionProvider } from "@/lib/contexts/subscription-context";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@pawly/validators";

// All admin pages require auth + subscription — never prerender
export const dynamic = "force-dynamic";

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
        }
        // Other errors (API down, timeout, transformation) — fall through gracefully.
        // onboardingStatus stays null, page renders in degraded mode.
    }

    // Redirect logic — outside try-catch so NEXT_REDIRECT propagates correctly
    if (clinicNotFound) {
        if (!isOnboardingRoute) {
            redirect(`/${locale}/admin/onboarding`);
        }
        return <AdminLayoutClient clinicName="Pawly">{children}</AdminLayoutClient>;
    }

    if (onboardingStatus && !onboardingStatus.onboardingCompleted && !isOnboardingRoute) {
        redirect(`/${locale}/admin/onboarding`);
    }

    if (onboardingStatus?.onboardingCompleted && isOnboardingRoute) {
        redirect(`/${locale}/admin/dashboard`);
    }

    // Fetch clinic name for header
    let clinicName = "Pawly";
    try {
        const profile = await trpc.clinic.getProfile.query();
        clinicName = profile.name;
    } catch {
        // Fallback to default name
    }

    // Subscription guard: server-side check (after auth + onboarding)
    const isBillingPage = pathname.includes("/admin/billing");
    let subscriptionStatus: { status: string; entitlementTier: string } | null = null;

    try {
        subscriptionStatus = await trpc.stripe.getSubscriptionStatus.query();
    } catch {
        // tRPC call failed (API not ready, transformation error, etc.)
        // Fall through — treat as no active subscription
    }

    const isSubscriptionActive = subscriptionStatus &&
        (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(subscriptionStatus.status);

    // Only redirect to billing if we successfully checked and subscription is inactive.
    // If subscriptionStatus is null (API down), render the page in degraded mode
    // instead of redirect-looping to billing which also needs the API.
    if (subscriptionStatus && !isSubscriptionActive && !isBillingPage && !isOnboardingRoute) {
        redirect(`/${locale}/admin/billing`);
    }

    return (
        <SubscriptionProvider
            status={subscriptionStatus?.status ?? null}
            entitlementTier={subscriptionStatus?.entitlementTier ?? "starter"}
        >
            <AdminLayoutClient clinicName={clinicName}>{children}</AdminLayoutClient>
        </SubscriptionProvider>
    );
}
