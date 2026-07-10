import { describe, it, expect } from 'vitest';
import {
  createPlanningRuleSchema,
  updatePlanningRuleSchema,
  togglePlanningRuleSchema,
  planningRuleIdSchema,
  listPlanningRulesSchema,
  validateShiftsSchema,
  staffingMinimumConfigSchema,
  rotationEquityConfigSchema,
  skillRequirementConfigSchema,
  contractComplianceConfigSchema,
} from './planning-rule.schema';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

// ── Staffing Minimum Config ─────────────────────────────────────────────────

describe('staffingMinimumConfigSchema', () => {
  it('accepts valid staffing minimum config', () => {
    const result = staffingMinimumConfigSchema.safeParse({
      shiftTypeCode: 'SURGERY',
      minStaff: 2,
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional jobTypes array', () => {
    const result = staffingMinimumConfigSchema.safeParse({
      shiftTypeCode: 'SURGERY',
      minStaff: 2,
      jobTypes: ['VET', 'ASV'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty shiftTypeCode', () => {
    const result = staffingMinimumConfigSchema.safeParse({
      shiftTypeCode: '',
      minStaff: 2,
    });
    expect(result.success).toBe(false);
  });

  it('rejects minStaff less than 1', () => {
    const result = staffingMinimumConfigSchema.safeParse({
      shiftTypeCode: 'SURGERY',
      minStaff: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer minStaff', () => {
    const result = staffingMinimumConfigSchema.safeParse({
      shiftTypeCode: 'SURGERY',
      minStaff: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing shiftTypeCode', () => {
    const result = staffingMinimumConfigSchema.safeParse({
      minStaff: 2,
    });
    expect(result.success).toBe(false);
  });
});

// ── Rotation Equity Config ──────────────────────────────────────────────────

describe('rotationEquityConfigSchema', () => {
  it('accepts valid rotation equity config', () => {
    const result = rotationEquityConfigSchema.safeParse({
      targetDay: 'saturday',
      maxPerPeriod: 2,
      trackingPeriod: 'monthly',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid days of week', () => {
    for (const day of [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ]) {
      const result = rotationEquityConfigSchema.safeParse({
        targetDay: day,
        maxPerPeriod: 1,
        trackingPeriod: 'quarterly',
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid targetDay', () => {
    const result = rotationEquityConfigSchema.safeParse({
      targetDay: 'dimanche',
      maxPerPeriod: 2,
      trackingPeriod: 'monthly',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid trackingPeriod', () => {
    const result = rotationEquityConfigSchema.safeParse({
      targetDay: 'saturday',
      maxPerPeriod: 2,
      trackingPeriod: 'yearly',
    });
    expect(result.success).toBe(false);
  });

  it('rejects maxPerPeriod less than 1', () => {
    const result = rotationEquityConfigSchema.safeParse({
      targetDay: 'saturday',
      maxPerPeriod: 0,
      trackingPeriod: 'monthly',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional applicableJobTypes array', () => {
    const result = rotationEquityConfigSchema.safeParse({
      targetDay: 'saturday',
      maxPerPeriod: 2,
      trackingPeriod: 'monthly',
      applicableJobTypes: ['ASV'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts applicableJobTypes with multiple job types', () => {
    const result = rotationEquityConfigSchema.safeParse({
      targetDay: 'saturday',
      maxPerPeriod: 2,
      trackingPeriod: 'monthly',
      applicableJobTypes: ['ASV', 'VET'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts config without applicableJobTypes (applies to all)', () => {
    const result = rotationEquityConfigSchema.safeParse({
      targetDay: 'saturday',
      maxPerPeriod: 2,
      trackingPeriod: 'quarterly',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty strings in applicableJobTypes', () => {
    const result = rotationEquityConfigSchema.safeParse({
      targetDay: 'saturday',
      maxPerPeriod: 2,
      trackingPeriod: 'monthly',
      applicableJobTypes: [''],
    });
    expect(result.success).toBe(false);
  });
});

// ── Skill Requirement Config ────────────────────────────────────────────────

describe('skillRequirementConfigSchema', () => {
  it('accepts valid skill requirement config', () => {
    const result = skillRequirementConfigSchema.safeParse({
      shiftTypeCode: 'SURGERY',
      requiredJobTypes: ['VET'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts multiple required job types', () => {
    const result = skillRequirementConfigSchema.safeParse({
      shiftTypeCode: 'CONSULTATION',
      requiredJobTypes: ['VET', 'ASV'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty requiredJobTypes array', () => {
    const result = skillRequirementConfigSchema.safeParse({
      shiftTypeCode: 'SURGERY',
      requiredJobTypes: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty shiftTypeCode', () => {
    const result = skillRequirementConfigSchema.safeParse({
      shiftTypeCode: '',
      requiredJobTypes: ['VET'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty strings in requiredJobTypes', () => {
    const result = skillRequirementConfigSchema.safeParse({
      shiftTypeCode: 'SURGERY',
      requiredJobTypes: [''],
    });
    expect(result.success).toBe(false);
  });
});

// ── Contract Compliance Config ──────────────────────────────────────────────

describe('contractComplianceConfigSchema', () => {
  it('accepts config with maxWeeklyHours only', () => {
    const result = contractComplianceConfigSchema.safeParse({
      maxWeeklyHours: 35,
    });
    expect(result.success).toBe(true);
  });

  it('accepts config with maxMonthlyHours only', () => {
    const result = contractComplianceConfigSchema.safeParse({
      maxMonthlyHours: 151,
    });
    expect(result.success).toBe(true);
  });

  it('accepts config with all fields', () => {
    const result = contractComplianceConfigSchema.safeParse({
      maxWeeklyHours: 35,
      maxMonthlyHours: 151,
      overtimeThresholdPercent: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rejects config with no hour limits', () => {
    const result = contractComplianceConfigSchema.safeParse({
      overtimeThresholdPercent: 10,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty object (no hour limits)', () => {
    const result = contractComplianceConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects overtimeThresholdPercent above 100', () => {
    const result = contractComplianceConfigSchema.safeParse({
      maxWeeklyHours: 35,
      overtimeThresholdPercent: 150,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative overtimeThresholdPercent', () => {
    const result = contractComplianceConfigSchema.safeParse({
      maxWeeklyHours: 35,
      overtimeThresholdPercent: -5,
    });
    expect(result.success).toBe(false);
  });

  it('accepts config with minRestHoursBetweenShifts only', () => {
    const result = contractComplianceConfigSchema.safeParse({
      minRestHoursBetweenShifts: 11,
    });
    expect(result.success).toBe(true);
  });

  it('accepts config with all fields including minRestHoursBetweenShifts', () => {
    const result = contractComplianceConfigSchema.safeParse({
      maxWeeklyHours: 35,
      maxMonthlyHours: 151,
      minRestHoursBetweenShifts: 11,
    });
    expect(result.success).toBe(true);
  });

  it('rejects minRestHoursBetweenShifts below 1', () => {
    const result = contractComplianceConfigSchema.safeParse({
      minRestHoursBetweenShifts: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects minRestHoursBetweenShifts above 24', () => {
    const result = contractComplianceConfigSchema.safeParse({
      minRestHoursBetweenShifts: 25,
    });
    expect(result.success).toBe(false);
  });

  // Story 11-3 — statutory fields (seeded HARD rule for admin visibility).
  it('accepts config with maxDailyHours only', () => {
    const result = contractComplianceConfigSchema.safeParse({
      maxDailyHours: 10,
    });
    expect(result.success).toBe(true);
  });

  it('accepts the seeded statutory config shape', () => {
    const result = contractComplianceConfigSchema.safeParse({
      maxDailyHours: 10,
      maxDailyAmplitudeHours: 13,
      minWeeklyRestHours: 35,
      maxConsecutiveWorkDays: 6,
    });
    expect(result.success).toBe(true);
  });

  it('still rejects empty object after statutory fields added', () => {
    const result = contractComplianceConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ── Create Planning Rule Schema ─────────────────────────────────────────────

describe('createPlanningRuleSchema', () => {
  const baseFields = {
    name: 'Min 2 vets for surgery',
    description: 'Ensure adequate staffing',
    ruleType: 'HARD' as const,
    isActive: true,
    priority: 10,
  };

  it('accepts valid STAFFING_MINIMUM rule', () => {
    const result = createPlanningRuleSchema.safeParse({
      ...baseFields,
      category: 'STAFFING_MINIMUM',
      config: { shiftTypeCode: 'SURGERY', minStaff: 2 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid ROTATION_EQUITY rule', () => {
    const result = createPlanningRuleSchema.safeParse({
      ...baseFields,
      ruleType: 'SOFT',
      category: 'ROTATION_EQUITY',
      config: { targetDay: 'saturday', maxPerPeriod: 2, trackingPeriod: 'monthly' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid SKILL_REQUIREMENT rule', () => {
    const result = createPlanningRuleSchema.safeParse({
      ...baseFields,
      category: 'SKILL_REQUIREMENT',
      config: { shiftTypeCode: 'SURGERY', requiredJobTypes: ['VET'] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid CONTRACT_COMPLIANCE rule', () => {
    const result = createPlanningRuleSchema.safeParse({
      ...baseFields,
      ruleType: 'SOFT',
      category: 'CONTRACT_COMPLIANCE',
      config: { maxWeeklyHours: 35 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createPlanningRuleSchema.safeParse({
      ...baseFields,
      name: '',
      category: 'STAFFING_MINIMUM',
      config: { shiftTypeCode: 'SURGERY', minStaff: 1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects name longer than 200 chars', () => {
    const result = createPlanningRuleSchema.safeParse({
      ...baseFields,
      name: 'x'.repeat(201),
      category: 'STAFFING_MINIMUM',
      config: { shiftTypeCode: 'SURGERY', minStaff: 1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid ruleType', () => {
    const result = createPlanningRuleSchema.safeParse({
      ...baseFields,
      ruleType: 'CRITICAL',
      category: 'STAFFING_MINIMUM',
      config: { shiftTypeCode: 'SURGERY', minStaff: 1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects mismatched category and config (STAFFING_MINIMUM with rotation config)', () => {
    const result = createPlanningRuleSchema.safeParse({
      ...baseFields,
      category: 'STAFFING_MINIMUM',
      config: { targetDay: 'saturday', maxPerPeriod: 2, trackingPeriod: 'monthly' },
    });
    expect(result.success).toBe(false);
  });

  it('defaults isActive to true when omitted', () => {
    const result = createPlanningRuleSchema.safeParse({
      name: 'Test',
      ruleType: 'HARD',
      priority: 0,
      category: 'STAFFING_MINIMUM',
      config: { shiftTypeCode: 'SURGERY', minStaff: 1 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });

  it('defaults priority to 0 when omitted', () => {
    const result = createPlanningRuleSchema.safeParse({
      name: 'Test',
      ruleType: 'HARD',
      isActive: true,
      category: 'STAFFING_MINIMUM',
      config: { shiftTypeCode: 'SURGERY', minStaff: 1 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe(0);
    }
  });

  it('rejects negative priority', () => {
    const result = createPlanningRuleSchema.safeParse({
      ...baseFields,
      priority: -1,
      category: 'STAFFING_MINIMUM',
      config: { shiftTypeCode: 'SURGERY', minStaff: 1 },
    });
    expect(result.success).toBe(false);
  });

  it('allows empty string description', () => {
    const result = createPlanningRuleSchema.safeParse({
      ...baseFields,
      description: '',
      category: 'STAFFING_MINIMUM',
      config: { shiftTypeCode: 'SURGERY', minStaff: 1 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects description longer than 500 chars', () => {
    const result = createPlanningRuleSchema.safeParse({
      ...baseFields,
      description: 'x'.repeat(501),
      category: 'STAFFING_MINIMUM',
      config: { shiftTypeCode: 'SURGERY', minStaff: 1 },
    });
    expect(result.success).toBe(false);
  });
});

// ── Update Planning Rule Schema ─────────────────────────────────────────────

describe('updatePlanningRuleSchema', () => {
  it('accepts valid update with UUID id', () => {
    const result = updatePlanningRuleSchema.safeParse({
      id: VALID_UUID,
      name: 'Updated Rule',
      ruleType: 'SOFT',
      isActive: false,
      priority: 5,
      category: 'ROTATION_EQUITY',
      config: { targetDay: 'sunday', maxPerPeriod: 3, trackingPeriod: 'quarterly' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID id', () => {
    const result = updatePlanningRuleSchema.safeParse({
      id: 'not-a-uuid',
      name: 'Test',
      ruleType: 'HARD',
      isActive: true,
      priority: 0,
      category: 'STAFFING_MINIMUM',
      config: { shiftTypeCode: 'SURGERY', minStaff: 1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing id', () => {
    const result = updatePlanningRuleSchema.safeParse({
      name: 'Test',
      ruleType: 'HARD',
      isActive: true,
      priority: 0,
      category: 'STAFFING_MINIMUM',
      config: { shiftTypeCode: 'SURGERY', minStaff: 1 },
    });
    expect(result.success).toBe(false);
  });
});

// ── Toggle Schema ───────────────────────────────────────────────────────────

describe('togglePlanningRuleSchema', () => {
  it('accepts valid toggle input', () => {
    const result = togglePlanningRuleSchema.safeParse({
      id: VALID_UUID,
      isActive: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID id', () => {
    const result = togglePlanningRuleSchema.safeParse({
      id: 'abc',
      isActive: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing isActive', () => {
    const result = togglePlanningRuleSchema.safeParse({
      id: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });
});

// ── ID Schema ───────────────────────────────────────────────────────────────

describe('planningRuleIdSchema', () => {
  it('accepts valid UUID', () => {
    const result = planningRuleIdSchema.safeParse({ id: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID string', () => {
    const result = planningRuleIdSchema.safeParse({ id: 'not-valid' });
    expect(result.success).toBe(false);
  });

  it('rejects missing id', () => {
    const result = planningRuleIdSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ── List Schema ─────────────────────────────────────────────────────────────

describe('listPlanningRulesSchema', () => {
  it('accepts empty object (no filters)', () => {
    const result = listPlanningRulesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts all valid filter combinations', () => {
    const result = listPlanningRulesSchema.safeParse({
      category: 'STAFFING_MINIMUM',
      ruleType: 'HARD',
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts single filter', () => {
    const result = listPlanningRulesSchema.safeParse({
      category: 'ROTATION_EQUITY',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid category', () => {
    const result = listPlanningRulesSchema.safeParse({
      category: 'INVALID',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid ruleType', () => {
    const result = listPlanningRulesSchema.safeParse({
      ruleType: 'CRITICAL',
    });
    expect(result.success).toBe(false);
  });
});

// ── Validate Shifts Schema ──────────────────────────────────────────────────

describe('validateShiftsSchema', () => {
  it('accepts valid ISO datetime strings', () => {
    const result = validateShiftsSchema.safeParse({
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-31T23:59:59.999Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-datetime string for startDate', () => {
    const result = validateShiftsSchema.safeParse({
      startDate: '2026-03-01',
      endDate: '2026-03-31T23:59:59.999Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing endDate', () => {
    const result = validateShiftsSchema.safeParse({
      startDate: '2026-03-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing startDate', () => {
    const result = validateShiftsSchema.safeParse({
      endDate: '2026-03-31T23:59:59.999Z',
    });
    expect(result.success).toBe(false);
  });
});
