import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock useSearchParams
let mockPlanParam: string | null = 'professional';
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'plan' ? mockPlanParam : null),
  }),
}));

// Mock PreCheckoutForm
vi.mock('../_components/PreCheckoutForm', () => ({
  PreCheckoutForm: ({ priceId }: { priceId: string }) => (
    <div data-testid="pre-checkout-form" data-priceid={priceId}>
      PreCheckoutForm
    </div>
  ),
}));

// Mock next-intl Link
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Override useTranslations mock to provide .raw() method
vi.mock('next-intl', async () => {
  const actual = await vi.importActual('next-intl');
  return {
    ...actual,
    useTranslations: () => {
      const t = (key: string) => key;
      t.raw = (key: string) => {
        if (key.endsWith('.features')) return ['Feature 1', 'Feature 2', 'Feature 3'];
        return key;
      };
      t.rich = (key: string) => key;
      t.markup = (key: string) => key;
      t.has = () => true;
      return t;
    },
    useLocale: () => 'fr',
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
    hasLocale: (locales: string[], locale: string) => locales.includes(locale),
  };
});

// Set env vars for tests
const TEST_PRICE_STARTER = 'price_starter_test';
const TEST_PRICE_PROFESSIONAL = 'price_professional_test';
const TEST_PRICE_ENTERPRISE = 'price_enterprise_test';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('PricingCheckout', () => {
  beforeEach(() => {
    vi.resetModules();
    mockPlanParam = 'professional';
    process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER = TEST_PRICE_STARTER;
    process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL = TEST_PRICE_PROFESSIONAL;
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE = TEST_PRICE_ENTERPRISE;
  });

  it('renders plan summary card with professional plan by default', async () => {
    const { PricingCheckout } = await import('../_components/PricingCheckout');
    renderWithProviders(<PricingCheckout />);

    expect(screen.getByText('professional.name')).toBeInTheDocument();
    expect(screen.getByText('professional.description')).toBeInTheDocument();
  });

  it('renders PreCheckoutForm with correct priceId', async () => {
    const { PricingCheckout } = await import('../_components/PricingCheckout');
    renderWithProviders(<PricingCheckout />);

    const form = screen.getByTestId('pre-checkout-form');
    expect(form).toHaveAttribute('data-priceid', TEST_PRICE_PROFESSIONAL);
  });

  it('defaults to professional plan for invalid plan param', async () => {
    mockPlanParam = 'invalid_plan';
    const { PricingCheckout } = await import('../_components/PricingCheckout');
    renderWithProviders(<PricingCheckout />);

    expect(screen.getByText('professional.name')).toBeInTheDocument();
    const form = screen.getByTestId('pre-checkout-form');
    expect(form).toHaveAttribute('data-priceid', TEST_PRICE_PROFESSIONAL);
  });

  it('defaults to professional plan when no plan param', async () => {
    mockPlanParam = null;
    const { PricingCheckout } = await import('../_components/PricingCheckout');
    renderWithProviders(<PricingCheckout />);

    expect(screen.getByText('professional.name')).toBeInTheDocument();
  });

  it('renders starter plan when plan=starter', async () => {
    mockPlanParam = 'starter';
    const { PricingCheckout } = await import('../_components/PricingCheckout');
    renderWithProviders(<PricingCheckout />);

    expect(screen.getByText('starter.name')).toBeInTheDocument();
    const form = screen.getByTestId('pre-checkout-form');
    expect(form).toHaveAttribute('data-priceid', TEST_PRICE_STARTER);
  });

  it('renders enterprise plan when plan=enterprise', async () => {
    mockPlanParam = 'enterprise';
    const { PricingCheckout } = await import('../_components/PricingCheckout');
    renderWithProviders(<PricingCheckout />);

    expect(screen.getByText('enterprise.name')).toBeInTheDocument();
    const form = screen.getByTestId('pre-checkout-form');
    expect(form).toHaveAttribute('data-priceid', TEST_PRICE_ENTERPRISE);
  });

  it('renders error when priceId env var is missing', async () => {
    delete process.env.NEXT_PUBLIC_STRIPE_PRICE_PROFESSIONAL;
    const { PricingCheckout } = await import('../_components/PricingCheckout');
    renderWithProviders(<PricingCheckout />);

    expect(screen.getByText('missingPriceIdError')).toBeInTheDocument();
  });

  it('renders change plan link pointing to landing pricing section', async () => {
    const { PricingCheckout } = await import('../_components/PricingCheckout');
    renderWithProviders(<PricingCheckout />);

    const link = screen.getByText('changePlan');
    expect(link.closest('a')).toHaveAttribute('href', '/#pricing');
  });

  it('renders feature list from translations', async () => {
    const { PricingCheckout } = await import('../_components/PricingCheckout');
    renderWithProviders(<PricingCheckout />);

    // Features are rendered from t.raw(), the mock returns the key
    // Verify that list items are rendered
    const listItems = screen.getAllByRole('listitem');
    expect(listItems.length).toBeGreaterThan(0);
  });
});
