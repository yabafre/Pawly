import { describe, expect, it } from 'vitest';
import { updateClinicOperationalConfigSchema } from './operational-config.schema';

const validPayload = {
  workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  defaultStartTime: '08:30',
  defaultEndTime: '18:30',
  closedDays: [
    {
      date: '2026-12-25',
      reason: 'Christmas',
    },
  ],
  specialDays: [
    {
      date: '2026-12-24',
      startTime: '09:00',
      endTime: '14:00',
      label: 'Half-day',
    },
  ],
};

describe('updateClinicOperationalConfigSchema', () => {
  it('accepts a valid payload', () => {
    const result = updateClinicOperationalConfigSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects empty workDays', () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      workDays: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects default end time before default start time', () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      defaultStartTime: '18:00',
      defaultEndTime: '08:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate closed day dates', () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      closedDays: [
        { date: '2026-12-25', reason: 'Christmas' },
        { date: '2026-12-25', reason: 'Duplicate' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate special day dates', () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      specialDays: [
        {
          date: '2026-12-24',
          startTime: '09:00',
          endTime: '14:00',
          label: 'Half-day',
        },
        {
          date: '2026-12-24',
          startTime: '10:00',
          endTime: '13:00',
          label: 'Duplicate',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects special day endTime before startTime', () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      specialDays: [
        {
          date: '2026-12-24',
          startTime: '14:00',
          endTime: '10:00',
          label: 'Invalid',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid date format', () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      closedDays: [{ date: '24-12-2026', reason: 'Invalid' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a date that is both closed and special', () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      closedDays: [{ date: '2026-12-25', reason: 'Holiday' }],
      specialDays: [
        {
          date: '2026-12-25',
          startTime: '09:00',
          endTime: '12:00',
          label: 'Conflict',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  // AC-2 (verbatim from story 5-7-clinic-24-7-hours):
  //   Given is24_7=true, When I submit, Then the defaultEndTime > defaultStartTime
  //   validation is NOT enforced (a 24/7 clinic may keep any/identical times).
  it('accepts equal times when is24_7 is true', () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      defaultStartTime: '00:00',
      defaultEndTime: '00:00',
      is24_7: true,
    });
    expect(result.success).toBe(true);
  });

  // AC-3 (verbatim from story 5-7-clinic-24-7-hours):
  //   Given is24_7=false (default), When I submit, Then existing behaviour is
  //   unchanged (end > start enforced; invalid time format rejected).
  it('still rejects end <= start when is24_7 is false', () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      defaultStartTime: '18:00',
      defaultEndTime: '09:00',
      is24_7: false,
    });
    expect(result.success).toBe(false);
  });

  it('defaults is24_7 to false when omitted', () => {
    const result = updateClinicOperationalConfigSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.is24_7).toBe(false);
  });
});
