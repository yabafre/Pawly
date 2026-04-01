import { z } from "@pawly/zod";

export const VARIANCE_EVENT_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;
export type VarianceEventStatus = (typeof VARIANCE_EVENT_STATUSES)[number];

export const VARIANCE_EVENT_TYPES = [
  "CLOCK_IN_DEVIATION",
  "CLOCK_OUT_DEVIATION",
  "NO_SHOW",
  "EARLY_DEPARTURE",
] as const;
export type VarianceEventType = (typeof VARIANCE_EVENT_TYPES)[number];

export const listVarianceEventsSchema = z.object({
  status: z.enum(VARIANCE_EVENT_STATUSES).optional(),
  employeeId: z.string().uuid().optional(),
  month: z
    .string()
    .regex(
      /^\d{4}-(0[1-9]|1[0-2])$/,
      "Month must be in YYYY-MM format (01-12)",
    )
    .optional(),
  type: z.enum(VARIANCE_EVENT_TYPES).optional(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(100).default(10),
});

export type ListVarianceEventsInput = z.infer<typeof listVarianceEventsSchema>;

export const reviewVarianceSchema = z
  .object({
    varianceId: z.string().uuid(),
    action: z.enum(["approve", "reject"]),
    exceptionNote: z.string().max(500).optional(),
  })
  .refine(
    (data) => {
      if (data.action === "reject") {
        return (
          data.exceptionNote !== undefined &&
          data.exceptionNote !== null &&
          data.exceptionNote.trim().length > 0
        );
      }
      return true;
    },
    {
      path: ["exceptionNote"],
      message: "Exception note is required when rejecting a variance event",
    },
  );

export type ReviewVarianceInput = z.infer<typeof reviewVarianceSchema>;

export const getVarianceStatsSchema = z.object({
  month: z
    .string()
    .regex(
      /^\d{4}-(0[1-9]|1[0-2])$/,
      "Month must be in YYYY-MM format (01-12)",
    )
    .optional(),
  status: z.enum(VARIANCE_EVENT_STATUSES).optional(),
  employeeId: z.string().uuid().optional(),
  type: z.enum(VARIANCE_EVENT_TYPES).optional(),
});

export type GetVarianceStatsInput = z.infer<typeof getVarianceStatsSchema>;

export const exportVarianceSchema = z.object({
  month: z
    .string()
    .regex(
      /^\d{4}-(0[1-9]|1[0-2])$/,
      "Month must be in YYYY-MM format (01-12)",
    ),
  employeeId: z.string().uuid().optional(),
  locale: z.enum(["fr", "en"]).default("fr"),
});

export type ExportVarianceInput = z.infer<typeof exportVarianceSchema>;
