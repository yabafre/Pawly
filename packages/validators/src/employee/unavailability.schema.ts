import { z } from "@pawly/zod";

export const UNAVAILABILITY_TYPES = ["SCHOOL", "VACATION", "SICK", "OTHER"] as const;
export type UnavailabilityType = (typeof UNAVAILABILITY_TYPES)[number];

const weekdaySchema = z.number().int().min(1).max(7);

const hasUniqueValues = (values: number[]) => new Set(values).size === values.length;

const hasValidDateRange = (startDate?: string, endDate?: string) => {
  if (!startDate || !endDate) return true;
  return new Date(endDate) >= new Date(startDate);
};

const unavailabilityFieldsSchema = z
  .object({
    employeeId: z.string().uuid(),
    type: z.enum(UNAVAILABILITY_TYPES),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    reason: z.string().max(500).optional().or(z.literal("")),
    daysOfWeek: z.array(weekdaySchema).default([]),
  })
  .refine((data) => hasValidDateRange(data.startDate, data.endDate), {
    path: ["endDate"],
    message: "End date must be after or equal to start date",
  })
  .refine((data) => hasUniqueValues(data.daysOfWeek), {
    path: ["daysOfWeek"],
    message: "Duplicate weekdays are not allowed",
  });

export const createUnavailabilitySchema = unavailabilityFieldsSchema;
export type CreateUnavailabilityInput = z.infer<typeof createUnavailabilitySchema>;

export const updateUnavailabilitySchema = z
  .object({
    id: z.string().uuid(),
    employeeId: z.string().uuid().optional(),
    type: z.enum(UNAVAILABILITY_TYPES).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    reason: z.string().max(500).optional().or(z.literal("")),
    daysOfWeek: z.array(weekdaySchema).optional(),
  })
  .refine((data) => hasValidDateRange(data.startDate, data.endDate), {
    path: ["endDate"],
    message: "End date must be after or equal to start date",
  })
  .refine((data) => (data.daysOfWeek ? hasUniqueValues(data.daysOfWeek) : true), {
    path: ["daysOfWeek"],
    message: "Duplicate weekdays are not allowed",
  });

export type UpdateUnavailabilityInput = z.infer<typeof updateUnavailabilitySchema>;

export const unavailabilityIdSchema = z.object({
  id: z.string().uuid(),
});

export type UnavailabilityIdInput = z.infer<typeof unavailabilityIdSchema>;

export const listUnavailabilitiesSchema = z.object({
  employeeId: z.string().uuid(),
});

export type ListUnavailabilitiesInput = z.infer<typeof listUnavailabilitiesSchema>;

export const hardRuleRangeSchema = z
  .object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    employeeIds: z.array(z.string().uuid()).optional(),
  })
  .refine((data) => hasValidDateRange(data.startDate, data.endDate), {
    path: ["endDate"],
    message: "End date must be after or equal to start date",
  });

export type HardRuleRangeInput = z.infer<typeof hardRuleRangeSchema>;

