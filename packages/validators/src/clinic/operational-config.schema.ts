import { z } from '@pawly/zod';
import { WORK_DAYS } from './onboarding.schema';

const timeRegex = /^\d{2}:\d{2}$/;
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const isValidIsoDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
};

export const clinicClosedDayInputSchema = z.object({
  date: z
    .string()
    .regex(isoDateRegex, 'Invalid date format (YYYY-MM-DD)')
    .refine(isValidIsoDate, 'Invalid date value'),
  reason: z.string().trim().max(200).optional(),
});

export type ClinicClosedDayInput = z.infer<typeof clinicClosedDayInputSchema>;

export const clinicSpecialDayInputSchema = z
  .object({
    date: z
      .string()
      .regex(isoDateRegex, 'Invalid date format (YYYY-MM-DD)')
      .refine(isValidIsoDate, 'Invalid date value'),
    startTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)'),
    endTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)'),
    label: z.string().trim().max(100).optional(),
  })
  .refine((value) => value.endTime > value.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

export type ClinicSpecialDayInput = z.infer<typeof clinicSpecialDayInputSchema>;

export const updateClinicOperationalConfigSchema = z
  .object({
    workDays: z.array(z.enum(WORK_DAYS)).min(1, 'At least one work day is required'),
    defaultStartTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)'),
    defaultEndTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)'),
    is24_7: z.boolean().default(false),
    closedDays: z.array(clinicClosedDayInputSchema),
    specialDays: z.array(clinicSpecialDayInputSchema),
  })
  .superRefine((data, ctx) => {
    if (!data.is24_7 && data.defaultEndTime <= data.defaultStartTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End time must be after start time',
        path: ['defaultEndTime'],
      });
    }

    const closedDateSet = new Set<string>();
    data.closedDays.forEach((item, index) => {
      if (closedDateSet.has(item.date)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate closed day date',
          path: ['closedDays', index, 'date'],
        });
      }
      closedDateSet.add(item.date);
    });

    const specialDateSet = new Set<string>();
    data.specialDays.forEach((item, index) => {
      if (specialDateSet.has(item.date)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate special day date',
          path: ['specialDays', index, 'date'],
        });
      }
      if (closedDateSet.has(item.date)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A date cannot be both closed and special',
          path: ['specialDays', index, 'date'],
        });
      }
      specialDateSet.add(item.date);
    });
  });

export type UpdateClinicOperationalConfigInput = z.infer<
  typeof updateClinicOperationalConfigSchema
>;

export const clinicClosedDaySchema = z.object({
  id: z.string(),
  date: z.string().regex(isoDateRegex, 'Invalid date format (YYYY-MM-DD)'),
  reason: z.string().nullable(),
});

export const clinicSpecialDaySchema = z.object({
  id: z.string(),
  date: z.string().regex(isoDateRegex, 'Invalid date format (YYYY-MM-DD)'),
  startTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)'),
  endTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)'),
  label: z.string().nullable(),
});

export const clinicOperationalConfigSchema = z.object({
  workDays: z.array(z.enum(WORK_DAYS)),
  defaultStartTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)'),
  defaultEndTime: z.string().regex(timeRegex, 'Invalid time format (HH:MM)'),
  is24_7: z.boolean(),
  closedDays: z.array(clinicClosedDaySchema),
  specialDays: z.array(clinicSpecialDaySchema),
});

export type ClinicOperationalConfig = z.infer<typeof clinicOperationalConfigSchema>;
