import { describe, it, expect } from 'vitest';
import {
  createShiftTypeSchema,
  updateShiftTypeSchema,
  deleteShiftTypeSchema,
  listShiftTypesSchema,
} from './shift-type.schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validShiftType = {
  name: 'Morning',
  code: 'AM',
  startTime: '08:00',
  endTime: '12:00',
  color: '#FF5733',
};

// ---------------------------------------------------------------------------
// createShiftTypeSchema
// ---------------------------------------------------------------------------

describe('createShiftTypeSchema', () => {
  it('should accept valid shift type data', () => {
    const result = createShiftTypeSchema.safeParse(validShiftType);
    expect(result.success).toBe(true);
  });

  // Story 13-3 (KON-132), aped-review N2 — the HH:MM regex must reject an
  // out-of-range hour or minute (the loose \d{2}:\d{2} accepted 24:00 / 08:99,
  // which toMinutes would silently turn into a wrong absolute interval).
  it.each(['24:00', '08:99', '30:15', '12:60'])('should reject the out-of-range time %s', (bad) => {
    expect(createShiftTypeSchema.safeParse({ ...validShiftType, startTime: bad }).success).toBe(
      false
    );
  });

  it('should still accept the boundary times 00:00 and 23:59', () => {
    expect(
      createShiftTypeSchema.safeParse({
        ...validShiftType,
        startTime: '00:00',
        endTime: '23:59',
      }).success
    ).toBe(true);
  });

  it('should reject empty name', () => {
    const result = createShiftTypeSchema.safeParse({
      ...validShiftType,
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject name longer than 50 chars', () => {
    const result = createShiftTypeSchema.safeParse({
      ...validShiftType,
      name: 'A'.repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty code', () => {
    const result = createShiftTypeSchema.safeParse({
      ...validShiftType,
      code: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject code longer than 10 chars', () => {
    const result = createShiftTypeSchema.safeParse({
      ...validShiftType,
      code: 'ABCDEFGHIJK',
    });
    expect(result.success).toBe(false);
  });

  it('should uppercase the code', () => {
    const result = createShiftTypeSchema.safeParse({
      ...validShiftType,
      code: 'morning',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe('MORNING');
    }
  });

  it('should reject invalid time format', () => {
    const result = createShiftTypeSchema.safeParse({
      ...validShiftType,
      startTime: '8:00',
    });
    expect(result.success).toBe(false);
  });

  // Story 13-3 (KON-132) — AC5 (verbatim): "Given an admin defining a shift type
  // in onboarding or in settings, When they submit startTime: '22:00' /
  // endTime: '06:00', Then it is accepted and persisted; and endTime === startTime
  // is still rejected (zero-length slot)."
  it('accepts an overnight shift type (endTime before startTime)', () => {
    const result = createShiftTypeSchema.safeParse({
      ...validShiftType,
      startTime: '22:00',
      endTime: '06:00',
    });
    expect(result.success).toBe(true);
  });

  it('should reject when endTime equals startTime', () => {
    const result = createShiftTypeSchema.safeParse({
      ...validShiftType,
      startTime: '10:00',
      endTime: '10:00',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid hex color', () => {
    const result = createShiftTypeSchema.safeParse({
      ...validShiftType,
      color: 'red',
    });
    expect(result.success).toBe(false);
  });

  it('should reject hex color without hash', () => {
    const result = createShiftTypeSchema.safeParse({
      ...validShiftType,
      color: 'FF5733',
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid 6-digit hex color', () => {
    const result = createShiftTypeSchema.safeParse({
      ...validShiftType,
      color: '#4F46E5',
    });
    expect(result.success).toBe(true);
  });

  it('should default breakMinutes to 0 when not provided', () => {
    const result = createShiftTypeSchema.safeParse(validShiftType);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.breakMinutes).toBe(0);
    }
  });

  it('should accept explicit breakMinutes', () => {
    const result = createShiftTypeSchema.safeParse({
      ...validShiftType,
      breakMinutes: 60,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.breakMinutes).toBe(60);
    }
  });

  it('should reject breakMinutes below 0', () => {
    const result = createShiftTypeSchema.safeParse({
      ...validShiftType,
      breakMinutes: -1,
    });
    expect(result.success).toBe(false);
  });

  it('should reject breakMinutes above 300', () => {
    const result = createShiftTypeSchema.safeParse({
      ...validShiftType,
      breakMinutes: 301,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateShiftTypeSchema
// ---------------------------------------------------------------------------

describe('updateShiftTypeSchema', () => {
  it('should accept valid update with id only', () => {
    const result = updateShiftTypeSchema.safeParse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    });
    expect(result.success).toBe(true);
  });

  it('should accept partial update with name', () => {
    const result = updateShiftTypeSchema.safeParse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Afternoon',
    });
    expect(result.success).toBe(true);
  });

  it('should accept full update', () => {
    const result = updateShiftTypeSchema.safeParse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      ...validShiftType,
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid UUID', () => {
    const result = updateShiftTypeSchema.safeParse({
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  // Story 13-3 (KON-132) — AC5: a shift type may cross midnight on update too.
  it('accepts an overnight shift type on update', () => {
    const result = updateShiftTypeSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      startTime: '22:00',
      endTime: '06:00',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a zero-length shift type on update', () => {
    const result = updateShiftTypeSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      startTime: '09:00',
      endTime: '09:00',
    });
    expect(result.success).toBe(false);
  });

  it('should allow startTime only (no endTime to compare)', () => {
    const result = updateShiftTypeSchema.safeParse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      startTime: '14:00',
    });
    expect(result.success).toBe(true);
  });

  it('should allow endTime only (no startTime to compare)', () => {
    const result = updateShiftTypeSchema.safeParse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      endTime: '18:00',
    });
    expect(result.success).toBe(true);
  });

  it('should uppercase the code in update', () => {
    const result = updateShiftTypeSchema.safeParse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      code: 'pm',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe('PM');
    }
  });

  it('should accept optional breakMinutes in update', () => {
    const result = updateShiftTypeSchema.safeParse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      breakMinutes: 45,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.breakMinutes).toBe(45);
    }
  });

  it('should reject breakMinutes above 300 in update', () => {
    const result = updateShiftTypeSchema.safeParse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      breakMinutes: 301,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteShiftTypeSchema
// ---------------------------------------------------------------------------

describe('deleteShiftTypeSchema', () => {
  it('should accept valid UUID', () => {
    const result = deleteShiftTypeSchema.safeParse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid UUID', () => {
    const result = deleteShiftTypeSchema.safeParse({
      id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing id', () => {
    const result = deleteShiftTypeSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listShiftTypesSchema
// ---------------------------------------------------------------------------

describe('listShiftTypesSchema', () => {
  it('should accept empty object', () => {
    const result = listShiftTypesSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
