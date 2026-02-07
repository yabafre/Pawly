import { describe, it, expect } from 'vitest';
import {
  promotionDetailsSchema,
  couponMetadataTypeEnum,
  discountTypeEnum,
} from './promotion.schema';

describe('couponMetadataTypeEnum', () => {
  it('should accept "partner"', () => {
    expect(couponMetadataTypeEnum.parse('partner')).toBe('partner');
  });

  it('should accept "internal"', () => {
    expect(couponMetadataTypeEnum.parse('internal')).toBe('internal');
  });

  it('should accept "lifetime"', () => {
    expect(couponMetadataTypeEnum.parse('lifetime')).toBe('lifetime');
  });

  it('should accept null', () => {
    expect(couponMetadataTypeEnum.parse(null)).toBeNull();
  });

  it('should reject "unknown"', () => {
    expect(() => couponMetadataTypeEnum.parse('unknown')).toThrow();
  });
});

describe('discountTypeEnum', () => {
  it('should accept "percent"', () => {
    expect(discountTypeEnum.parse('percent')).toBe('percent');
  });

  it('should accept "amount"', () => {
    expect(discountTypeEnum.parse('amount')).toBe('amount');
  });

  it('should accept null', () => {
    expect(discountTypeEnum.parse(null)).toBeNull();
  });

  it('should reject "free"', () => {
    expect(() => discountTypeEnum.parse('free')).toThrow();
  });
});

describe('promotionDetailsSchema', () => {
  it('should accept valid promotion with all fields', () => {
    const result = promotionDetailsSchema.parse({
      promotionCodeId: 'promo_abc123',
      couponId: 'coupon_xyz',
      discountType: 'percent',
      discountValue: 25,
      couponMetadataType: 'partner',
    });

    expect(result).toEqual({
      promotionCodeId: 'promo_abc123',
      couponId: 'coupon_xyz',
      discountType: 'percent',
      discountValue: 25,
      couponMetadataType: 'partner',
    });
  });

  it('should accept promotion with null couponMetadataType', () => {
    const result = promotionDetailsSchema.parse({
      promotionCodeId: 'promo_abc123',
      couponId: 'coupon_xyz',
      discountType: 'percent',
      discountValue: 100,
      couponMetadataType: null,
    });

    expect(result.couponMetadataType).toBeNull();
  });

  it('should accept promotion with all null fields', () => {
    const result = promotionDetailsSchema.parse({
      promotionCodeId: null,
      couponId: null,
      discountType: null,
      discountValue: null,
      couponMetadataType: null,
    });

    expect(result.promotionCodeId).toBeNull();
    expect(result.couponId).toBeNull();
    expect(result.discountType).toBeNull();
    expect(result.discountValue).toBeNull();
    expect(result.couponMetadataType).toBeNull();
  });

  it('should reject invalid discountType', () => {
    expect(() =>
      promotionDetailsSchema.parse({
        promotionCodeId: 'promo_abc123',
        couponId: 'coupon_xyz',
        discountType: 'free',
        discountValue: 100,
        couponMetadataType: null,
      }),
    ).toThrow();
  });

  it('should reject negative discountValue', () => {
    expect(() =>
      promotionDetailsSchema.parse({
        promotionCodeId: 'promo_abc123',
        couponId: 'coupon_xyz',
        discountType: 'percent',
        discountValue: -10,
        couponMetadataType: null,
      }),
    ).toThrow();
  });

  it('should accept amount discount type', () => {
    const result = promotionDetailsSchema.parse({
      promotionCodeId: 'promo_abc123',
      couponId: 'coupon_xyz',
      discountType: 'amount',
      discountValue: 2000,
      couponMetadataType: 'internal',
    });

    expect(result.discountType).toBe('amount');
    expect(result.discountValue).toBe(2000);
  });
});
