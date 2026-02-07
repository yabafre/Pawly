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
  discountValue: z.number().int().min(0).nullable(),
  couponMetadataType: couponMetadataTypeEnum,
});

export type PromotionDetails = z.infer<typeof promotionDetailsSchema>;
