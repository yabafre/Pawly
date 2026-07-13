import { z } from '@pawly/zod';

// ── Shared regex patterns ────────────────────────────────────────────────

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;

// ── Move shift input schema ─────────────────────────────────────────────
// At least one of targetEmployeeId or targetDate must be provided.
// Uses .superRefine() to avoid ZodEffects (which cannot be .merge()'d).

export const moveShiftInputSchema = z
  .object({
    shiftId: z.string().uuid('Shift ID must be a valid UUID'),
    targetEmployeeId: z.string().uuid('Target employee ID must be a valid UUID').optional(),
    targetDate: z.string().regex(DATE_REGEX, 'Target date must be in YYYY-MM-DD format').optional(),
    acknowledgePublishedChange: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (!data.targetEmployeeId && !data.targetDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one of targetEmployeeId or targetDate must be provided',
        path: ['targetEmployeeId'],
      });
    }
  });
export type MoveShiftInput = z.infer<typeof moveShiftInputSchema>;

// ── Create manual shift input schema ────────────────────────────────────

export const createManualShiftInputSchema = z.object({
  employeeId: z.string().uuid('Employee ID must be a valid UUID'),
  date: z.string().regex(DATE_REGEX, 'Date must be in YYYY-MM-DD format'),
  shiftTypeCode: z.string().min(1, 'Shift type code is required'),
  startTime: z.string().regex(TIME_REGEX, 'Start time must be in HH:MM format'),
  endTime: z.string().regex(TIME_REGEX, 'End time must be in HH:MM format'),
  breakMinutes: z.number().int().min(0).default(0),
  acknowledgePublishedChange: z.boolean().default(false),
});
export type CreateManualShiftInput = z.infer<typeof createManualShiftInputSchema>;

// ── Delete shift input schema ───────────────────────────────────────────

export const deleteShiftInputSchema = z.object({
  shiftId: z.string().uuid('Shift ID must be a valid UUID'),
  acknowledgePublishedChange: z.boolean().default(false),
});
export type DeleteShiftInput = z.infer<typeof deleteShiftInputSchema>;

// ── Pre-validate move input schema ──────────────────────────────────────
// Used for dry-run drop feedback — all fields required.

export const preValidateMoveInputSchema = z.object({
  shiftId: z.string().uuid('Shift ID must be a valid UUID'),
  targetEmployeeId: z.string().uuid('Target employee ID must be a valid UUID'),
  targetDate: z.string().regex(DATE_REGEX, 'Target date must be in YYYY-MM-DD format'),
});
export type PreValidateMoveInput = z.infer<typeof preValidateMoveInputSchema>;

// ── Pre-validate move result schema ─────────────────────────────────────

export const moveValidationResultSchema = z.object({
  hard: z.array(
    z.object({
      rule: z.string(),
      message: z.string(),
    })
  ),
  soft: z.array(
    z.object({
      rule: z.string(),
      message: z.string(),
    })
  ),
});
export type MoveValidationResult = z.infer<typeof moveValidationResultSchema>;
