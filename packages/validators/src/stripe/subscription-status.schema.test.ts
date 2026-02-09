import { describe, it, expect } from 'vitest';
import {
  subscriptionStatusSchema,
  subscriptionGuardResponseSchema,
} from './subscription-status.schema';

describe('subscriptionStatusSchema', () => {
  it('should accept "active"', () => {
    expect(subscriptionStatusSchema.parse('active')).toBe('active');
  });

  it('should accept "trialing"', () => {
    expect(subscriptionStatusSchema.parse('trialing')).toBe('trialing');
  });

  it('should accept "past_due"', () => {
    expect(subscriptionStatusSchema.parse('past_due')).toBe('past_due');
  });

  it('should accept "canceled"', () => {
    expect(subscriptionStatusSchema.parse('canceled')).toBe('canceled');
  });

  it('should accept "unpaid"', () => {
    expect(subscriptionStatusSchema.parse('unpaid')).toBe('unpaid');
  });

  it('should reject invalid status value', () => {
    expect(() => subscriptionStatusSchema.parse('invalid')).toThrow();
  });

  it('should reject empty string', () => {
    expect(() => subscriptionStatusSchema.parse('')).toThrow();
  });

  it('should reject null', () => {
    expect(() => subscriptionStatusSchema.parse(null)).toThrow();
  });
});

describe('subscriptionGuardResponseSchema', () => {
  it('should accept valid response with active status', () => {
    const result = subscriptionGuardResponseSchema.parse({
      status: 'active',
      entitlementTier: 'starter',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: '2026-03-01T00:00:00.000Z',
    });

    expect(result).toEqual({
      status: 'active',
      entitlementTier: 'starter',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: '2026-03-01T00:00:00.000Z',
    });
  });

  it('should accept valid response with trialing status', () => {
    const result = subscriptionGuardResponseSchema.parse({
      status: 'trialing',
      entitlementTier: 'professional',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });

    expect(result?.status).toBe('trialing');
    expect(result?.currentPeriodEnd).toBeNull();
  });

  it('should accept null (no subscription)', () => {
    expect(subscriptionGuardResponseSchema.parse(null)).toBeNull();
  });

  it('should reject response missing status', () => {
    expect(() =>
      subscriptionGuardResponseSchema.parse({
        entitlementTier: 'starter',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      }),
    ).toThrow();
  });

  it('should reject response missing entitlementTier', () => {
    expect(() =>
      subscriptionGuardResponseSchema.parse({
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      }),
    ).toThrow();
  });

  it('should reject response with invalid status', () => {
    expect(() =>
      subscriptionGuardResponseSchema.parse({
        status: 'invalid',
        entitlementTier: 'starter',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      }),
    ).toThrow();
  });

  it('should reject response missing cancelAtPeriodEnd', () => {
    expect(() =>
      subscriptionGuardResponseSchema.parse({
        status: 'active',
        entitlementTier: 'starter',
        currentPeriodEnd: null,
      }),
    ).toThrow();
  });
});
