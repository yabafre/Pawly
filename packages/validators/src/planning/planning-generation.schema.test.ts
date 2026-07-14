import { describe, it, expect } from 'vitest';
import {
  generatePlanSchema,
  listShiftsForMonthSchema,
  deleteGeneratedShiftsSchema,
  shiftAssignmentSchema,
  holeInfoSchema,
  hardViolationSchema,
  softViolationSchema,
  generationResultSchema,
} from './planning-generation.schema';

describe('generatePlanSchema', () => {
  it('should accept valid input with YYYY-MM month and UUID templateId', () => {
    const result = generatePlanSchema.safeParse({
      month: '2026-03',
      templateId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('should accept month at year boundaries', () => {
    expect(
      generatePlanSchema.safeParse({
        month: '2026-01',
        templateId: '550e8400-e29b-41d4-a716-446655440000',
      }).success
    ).toBe(true);

    expect(
      generatePlanSchema.safeParse({
        month: '2026-12',
        templateId: '550e8400-e29b-41d4-a716-446655440000',
      }).success
    ).toBe(true);
  });

  it("should reject month format '2026-3' (not zero-padded)", () => {
    const result = generatePlanSchema.safeParse({
      month: '2026-3',
      templateId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });

  it("should reject month format 'March 2026'", () => {
    const result = generatePlanSchema.safeParse({
      month: 'March 2026',
      templateId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });

  it("should reject month '2026-00' (invalid month)", () => {
    const result = generatePlanSchema.safeParse({
      month: '2026-00',
      templateId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });

  it("should reject month '2026-13' (invalid month)", () => {
    const result = generatePlanSchema.safeParse({
      month: '2026-13',
      templateId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid UUID for templateId', () => {
    const result = generatePlanSchema.safeParse({
      month: '2026-03',
      templateId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing month', () => {
    const result = generatePlanSchema.safeParse({
      templateId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing templateId', () => {
    const result = generatePlanSchema.safeParse({
      month: '2026-03',
    });
    expect(result.success).toBe(false);
  });
});

describe('generatePlanSchema.engine (KON-129)', () => {
  it('defaults to greedy', () => {
    const parsed = generatePlanSchema.parse({
      month: '2026-08',
      templateId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(parsed.engine).toBe('greedy');
  });

  it('accepts cpsat and rejects unknown engines', () => {
    expect(
      generatePlanSchema.parse({
        month: '2026-08',
        templateId: '123e4567-e89b-12d3-a456-426614174000',
        engine: 'cpsat',
      }).engine
    ).toBe('cpsat');
    expect(() =>
      generatePlanSchema.parse({
        month: '2026-08',
        templateId: '123e4567-e89b-12d3-a456-426614174000',
        engine: 'simplex',
      })
    ).toThrow();
  });
});

describe('listShiftsForMonthSchema', () => {
  it('should accept valid YYYY-MM month', () => {
    const result = listShiftsForMonthSchema.safeParse({ month: '2026-03' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid month format', () => {
    const result = listShiftsForMonthSchema.safeParse({ month: '2026-3' });
    expect(result.success).toBe(false);
  });
});

describe('deleteGeneratedShiftsSchema', () => {
  it('should accept valid YYYY-MM month', () => {
    const result = deleteGeneratedShiftsSchema.safeParse({ month: '2026-03' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid month format', () => {
    const result = deleteGeneratedShiftsSchema.safeParse({
      month: 'March 2026',
    });
    expect(result.success).toBe(false);
  });
});

describe('shiftAssignmentSchema', () => {
  it('should accept valid assignment', () => {
    const result = shiftAssignmentSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      date: '2026-03-15',
      startTime: '08:00',
      endTime: '16:00',
      shiftTypeCode: 'SURGERY',
      employeeId: '550e8400-e29b-41d4-a716-446655440001',
      employeeName: 'Dr. Martin',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing employeeName', () => {
    const result = shiftAssignmentSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      date: '2026-03-15',
      startTime: '08:00',
      endTime: '16:00',
      shiftTypeCode: 'SURGERY',
      employeeId: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid UUID for id', () => {
    const result = shiftAssignmentSchema.safeParse({
      id: 'not-a-uuid',
      date: '2026-03-15',
      startTime: '08:00',
      endTime: '12:00',
      shiftTypeCode: 'SURGERY',
      employeeId: '550e8400-e29b-41d4-a716-446655440000',
      employeeName: 'Alice Martin',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid UUID for employeeId', () => {
    const result = shiftAssignmentSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      date: '2026-03-15',
      startTime: '08:00',
      endTime: '12:00',
      shiftTypeCode: 'SURGERY',
      employeeId: 'not-a-uuid',
      employeeName: 'Alice Martin',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty shiftTypeCode', () => {
    const result = shiftAssignmentSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      date: '2026-03-15',
      startTime: '08:00',
      endTime: '12:00',
      shiftTypeCode: '',
      employeeId: '550e8400-e29b-41d4-a716-446655440000',
      employeeName: 'Alice Martin',
    });
    expect(result.success).toBe(false);
  });
});

describe('holeInfoSchema', () => {
  it('should accept valid hole info', () => {
    const result = holeInfoSchema.safeParse({
      date: '2026-03-15',
      shiftTypeCode: 'SURGERY',
      requiredStaff: 2,
      assignedStaff: 0,
      reason: 'No eligible employees available',
    });
    expect(result.success).toBe(true);
  });

  it('should reject requiredStaff = 0', () => {
    const result = holeInfoSchema.safeParse({
      date: '2026-03-15',
      shiftTypeCode: 'SURGERY',
      requiredStaff: 0,
      assignedStaff: 0,
      reason: 'No eligible employees available',
    });
    expect(result.success).toBe(false);
  });

  it('should accept assignedStaff = 0', () => {
    const result = holeInfoSchema.safeParse({
      date: '2026-03-15',
      shiftTypeCode: 'SURGERY',
      requiredStaff: 2,
      assignedStaff: 0,
      reason: 'All employees unavailable',
    });
    expect(result.success).toBe(true);
  });
});

describe('hardViolationSchema', () => {
  it('should accept valid hard violation', () => {
    const result = hardViolationSchema.safeParse({
      ruleId: '550e8400-e29b-41d4-a716-446655440000',
      ruleName: 'Min 2 vets per surgery shift',
      category: 'STAFFING_MINIMUM',
      message: 'Only 1 vet assigned, minimum 2 required',
      severity: 'blocking',
    });
    expect(result.success).toBe(true);
  });

  it('should accept violation with optional fields', () => {
    const result = hardViolationSchema.safeParse({
      ruleId: '550e8400-e29b-41d4-a716-446655440000',
      ruleName: 'Skill requirement',
      category: 'SKILL_REQUIREMENT',
      message: 'No ASV assigned to reception',
      affectedEmployeeId: '550e8400-e29b-41d4-a716-446655440001',
      affectedDate: '2026-03-15',
      severity: 'blocking',
    });
    expect(result.success).toBe(true);
  });

  it("should reject severity 'warning' for hard violation", () => {
    const result = hardViolationSchema.safeParse({
      ruleId: '550e8400-e29b-41d4-a716-446655440000',
      ruleName: 'Test',
      category: 'STAFFING_MINIMUM',
      message: 'Test',
      severity: 'warning',
    });
    expect(result.success).toBe(false);
  });
});

describe('softViolationSchema', () => {
  it('should accept valid soft violation', () => {
    const result = softViolationSchema.safeParse({
      ruleId: '550e8400-e29b-41d4-a716-446655440000',
      ruleName: 'Saturday rotation equity',
      category: 'ROTATION_EQUITY',
      message: 'Employee exceeded max Saturday shifts',
      severity: 'warning',
    });
    expect(result.success).toBe(true);
  });

  it("should reject severity 'blocking' for soft violation", () => {
    const result = softViolationSchema.safeParse({
      ruleId: '550e8400-e29b-41d4-a716-446655440000',
      ruleName: 'Test',
      category: 'ROTATION_EQUITY',
      message: 'Test',
      severity: 'blocking',
    });
    expect(result.success).toBe(false);
  });
});

describe('generationResultSchema', () => {
  it('should accept valid generation result', () => {
    const result = generationResultSchema.safeParse({
      assignments: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          date: '2026-03-15',
          startTime: '08:00',
          endTime: '16:00',
          shiftTypeCode: 'SURGERY',
          employeeId: '550e8400-e29b-41d4-a716-446655440001',
          employeeName: 'Dr. Martin',
        },
      ],
      holes: [
        {
          date: '2026-03-16',
          shiftTypeCode: 'RECEPTION',
          requiredStaff: 2,
          assignedStaff: 1,
          reason: 'Not enough eligible employees',
        },
      ],
      violations: {
        hard: [],
        soft: [
          {
            ruleId: '550e8400-e29b-41d4-a716-446655440002',
            ruleName: 'Contract compliance',
            category: 'CONTRACT_COMPLIANCE',
            message: 'Employee exceeds 35h/week',
            severity: 'warning',
          },
        ],
      },
      stats: {
        totalSlots: 50,
        filledSlots: 48,
        holeCount: 2,
        hardViolationCount: 0,
        softWarningCount: 1,
      },
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty result (no assignments)', () => {
    const result = generationResultSchema.safeParse({
      assignments: [],
      holes: [],
      violations: { hard: [], soft: [] },
      stats: {
        totalSlots: 0,
        filledSlots: 0,
        holeCount: 0,
        hardViolationCount: 0,
        softWarningCount: 0,
      },
    });
    expect(result.success).toBe(true);
  });

  it('should reject negative stats values', () => {
    const result = generationResultSchema.safeParse({
      assignments: [],
      holes: [],
      violations: { hard: [], soft: [] },
      stats: {
        totalSlots: -1,
        filledSlots: 0,
        holeCount: 0,
        hardViolationCount: 0,
        softWarningCount: 0,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('acknowledgePublishedChange (story 11-1)', () => {
  const validTemplateId = '550e8400-e29b-41d4-a716-446655440000';

  it('defaults acknowledgePublishedChange to false on generatePlanSchema', () => {
    const parsed = generatePlanSchema.parse({
      month: '2026-07',
      templateId: validTemplateId,
    });
    expect(parsed.acknowledgePublishedChange).toBe(false);
  });

  it('accepts acknowledgePublishedChange: true on generatePlanSchema', () => {
    const parsed = generatePlanSchema.parse({
      month: '2026-07',
      templateId: validTemplateId,
      acknowledgePublishedChange: true,
    });
    expect(parsed.acknowledgePublishedChange).toBe(true);
  });

  it('defaults acknowledgePublishedChange to false on deleteGeneratedShiftsSchema', () => {
    const parsed = deleteGeneratedShiftsSchema.parse({ month: '2026-07' });
    expect(parsed.acknowledgePublishedChange).toBe(false);
  });

  it('accepts acknowledgePublishedChange: true on deleteGeneratedShiftsSchema', () => {
    const parsed = deleteGeneratedShiftsSchema.parse({
      month: '2026-07',
      acknowledgePublishedChange: true,
    });
    expect(parsed.acknowledgePublishedChange).toBe(true);
  });
});
