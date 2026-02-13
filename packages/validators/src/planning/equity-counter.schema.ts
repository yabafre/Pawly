import { z } from "@pawly/zod";

// ── Equity Counter Types ────────────────────────────────────────────────────

export const EQUITY_COUNTER_TYPES = [
  "SATURDAY_WORKED",
  "WEEKEND_TOTAL",
  "HOLIDAY_WORKED",
  "OVERTIME_HOURS",
] as const;

export type EquityCounterType = (typeof EQUITY_COUNTER_TYPES)[number];

export const equityCounterTypeSchema = z.enum(EQUITY_COUNTER_TYPES);

// ── Get Equity Counters Schema ──────────────────────────────────────────────

export const getEquityCountersSchema = z.object({
  year: z.number().int().min(2024).max(2100),
  months: z
    .array(z.number().int().min(1).max(12))
    .min(1, "At least one month is required"),
  counterTypes: z.array(equityCounterTypeSchema).optional(),
});
export type GetEquityCountersInput = z.infer<typeof getEquityCountersSchema>;

// ── Get Quarterly Summary Schema ────────────────────────────────────────────

export const getQuarterlySummarySchema = z.object({
  year: z.number().int().min(2024).max(2100),
  quarter: z.number().int().min(1).max(4),
});
export type GetQuarterlySummaryInput = z.infer<
  typeof getQuarterlySummarySchema
>;

// ── Recalculate Counters Schema ─────────────────────────────────────────────

export const recalculateCountersSchema = z.object({
  year: z.number().int().min(2024).max(2100),
  month: z.number().int().min(1).max(12),
});
export type RecalculateCountersInput = z.infer<
  typeof recalculateCountersSchema
>;
