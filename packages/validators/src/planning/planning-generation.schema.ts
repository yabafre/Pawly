import { z } from "@pawly/zod";

// ── Month format schema ──────────────────────────────────────────────────

const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

export const monthSchema = z
  .string()
  .regex(monthRegex, "Month must be in YYYY-MM format (e.g., 2026-03)");

// ── Generate plan input schema ───────────────────────────────────────────

export const generatePlanSchema = z.object({
  month: monthSchema,
  templateId: z.string().uuid("Template ID must be a valid UUID"),
});
export type GeneratePlanInput = z.infer<typeof generatePlanSchema>;

// ── List shifts for month schema ─────────────────────────────────────────

export const listShiftsForMonthSchema = z.object({
  month: monthSchema,
});
export type ListShiftsForMonthInput = z.infer<typeof listShiftsForMonthSchema>;

// ── Delete generated shifts schema ───────────────────────────────────────

export const deleteGeneratedShiftsSchema = z.object({
  month: monthSchema,
});
export type DeleteGeneratedShiftsInput = z.infer<
  typeof deleteGeneratedShiftsSchema
>;

// ── Shift assignment schema (output) ─────────────────────────────────────

export const shiftAssignmentSchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  shiftTypeCode: z.string().min(1),
  employeeId: z.string().uuid(),
  employeeName: z.string(),
});
export type ShiftAssignment = z.infer<typeof shiftAssignmentSchema>;

// ── Hole info schema (unfilled slots) ────────────────────────────────────

export const holeInfoSchema = z.object({
  date: z.string(),
  shiftTypeCode: z.string(),
  requiredStaff: z.number().int().min(1),
  assignedStaff: z.number().int().min(0),
  reason: z.string(),
});
export type HoleInfo = z.infer<typeof holeInfoSchema>;

// ── Equity context schema ────────────────────────────────────────────────

export const equityContextSchema = z.object({
  counterType: z.string(),
  currentCount: z.number(),
  maxPerPeriod: z.number(),
  clinicAverage: z.number(),
  trend: z.enum(["below_average", "average", "above_average"]),
});
export type EquityContext = z.infer<typeof equityContextSchema>;

// ── Violation schemas ────────────────────────────────────────────────────

export const hardViolationSchema = z.object({
  ruleId: z.string().uuid(),
  ruleName: z.string(),
  category: z.string(),
  message: z.string(),
  affectedEmployeeId: z.string().uuid().optional(),
  affectedDate: z.string().optional(),
  severity: z.literal("blocking"),
});
export type HardViolation = z.infer<typeof hardViolationSchema>;

export const softViolationSchema = z.object({
  ruleId: z.string().uuid(),
  ruleName: z.string(),
  category: z.string(),
  message: z.string(),
  messageKey: z.string().optional(),
  messageParams: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  affectedEmployeeId: z.string().uuid().optional(),
  affectedDate: z.string().optional(),
  severity: z.literal("warning"),
  equityContext: equityContextSchema.optional(),
});
export type SoftViolation = z.infer<typeof softViolationSchema>;

// ── Generation result schema ─────────────────────────────────────────────

export const generationStatsSchema = z.object({
  totalSlots: z.number().int().min(0),
  filledSlots: z.number().int().min(0),
  holeCount: z.number().int().min(0),
  hardViolationCount: z.number().int().min(0),
  softWarningCount: z.number().int().min(0),
});
export type GenerationStats = z.infer<typeof generationStatsSchema>;

export const generationResultSchema = z.object({
  assignments: z.array(shiftAssignmentSchema),
  holes: z.array(holeInfoSchema),
  violations: z.object({
    hard: z.array(hardViolationSchema),
    soft: z.array(softViolationSchema),
  }),
  stats: generationStatsSchema,
});
export type GenerationResult = z.infer<typeof generationResultSchema>;
