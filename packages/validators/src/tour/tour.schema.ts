import { z } from '@pawly/zod';

export const tourStateSchema = z.object({
  tourKey: z.string(),
  step: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export type TourState = z.infer<typeof tourStateSchema>;

export const saveTourProgressSchema = z.object({
  tourKey: z.string(),
  step: z.number().int().nonnegative(),
});

export const completeTourSchema = z.object({
  tourKey: z.string(),
});

export const tourStateOutputSchema = z.object({
  tourCompletedAt: z.string().nullable(),
  tourState: tourStateSchema.nullable(),
});
