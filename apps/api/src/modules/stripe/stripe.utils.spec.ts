import { deriveEntitlementTier } from './stripe.utils';
import type Stripe from 'stripe';

describe('deriveEntitlementTier', () => {
  function makeSubscription(
    overrides: Partial<{
      lookupKey: string | null;
      productMetadata: Record<string, string>;
      hasItems: boolean;
    }> = {},
  ): Stripe.Subscription {
    const { lookupKey = 'starter_monthly', productMetadata, hasItems = true } =
      overrides;

    if (!hasItems) {
      return { items: { data: [] } } as unknown as Stripe.Subscription;
    }

    return {
      items: {
        data: [
          {
            price: {
              lookup_key: lookupKey,
              product: productMetadata
                ? { metadata: productMetadata }
                : 'prod_string_id',
            },
          },
        ],
      },
    } as unknown as Stripe.Subscription;
  }

  it('should extract tier from lookup_key "starter_monthly" → "starter"', () => {
    expect(deriveEntitlementTier(makeSubscription({ lookupKey: 'starter_monthly' }))).toBe('starter');
  });

  it('should extract tier from lookup_key "pro_monthly" → "pro"', () => {
    expect(deriveEntitlementTier(makeSubscription({ lookupKey: 'pro_monthly' }))).toBe('pro');
  });

  it('should extract tier from lookup_key "enterprise_yearly" → "enterprise"', () => {
    expect(deriveEntitlementTier(makeSubscription({ lookupKey: 'enterprise_yearly' }))).toBe('enterprise');
  });

  it('should fall back to product.metadata.tier when lookup_key is null', () => {
    expect(
      deriveEntitlementTier(
        makeSubscription({
          lookupKey: null,
          productMetadata: { tier: 'pro' },
        }),
      ),
    ).toBe('pro');
  });

  it('should default to "starter" when no lookup_key and no product metadata', () => {
    expect(
      deriveEntitlementTier(makeSubscription({ lookupKey: null })),
    ).toBe('starter');
  });

  it('should default to "starter" when subscription has no items', () => {
    expect(deriveEntitlementTier(makeSubscription({ hasItems: false }))).toBe('starter');
  });

  it('should handle subscription with empty items.data gracefully', () => {
    const sub = { items: { data: [] } } as unknown as Stripe.Subscription;
    expect(deriveEntitlementTier(sub)).toBe('starter');
  });

  it('should handle lookup_key with no underscore', () => {
    expect(deriveEntitlementTier(makeSubscription({ lookupKey: 'enterprise' }))).toBe('enterprise');
  });

  it('should extract only first segment for multi-underscore lookup_key', () => {
    expect(
      deriveEntitlementTier(makeSubscription({ lookupKey: 'enterprise_premium_yearly' })),
    ).toBe('enterprise');
  });
});
