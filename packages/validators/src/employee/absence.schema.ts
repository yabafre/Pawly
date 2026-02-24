import { z } from "@pawly/zod";

export const ABSENCE_TYPES = [
  "PAID_LEAVE",
  "SICK_LEAVE",
  "TRAINING",
  "CHILD_SICK",
  "OTHER",
] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];

export const ABSENCE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type AbsenceStatus = (typeof ABSENCE_STATUSES)[number];

const hasValidDateRange = (startDate?: string, endDate?: string) => {
  if (!startDate || !endDate) return true;
  return new Date(endDate) >= new Date(startDate);
};

export const createAbsenceRequestSchema = z
  .object({
    employeeId: z.string().uuid(),
    type: z.enum(ABSENCE_TYPES),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    reason: z.string().max(500).optional().or(z.literal("")),
  })
  .refine((data) => hasValidDateRange(data.startDate, data.endDate), {
    path: ["endDate"],
    message: "End date must be after or equal to start date",
  });

export type CreateAbsenceRequestInput = z.infer<
  typeof createAbsenceRequestSchema
>;

export const reviewAbsenceSchema = z
  .object({
    absenceId: z.string().uuid(),
    action: z.enum(["approve", "reject"]),
    rejectionReason: z.string().max(500).optional(),
  })
  .refine(
    (data) => {
      if (data.action === "reject") {
        return (
          data.rejectionReason !== undefined &&
          data.rejectionReason !== null &&
          data.rejectionReason.trim().length > 0
        );
      }
      return true;
    },
    {
      path: ["rejectionReason"],
      message: "Rejection reason is required when rejecting an absence",
    },
  );

export type ReviewAbsenceInput = z.infer<typeof reviewAbsenceSchema>;

export const listAbsencesSchema = z.object({
  employeeId: z.string().uuid().optional(),
  status: z.enum(ABSENCE_STATUSES).optional(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be in YYYY-MM format (01-12)")
    .optional(),
});

export type ListAbsencesInput = z.infer<typeof listAbsencesSchema>;

export const absenceIdSchema = z.object({
  id: z.string().uuid(),
});

export type AbsenceIdInput = z.infer<typeof absenceIdSchema>;

export const adminCreateAbsenceSchema = createAbsenceRequestSchema;

export type AdminCreateAbsenceInput = z.infer<
  typeof adminCreateAbsenceSchema
>;

export const checkAbsenceOverlapSchema = z.object({
  employeeId: z.string().uuid(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export type CheckAbsenceOverlapInput = z.infer<
  typeof checkAbsenceOverlapSchema
>;
