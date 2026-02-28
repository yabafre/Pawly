import { z } from "@pawly/zod";

export const getEmployeeScheduleSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be in YYYY-MM format")
    .optional(),
});

export type GetEmployeeScheduleInput = z.infer<typeof getEmployeeScheduleSchema>;

export const employeeShiftSchema = z.object({
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  shiftTypeCode: z.string(),
  breakMinutes: z.number().int().min(0),
  isConfirmed: z.boolean(),
  source: z.enum(["GENERATED", "MANUAL"]),
});

export const employeeUnavailabilitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["VACATION", "SICK", "SCHOOL", "OTHER"]),
  reason: z.string().optional(),
});

export const employeeWeeklySummarySchema = z.object({
  weekNumber: z.number().int().min(1).max(53),
  totalMinutes: z.number().int().min(0),
  shiftCount: z.number().int().min(0),
  contractMinutes: z.number().int().min(0),
});

export const employeeShiftTypeInfoSchema = z.object({
  code: z.string(),
  label: z.string(),
  color: z.string(),
  breakMinutes: z.number().int().min(0),
});

export const employeeScheduleDataSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  employee: z.object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    jobType: z.string(),
    contractHours: z.number().int().min(1),
    color: z.string(),
  }),
  shifts: z.array(employeeShiftSchema),
  unavailabilities: z.array(employeeUnavailabilitySchema),
  publicationStatus: z.object({
    status: z.enum(["DRAFT", "PUBLISHED"]),
    publishedAt: z.string().nullable(),
  }),
  weeklySummary: z.array(employeeWeeklySummarySchema),
  shiftTypes: z.array(employeeShiftTypeInfoSchema),
});

export type EmployeeScheduleDataInput = z.infer<typeof employeeScheduleDataSchema>;
