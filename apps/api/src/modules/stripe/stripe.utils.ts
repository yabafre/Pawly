import type Stripe from 'stripe';

/**
 * Derives the entitlement tier from a Stripe Subscription object.
 *
 * Priority:
 * 1. price.lookup_key — extract tier prefix (e.g. 'starter_monthly' → 'starter')
 * 2. product.metadata.tier — direct tier value
 * 3. Default: 'starter'
 */
export function deriveEntitlementTier(
  subscription: Stripe.Subscription,
): string {
  const firstItem = subscription.items?.data?.[0];
  if (!firstItem) {
    return 'starter';
  }

  const price = firstItem.price;

  // 1. Try lookup_key — extract tier prefix before underscore
  if (price?.lookup_key) {
    const tier = price.lookup_key.split('_')[0];
    if (tier) {
      return tier;
    }
  }

  // 2. Try product metadata.tier
  const product = price?.product;
  if (product && typeof product === 'object' && 'metadata' in product) {
    const metadataTier = (product as Stripe.Product).metadata?.tier;
    if (metadataTier) {
      return metadataTier;
    }
  }

  // 3. Default
  return 'starter';
}
