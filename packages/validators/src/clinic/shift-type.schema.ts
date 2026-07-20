import { z } from '@pawly/zod';
import { shiftTypeFieldsSchema, timeRegex, shiftBreakRuleOk } from './onboarding.schema';

export const createShiftTypeSchema = shiftTypeFieldsSchema
  .refine((data) => data.endTime !== data.startTime, {
    message: 'Start and end times must differ',
    path: ['endTime'],
  })
  .refine(shiftBreakRuleOk, {
    message: 'A shift over 6h worked requires at least a 20-minute break',
    path: ['breakMinutes'],
  });

export type CreateShiftTypeInput = z.infer<typeof createShiftTypeSchema>;

const updateShiftTypeFieldsSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50).optional(),
  code: z.string().min(1).max(10).toUpperCase().optional(),
  startTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)').optional(),
  endTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)').optional(),
  breakMinutes: z.number().int().min(0).max(300).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
    .optional(),
});

export const updateShiftTypeSchema = updateShiftTypeFieldsSchema.refine(
  (data) => {
    if (data.startTime && data.endTime) {
      if (data.endTime === data.startTime) return false;
      // Only enforce the break rule when all three fields are present in the patch.
      if (data.breakMinutes !== undefined) {
        return shiftBreakRuleOk({
          startTime: data.startTime,
          endTime: data.endTime,
          breakMinutes: data.breakMinutes,
        });
      }
    }
    return true;
  },
  {
    message: 'Start and end times must differ, and a shift over 6h needs a 20-min break',
    path: ['endTime'],
  }
);

export type UpdateShiftTypeInput = z.infer<typeof updateShiftTypeSchema>;

export const deleteShiftTypeSchema = z.object({
  id: z.string().uuid(),
});

export type DeleteShiftTypeInput = z.infer<typeof deleteShiftTypeSchema>;

export const listShiftTypesSchema = z.object({});

export type ListShiftTypesInput = z.infer<typeof listShiftTypesSchema>;
