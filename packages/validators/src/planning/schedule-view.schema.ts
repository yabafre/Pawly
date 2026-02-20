import { z } from "@pawly/zod";

// ── Schedule view input schema ────────────────────────────────────────

const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

export const scheduleViewInputSchema = z.object({
  month: z
    .string()
    .regex(monthRegex, "Month must be in YYYY-MM format (e.g., 2026-03)"),
});
export type ScheduleViewInput = z.infer<typeof scheduleViewInputSchema>;

// ── Week navigation schema ────────────────────────────────────────────

export const weekNavigationSchema = z.object({
  weekOffset: z
    .number()
    .int()
    .min(0)
    .max(5, "A month has at most 5-6 weeks"),
});
export type WeekNavigation = z.infer<typeof weekNavigationSchema>;

// ── Schedule employee schema ──────────────────────────────────────────

export const scheduleEmployeeSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  color: z.string().nullable(),
  jobType: z.string().min(1),
  contractHours: z.number().min(0),
});
export type ScheduleEmployee = z.infer<typeof scheduleEmployeeSchema>;

// ── Schedule day info schema ──────────────────────────────────────────

export const scheduleDayInfoSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  dayOfWeek: z.number().int().min(1).max(7),
  isWorkDay: z.boolean(),
  isClosed: z.boolean(),
  isSpecialDay: z.boolean(),
  specialDayLabel: z.string().optional(),
});
export type ScheduleDayInfo = z.infer<typeof scheduleDayInfoSchema>;

// ── Schedule shift schema ─────────────────────────────────────────────

export const scheduleShiftSchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
  shiftTypeCode: z.string().min(1),
  breakMinutes: z.number().int().min(0),
  source: z.enum(["GENERATED", "MANUAL"]),
  employeeId: z.string().uuid(),
  isConfirmed: z.boolean(),
});
export type ScheduleShift = z.infer<typeof scheduleShiftSchema>;

// ── Schedule unavailability schema ────────────────────────────────────

export const scheduleUnavailabilitySchema = z.object({
  employeeId: z.string().uuid(),
  date: z.string(),
  type: z.enum(["VACATION", "SICK", "SCHOOL", "OTHER"]),
  reason: z.string().optional(),
});
export type ScheduleUnavailability = z.infer<
  typeof scheduleUnavailabilitySchema
>;

// ── Schedule hole schema ──────────────────────────────────────────────

export const scheduleHoleSchema = z.object({
  date: z.string(),
  shiftTypeCode: z.string().min(1),
  requiredStaff: z.number().int().min(1),
  assignedStaff: z.number().int().min(0),
  reason: z.string(),
});
export type ScheduleHole = z.infer<typeof scheduleHoleSchema>;

// ── Schedule view data schema (full response) ─────────────────────────

export const scheduleViewDataSchema = z.object({
  month: z.string().regex(monthRegex),
  employees: z.array(scheduleEmployeeSchema),
  days: z.array(scheduleDayInfoSchema),
  shifts: z.array(scheduleShiftSchema),
  unavailabilities: z.array(scheduleUnavailabilitySchema),
  holes: z.array(scheduleHoleSchema),
  violations: z.object({
    hard: z.array(
      z.object({
        ruleId: z.string().uuid(),
        ruleName: z.string(),
        category: z.string(),
        message: z.string(),
        affectedEmployeeId: z.string().uuid().optional(),
        affectedDate: z.string().optional(),
        severity: z.literal("blocking"),
      })
    ),
    soft: z.array(
      z.object({
        ruleId: z.string().uuid(),
        ruleName: z.string(),
        category: z.string(),
        message: z.string(),
        affectedEmployeeId: z.string().uuid().optional(),
        affectedDate: z.string().optional(),
        severity: z.literal("warning"),
      })
    ),
  }),
  templateId: z.string().uuid().optional(),
});
export type ScheduleViewData = z.infer<typeof scheduleViewDataSchema>;
