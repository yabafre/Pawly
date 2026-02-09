import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubscriptionProvider, useSubscription } from '../subscription-context';

function TestConsumer({ requiredTier }: { requiredTier?: string }) {
  const { status, entitlementTier, isActive, canAccessFeature } =
    useSubscription();
  return (
    <div>
      <span data-testid="status">{status ?? 'null'}</span>
      <span data-testid="tier">{entitlementTier}</span>
      <span data-testid="active">{String(isActive)}</span>
      {requiredTier && (
        <span data-testid="access">
          {String(canAccessFeature(requiredTier))}
        </span>
      )}
    </div>
  );
}

describe('SubscriptionProvider', () => {
  it('provides isActive=true for active status', () => {
    render(
      <SubscriptionProvider status="active" entitlementTier="starter">
        <TestConsumer />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('active').textContent).toBe('true');
  });

  it('provides isActive=true for trialing status', () => {
    render(
      <SubscriptionProvider status="trialing" entitlementTier="professional">
        <TestConsumer />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('active').textContent).toBe('true');
  });

  it('provides isActive=false for past_due status', () => {
    render(
      <SubscriptionProvider status="past_due" entitlementTier="starter">
        <TestConsumer />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('active').textContent).toBe('false');
  });

  it('provides isActive=false for canceled status', () => {
    render(
      <SubscriptionProvider status="canceled" entitlementTier="starter">
        <TestConsumer />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('active').textContent).toBe('false');
  });

  it('provides isActive=false for unpaid status', () => {
    render(
      <SubscriptionProvider status="unpaid" entitlementTier="starter">
        <TestConsumer />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('active').textContent).toBe('false');
  });

  it('provides isActive=false for null status', () => {
    render(
      <SubscriptionProvider status={null} entitlementTier="starter">
        <TestConsumer />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('active').textContent).toBe('false');
    expect(screen.getByTestId('status').textContent).toBe('null');
  });
});

describe('canAccessFeature', () => {
  it('grants access when tier matches exactly (starter)', () => {
    render(
      <SubscriptionProvider status="active" entitlementTier="starter">
        <TestConsumer requiredTier="starter" />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('access').textContent).toBe('true');
  });

  it('grants access when tier matches exactly (professional)', () => {
    render(
      <SubscriptionProvider status="active" entitlementTier="professional">
        <TestConsumer requiredTier="professional" />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('access').textContent).toBe('true');
  });

  it('grants access when tier is higher (enterprise > starter)', () => {
    render(
      <SubscriptionProvider status="active" entitlementTier="enterprise">
        <TestConsumer requiredTier="starter" />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('access').textContent).toBe('true');
  });

  it('grants access when tier is higher (enterprise > professional)', () => {
    render(
      <SubscriptionProvider status="active" entitlementTier="enterprise">
        <TestConsumer requiredTier="professional" />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('access').textContent).toBe('true');
  });

  it('grants access when tier is higher (professional > starter)', () => {
    render(
      <SubscriptionProvider status="active" entitlementTier="professional">
        <TestConsumer requiredTier="starter" />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('access').textContent).toBe('true');
  });

  it('denies access when tier is lower (starter < professional)', () => {
    render(
      <SubscriptionProvider status="active" entitlementTier="starter">
        <TestConsumer requiredTier="professional" />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('access').textContent).toBe('false');
  });

  it('denies access when tier is lower (starter < enterprise)', () => {
    render(
      <SubscriptionProvider status="active" entitlementTier="starter">
        <TestConsumer requiredTier="enterprise" />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('access').textContent).toBe('false');
  });

  it('denies access when tier is lower (professional < enterprise)', () => {
    render(
      <SubscriptionProvider status="active" entitlementTier="professional">
        <TestConsumer requiredTier="enterprise" />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('access').textContent).toBe('false');
  });

  it('denies access when subscription is inactive even with matching tier', () => {
    render(
      <SubscriptionProvider status="past_due" entitlementTier="enterprise">
        <TestConsumer requiredTier="starter" />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('access').textContent).toBe('false');
  });

  it('denies access when subscription is canceled even with matching tier', () => {
    render(
      <SubscriptionProvider status="canceled" entitlementTier="professional">
        <TestConsumer requiredTier="starter" />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('access').textContent).toBe('false');
  });

  it('denies access when status is null', () => {
    render(
      <SubscriptionProvider status={null} entitlementTier="enterprise">
        <TestConsumer requiredTier="starter" />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('access').textContent).toBe('false');
  });

  it('denies access for unknown current tier', () => {
    render(
      <SubscriptionProvider status="active" entitlementTier="unknown_tier">
        <TestConsumer requiredTier="starter" />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('access').textContent).toBe('false');
  });

  it('denies access for unknown required tier', () => {
    render(
      <SubscriptionProvider status="active" entitlementTier="professional">
        <TestConsumer requiredTier="platinum" />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('access').textContent).toBe('false');
  });

  it('denies access for empty string tier', () => {
    render(
      <SubscriptionProvider status="active" entitlementTier="">
        <TestConsumer requiredTier="starter" />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('access').textContent).toBe('false');
  });

  it('works with trialing status', () => {
    render(
      <SubscriptionProvider status="trialing" entitlementTier="professional">
        <TestConsumer requiredTier="starter" />
      </SubscriptionProvider>,
    );
    expect(screen.getByTestId('access').textContent).toBe('true');
  });
});

describe('useSubscription default context', () => {
  it('returns safe defaults when used outside provider', () => {
    render(<TestConsumer requiredTier="starter" />);
    expect(screen.getByTestId('status').textContent).toBe('null');
    expect(screen.getByTestId('tier').textContent).toBe('starter');
    expect(screen.getByTestId('active').textContent).toBe('false');
    expect(screen.getByTestId('access').textContent).toBe('false');
  });
});
