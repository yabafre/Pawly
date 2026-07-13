import { z } from '@pawly/zod';

// Re-export equity context from planning-generation for convenience
export { equityContextSchema } from './planning-generation.schema';
export type { EquityContext } from './planning-generation.schema';

// ── Publish plan input schema ────────────────────────────────────────

const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

export const publishPlanInputSchema = z.object({
  month: z.string().regex(monthRegex, 'Month must be in YYYY-MM format (e.g., 2026-03)'),
});
export type PublishPlanInput = z.infer<typeof publishPlanInputSchema>;

// ── Publication status schema ────────────────────────────────────────

export const PLANNING_PERIOD_STATUSES = ['DRAFT', 'PUBLISHED'] as const;

export const planningPeriodStatusSchema = z.object({
  id: z.string(),
  clinicId: z.string().uuid(),
  month: z.string().regex(monthRegex),
  status: z.enum(PLANNING_PERIOD_STATUSES),
  publishedAt: z.string().datetime().nullable(),
  publishedBy: z.string().uuid().nullable(),
});
export type PlanningPeriodStatus = z.infer<typeof planningPeriodStatusSchema>;

// ── Publish result schema ────────────────────────────────────────────

export const publishPlanResultSchema = z.object({
  publishedAt: z.string().datetime(),
  totalWithShifts: z.number().int().min(0),
});
export type PublishPlanResult = z.infer<typeof publishPlanResultSchema>;

// ── Publication status query result ──────────────────────────────────

export const publicationStatusResultSchema = z.object({
  status: z.enum(PLANNING_PERIOD_STATUSES),
  publishedAt: z.string().datetime().nullable(),
  publishedBy: z.string().uuid().nullable(),
  amendedAt: z.string().datetime().nullable().optional(),
  amendmentCount: z.number().int().min(0).optional(),
});
export type PublicationStatusResult = z.infer<typeof publicationStatusResultSchema>;
