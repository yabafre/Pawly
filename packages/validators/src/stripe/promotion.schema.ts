import { z } from "@pawly/zod";

/** Coupon metadata type enum — classifies promotion purpose */
export const couponMetadataTypeEnum = z
  .enum(["partner", "internal", "lifetime"])
  .nullable();

export type CouponMetadataType = z.infer<typeof couponMetadataTypeEnum>;

/** Discount type enum — percent or fixed amount */
export const discountTypeEnum = z.enum(["percent", "amount"]).nullable();

export type DiscountType = z.infer<typeof discountTypeEnum>;

/** Schema for promotion details on a subscription */
export const promotionDetailsSchema = z.object({
  promotionCodeId: z.string().nullable(),
  couponId: z.string().nullable(),
  discountType: discountTypeEnum,
  discountValue: z.number().min(0).nullable(),
  couponMetadataType: couponMetadataTypeEnum,
}).superRefine((data, ctx) => {
  if (data.discountType === null && data.discountValue !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'discountValue must be null when discountType is null',
      path: ['discountValue'],
    });
  }

  if (
    data.discountType === 'amount' &&
    data.discountValue !== null &&
    !Number.isInteger(data.discountValue)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'discountValue must be an integer for amount discounts',
      path: ['discountValue'],
    });
  }

  if (
    data.discountType === 'percent' &&
    data.discountValue !== null &&
    data.discountValue > 100
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'discountValue must be <= 100 for percent discounts',
      path: ['discountValue'],
    });
  }
});

export type PromotionDetails = z.infer<typeof promotionDetailsSchema>;
