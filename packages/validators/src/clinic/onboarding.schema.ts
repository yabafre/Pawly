import { z } from "@pawly/zod";

export const WORK_DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export type WorkDay = (typeof WORK_DAYS)[number];

export const updateClinicNameSchema = z.object({
  clinicName: z.string().min(2).max(100),
});

export type UpdateClinicNameInput = z.infer<typeof updateClinicNameSchema>;

export const updateWorkDaysSchema = z.object({
  workDays: z
    .array(z.enum(WORK_DAYS))
    .min(1, "At least one work day is required"),
});

export type UpdateWorkDaysInput = z.infer<typeof updateWorkDaysSchema>;

const timeRegex = /^\d{2}:\d{2}$/;

export const workHoursFieldsSchema = z.object({
  defaultStartTime: z.string().regex(timeRegex, "Invalid time format (HH:MM)"),
  defaultEndTime: z.string().regex(timeRegex, "Invalid time format (HH:MM)"),
});

export const updateWorkHoursSchema = workHoursFieldsSchema.refine(
  (data) => data.defaultEndTime > data.defaultStartTime,
  { message: "End time must be after start time", path: ["defaultEndTime"] },
);

export type UpdateWorkHoursInput = z.infer<typeof updateWorkHoursSchema>;

/** Combined schema for updateClinicConfig tRPC procedure */
export const updateClinicConfigSchema = updateWorkDaysSchema
  .merge(workHoursFieldsSchema)
  .refine(
    (data) => data.defaultEndTime > data.defaultStartTime,
    { message: "End time must be after start time", path: ["defaultEndTime"] },
  );

export type UpdateClinicConfigInput = z.infer<typeof updateClinicConfigSchema>;

export const shiftTypeSchema = z.object({
  name: z.string().min(1).max(50),
  code: z.string().min(1).max(10).toUpperCase(),
  startTime: z.string().regex(timeRegex, "Invalid time format (HH:MM)"),
  endTime: z.string().regex(timeRegex, "Invalid time format (HH:MM)"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color"),
});

export const createShiftTypesSchema = z.object({
  shiftTypes: z
    .array(shiftTypeSchema)
    .min(1, "At least one shift type is required"),
});

export type CreateShiftTypesInput = z.infer<typeof createShiftTypesSchema>;

export const completeOnboardingSchema = z.object({
  clinicName: z.string().min(2).max(100),
  workDays: z.array(z.enum(WORK_DAYS)).min(1),
  defaultStartTime: z.string().regex(timeRegex),
  defaultEndTime: z.string().regex(timeRegex),
  shiftTypes: z.array(shiftTypeSchema).min(1),
});

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
