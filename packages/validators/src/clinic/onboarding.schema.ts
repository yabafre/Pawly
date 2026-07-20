import { z } from '@pawly/zod';

export const WORK_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export type WorkDay = (typeof WORK_DAYS)[number];

export const updateClinicNameSchema = z.object({
  clinicName: z.string().min(2).max(100),
});

export type UpdateClinicNameInput = z.infer<typeof updateClinicNameSchema>;

export const updateWorkDaysSchema = z.object({
  workDays: z.array(z.enum(WORK_DAYS)).min(1, 'At least one work day is required'),
});

export type UpdateWorkDaysInput = z.infer<typeof updateWorkDaysSchema>;

// Story 13-3 (KON-132), aped-review N2 — reject out-of-range hours/minutes so the
// engine's toMinutes never derives a wrong absolute interval from e.g. "24:00".
export const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const workHoursFieldsSchema = z.object({
  defaultStartTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)'),
  defaultEndTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)'),
  is24_7: z.boolean().default(false),
});

export const updateWorkHoursSchema = workHoursFieldsSchema.refine(
  (data) => data.is24_7 || data.defaultEndTime > data.defaultStartTime,
  { message: 'End time must be after start time', path: ['defaultEndTime'] }
);

export type UpdateWorkHoursInput = z.infer<typeof updateWorkHoursSchema>;

/** Combined schema for updateClinicConfig tRPC procedure */
export const updateClinicConfigSchema = updateWorkDaysSchema
  .merge(workHoursFieldsSchema)
  .refine((data) => data.is24_7 || data.defaultEndTime > data.defaultStartTime, {
    message: 'End time must be after start time',
    path: ['defaultEndTime'],
  });

export type UpdateClinicConfigInput = z.infer<typeof updateClinicConfigSchema>;

export const shiftTypeFieldsSchema = z.object({
  name: z.string().min(1).max(50),
  code: z.string().min(1).max(10).toUpperCase(),
  startTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)'),
  endTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)'),
  breakMinutes: z.number().int().min(0).max(300).default(0),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
});

// L.3121-16 (Story 13-4) — a shift with > 6h NET worked (gross - break, overnight-wrap
// aware) requires at least a 20-min break. Shared by every shift-type create path so an
// admin cannot persist a type that generation/manual writes would then always reject.
export const MANDATORY_BREAK_MINUTES = 20;
export const BREAK_REQUIRED_AFTER_NET_MINUTES = 360;

export function shiftBreakRuleOk(data: {
  startTime: string;
  endTime: string;
  breakMinutes?: number;
}): boolean {
  const [sh, sm] = data.startTime.split(':').map(Number);
  const [eh, em] = data.endTime.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return true; // let the regex guard report format errors
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const gross = end >= start ? end - start : 1440 - start + end;
  const net = gross - (data.breakMinutes ?? 0);
  return (
    net <= BREAK_REQUIRED_AFTER_NET_MINUTES || (data.breakMinutes ?? 0) >= MANDATORY_BREAK_MINUTES
  );
}

// Story 13-3 (KON-132) — a shift type may cross midnight (22:00 -> 06:00); the
// engine reads endTime < startTime as an overnight wrap (see shift-interval.ts).
// Only a zero-length slot is meaningless, so equality is what we reject. Clinic
// opening hours and special days keep their end > start rule below.
export const shiftTypeSchema = shiftTypeFieldsSchema
  .refine((data) => data.endTime !== data.startTime, {
    message: 'Start and end times must differ',
    path: ['endTime'],
  })
  .refine(shiftBreakRuleOk, {
    message: 'A shift over 6h worked requires at least a 20-minute break',
    path: ['breakMinutes'],
  });

export const createShiftTypesSchema = z.object({
  shiftTypes: z.array(shiftTypeSchema).min(1, 'At least one shift type is required'),
});

export type CreateShiftTypesInput = z.infer<typeof createShiftTypesSchema>;

export const completeOnboardingSchema = z
  .object({
    clinicName: z.string().min(2).max(100),
    workDays: z.array(z.enum(WORK_DAYS)).min(1),
    defaultStartTime: z.string().regex(timeRegex),
    defaultEndTime: z.string().regex(timeRegex),
    is24_7: z.boolean().default(false),
    shiftTypes: z.array(shiftTypeSchema).min(1),
  })
  .refine((data) => data.is24_7 || data.defaultEndTime > data.defaultStartTime, {
    message: 'End time must be after start time',
    path: ['defaultEndTime'],
  });

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
