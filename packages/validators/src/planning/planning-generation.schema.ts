import { z } from '@pawly/zod';

// ── Month format schema ──────────────────────────────────────────────────

const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

export const monthSchema = z
  .string()
  .regex(monthRegex, 'Month must be in YYYY-MM format (e.g., 2026-03)');

// ── Generate plan input schema ───────────────────────────────────────────

export const generatePlanSchema = z.object({
  month: monthSchema,
  templateId: z.string().uuid('Template ID must be a valid UUID'),
  // Story 11-1 — bulk regeneration now honours the 7-6 published-change guard.
  acknowledgePublishedChange: z.boolean().default(false),
  // Story 12-1 (KON-129) — opt-in exact-solver improve pass. Default preserves
  // today's behavior byte-for-byte.
  engine: z.enum(['greedy', 'cpsat']).default('greedy'),
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
  // Story 11-1 — purging generated shifts of a published month needs ack.
  acknowledgePublishedChange: z.boolean().default(false),
});
export type DeleteGeneratedShiftsInput = z.infer<typeof deleteGeneratedShiftsSchema>;

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
  trend: z.enum(['below_average', 'average', 'above_average']),
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
  severity: z.literal('blocking'),
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
  severity: z.literal('warning'),
  equityContext: equityContextSchema.optional(),
});
export type SoftViolation = z.infer<typeof softViolationSchema>;

// ── Solver outcome (Story 13-6, KON-137 — T6/T11) ────────────────────────

// The reason the exact (cpsat) improve pass did or didn't serve its plan. Present
// only when the exact engine was requested; a greedy request omits it so a Starter
// response never carries solver internals (tier-gate invariant #7).
export const solverOutcomeSchema = z.enum([
  'served', // cpsat plan was served (strictly better + re-validated)
  'engine-unavailable', // solver failed to load/run (e.g. Node < 22.12) — greedy served
  'infeasible', // solver proved no valid schedule — greedy served
  'budget-exhausted', // solver found no solution within its deterministic budget — greedy served
  'no-improvement', // solver ran but did not strictly beat greedy — greedy served
  'rejected-revalidation', // solver plan failed the re-validation replay — greedy served
]);
export type SolverOutcome = z.infer<typeof solverOutcomeSchema>;

// ── Generation result schema ─────────────────────────────────────────────

export const generationStatsSchema = z.object({
  totalSlots: z.number().int().min(0),
  filledSlots: z.number().int().min(0),
  holeCount: z.number().int().min(0),
  hardViolationCount: z.number().int().min(0),
  softWarningCount: z.number().int().min(0),
  // Story 12-1 — which engine produced the SERVED assignments ('cpsat' only when
  // the solver strictly improved on greedy+repair and re-validation passed).
  engine: z.enum(['greedy', 'cpsat']).default('greedy'),
  // Story 13-6 (KON-137) — why the cpsat pass did/didn't serve. Optional: omitted
  // for greedy requests so a Starter response never carries solver internals (#7).
  solverOutcome: solverOutcomeSchema.optional(),
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
