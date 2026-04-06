import type Stripe from 'stripe';
import { TIER_HIERARCHY } from '@pawly/validators';

const validTiers = new Set<string>(TIER_HIERARCHY);

/**
 * Derives the entitlement tier from a Stripe Subscription object.
 *
 * Priority:
 * 1. price.lookup_key — extract tier prefix (e.g. 'professional_monthly' → 'professional')
 * 2. product.metadata.tier — direct tier value
 * 3. price.unit_amount — amount-based fallback (0 = starter, >0 = professional)
 * 4. Default: 'starter'
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
    if (tier && validTiers.has(tier)) {
      return tier;
    }
  }

  // 2. Try product metadata.tier
  const product = price?.product;
  if (product && typeof product === 'object' && 'metadata' in product) {
    const metadataTier = (product as Stripe.Product).metadata?.tier;
    if (metadataTier && validTiers.has(metadataTier)) {
      return metadataTier;
    }
  }

  // 3. Amount-based fallback: paid plan = professional
  if (price?.unit_amount && price.unit_amount > 0) {
    return 'professional';
  }

  // 4. Default
  return 'starter';
}
