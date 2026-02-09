import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubscriptionGate } from '../SubscriptionGate';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'upgrade.title': 'Feature Unavailable',
      'upgrade.description': 'This feature requires a higher subscription tier.',
      'upgrade.action': 'Upgrade Plan',
    };
    return translations[key] || key;
  },
}));

// Mock subscription context
const mockCanAccessFeature = vi.fn();

vi.mock('@/lib/contexts/subscription-context', () => ({
  useSubscription: () => ({
    status: 'active',
    entitlementTier: 'starter',
    isActive: true,
    canAccessFeature: mockCanAccessFeature,
  }),
}));

describe('SubscriptionGate', () => {
  it('renders children when tier matches', () => {
    mockCanAccessFeature.mockReturnValue(true);

    render(
      <SubscriptionGate requiredTier="starter">
        <div data-testid="protected-content">Protected Content</div>
      </SubscriptionGate>,
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByText('Feature Unavailable')).not.toBeInTheDocument();
  });

  it('shows upgrade prompt when tier is insufficient', () => {
    mockCanAccessFeature.mockReturnValue(false);

    render(
      <SubscriptionGate requiredTier="professional">
        <div data-testid="protected-content">Protected Content</div>
      </SubscriptionGate>,
    );

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.getByText('Feature Unavailable')).toBeInTheDocument();
    expect(
      screen.getByText('This feature requires a higher subscription tier.'),
    ).toBeInTheDocument();
  });

  it('shows link to billing page in upgrade prompt', () => {
    mockCanAccessFeature.mockReturnValue(false);

    render(
      <SubscriptionGate requiredTier="professional" locale="en">
        <div>Hidden</div>
      </SubscriptionGate>,
    );

    const link = screen.getByRole('link', { name: /upgrade plan/i });
    expect(link).toHaveAttribute('href', '/en/admin/billing');
  });

  it('uses default locale "fr" for billing link', () => {
    mockCanAccessFeature.mockReturnValue(false);

    render(
      <SubscriptionGate requiredTier="enterprise">
        <div>Hidden</div>
      </SubscriptionGate>,
    );

    const link = screen.getByRole('link', { name: /upgrade plan/i });
    expect(link).toHaveAttribute('href', '/fr/admin/billing');
  });

  it('calls canAccessFeature with requiredTier', () => {
    mockCanAccessFeature.mockReturnValue(true);

    render(
      <SubscriptionGate requiredTier="professional">
        <div>Content</div>
      </SubscriptionGate>,
    );

    expect(mockCanAccessFeature).toHaveBeenCalledWith('professional');
  });
});
