import { z } from "@pawly/zod";

export const DEVIATION_THRESHOLD_MINUTES = 15;

export const confirmShiftSchema = z.object({
  shiftId: z.string().uuid("Shift ID must be a valid UUID"),
  actualStartTime: z
    .string()
    .datetime("actualStartTime must be a valid ISO 8601 datetime")
    .optional(),
});

export type ConfirmShiftInput = z.infer<typeof confirmShiftSchema>;

export const noShowDetectionSchema = z.object({
  date: z
    .string()
    .regex(
      /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
      "Date must be in YYYY-MM-DD format",
    ),
});

export type NoShowDetectionInput = z.infer<typeof noShowDetectionSchema>;
