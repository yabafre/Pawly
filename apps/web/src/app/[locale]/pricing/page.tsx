import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ plan?: string }>;
};

/**
 * The standalone /pricing checkout flow (PreCheckoutForm → Stripe → /pricing/success)
 * was superseded by the register-first flow during the onboarding revamp. Keep the
 * route as a redirect so existing links and bookmarks land on the canonical flow.
 */
export default async function PricingPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { plan } = await searchParams;
  const query = plan ? `?plan=${encodeURIComponent(plan)}` : '';
  redirect(`/${locale}/pricing/register${query}`);
}
