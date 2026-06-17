import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { trpc } from '@/lib/trpc/client';
import { DashboardLayoutClient } from './_components/DashboardLayoutClient';
import { DashboardQueryProvider } from './_components/DashboardQueryProvider';
import { EmployeeProvider } from './_components/EmployeeContext';
import { ACTIVE_SUBSCRIPTION_STATUSES, type TourState } from '@pawly/validators';

// All dashboard pages require auth + subscription — never prerender
export const dynamic = 'force-dynamic';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function DashboardLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Auth guard: check for auth token cookie
  const cookieStore = await cookies();
  const authToken = cookieStore.get('auth-token')?.value;

  if (!authToken) {
    redirect(`/${locale}/login`);
  }

  // Role guard: server-side check via tRPC — only EMPLOYEE role allowed
  let me: { role: string; employeeId: string | null; jobType: string | null } | null = null;
  let authFailed = false;
  try {
    me = await trpc.auth.getMe.query();
  } catch {
    authFailed = true;
  }

  if (authFailed) {
    redirect(`/${locale}/login`);
  }

  if (!me || me.role !== 'EMPLOYEE') {
    redirect(`/${locale}/admin/dashboard`);
  }

  if (!me.employeeId || !me.jobType) {
    // Clear auth cookie to prevent infinite redirect loop
    // (employee user without linked employee record)
    const cs = await cookies();
    cs.delete('auth-token');
    redirect(`/${locale}/login?error=no_employee`);
  }

  // Subscription guard: employee's clinic must have active subscription
  let subscriptionActive = false;
  try {
    const subStatus = await trpc.stripe.getSubscriptionStatus.query();
    if (subStatus) {
      subscriptionActive = (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(
        subStatus.status
      );
    }
  } catch {
    // Subscription check failed — treat as inactive
  }

  if (!subscriptionActive) {
    redirect(`/${locale}/login`);
  }

  // Tour is non-critical — never let its fetch block the page.
  let tourCompletedAt: string | null = null;
  let tourState: TourState | null = null;
  try {
    const ts = await trpc.tour.getState.query();
    tourCompletedAt = ts.tourCompletedAt;
    tourState = ts.tourState;
  } catch {
    // Render without the tour on failure.
  }

  return (
    <EmployeeProvider employeeId={me.employeeId} jobType={me.jobType}>
      <DashboardQueryProvider>
        <DashboardLayoutClient tourCompletedAt={tourCompletedAt} tourState={tourState}>
          {children}
        </DashboardLayoutClient>
      </DashboardQueryProvider>
    </EmployeeProvider>
  );
}
