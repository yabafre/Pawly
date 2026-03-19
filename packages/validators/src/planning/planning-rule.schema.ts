import { z } from "@pawly/zod";

export const PLANNING_RULE_TYPES = ["HARD", "SOFT"] as const;
export type PlanningRuleType = (typeof PLANNING_RULE_TYPES)[number];

export const PLANNING_RULE_CATEGORIES = [
  "STAFFING_MINIMUM",
  "ROTATION_EQUITY",
  "SKILL_REQUIREMENT",
  "CONTRACT_COMPLIANCE",
] as const;
export type PlanningRuleCategory = (typeof PLANNING_RULE_CATEGORIES)[number];

export const TRACKING_PERIODS = ["monthly", "quarterly"] as const;
export type TrackingPeriod = (typeof TRACKING_PERIODS)[number];

export const DAYS_OF_WEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

// ── Category-specific config schemas ────────────────────────────────────────

export const staffingMinimumConfigSchema = z.object({
  shiftTypeCode: z.string().min(1, "Shift type code is required"),
  minStaff: z.number().int().min(1, "Minimum staff must be at least 1"),
  jobTypes: z.array(z.string().min(1)).optional(),
});
export type StaffingMinimumConfig = z.infer<typeof staffingMinimumConfigSchema>;

export const rotationEquityConfigSchema = z.object({
  targetDay: z.enum(DAYS_OF_WEEK),
  maxPerPeriod: z.number().int().min(1, "Max per period must be at least 1"),
  trackingPeriod: z.enum(TRACKING_PERIODS),
  applicableJobTypes: z.array(z.string().min(1)).optional(),
});
export type RotationEquityConfig = z.infer<typeof rotationEquityConfigSchema>;

export const skillRequirementConfigSchema = z.object({
  shiftTypeCode: z.string().min(1, "Shift type code is required"),
  requiredJobTypes: z
    .array(z.string().min(1))
    .min(1, "At least one required job type"),
});
export type SkillRequirementConfig = z.infer<
  typeof skillRequirementConfigSchema
>;

export const contractComplianceConfigSchema = z
  .object({
    maxWeeklyHours: z.number().int().min(1).optional(),
    maxMonthlyHours: z.number().int().min(1).optional(),
    overtimeThresholdPercent: z.number().min(0).max(100).optional(),
    minRestHoursBetweenShifts: z.number().min(1).max(24).optional(),
  })
  .refine(
    (data) => data.maxWeeklyHours !== undefined || data.maxMonthlyHours !== undefined || data.minRestHoursBetweenShifts !== undefined,
    "At least one constraint (hour limit or rest hours) must be defined"
  );
export type ContractComplianceConfig = z.infer<
  typeof contractComplianceConfigSchema
>;

// ── Base planning rule fields (shared across all categories) ────────────────

const planningRuleTypeEnum = z.enum(PLANNING_RULE_TYPES);
const planningRuleCategoryEnum = z.enum(PLANNING_RULE_CATEGORIES);

const basePlanningRuleFields = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(500).optional().or(z.literal("")),
  ruleType: planningRuleTypeEnum,
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
});

// ── Create schema (discriminated union on category) ─────────────────────────

export const createPlanningRuleSchema = z.discriminatedUnion("category", [
  basePlanningRuleFields.extend({
    category: z.literal("STAFFING_MINIMUM"),
    config: staffingMinimumConfigSchema,
  }),
  basePlanningRuleFields.extend({
    category: z.literal("ROTATION_EQUITY"),
    config: rotationEquityConfigSchema,
  }),
  basePlanningRuleFields.extend({
    category: z.literal("SKILL_REQUIREMENT"),
    config: skillRequirementConfigSchema,
  }),
  basePlanningRuleFields.extend({
    category: z.literal("CONTRACT_COMPLIANCE"),
    config: contractComplianceConfigSchema,
  }),
]);
export type CreatePlanningRuleInput = z.infer<
  typeof createPlanningRuleSchema
>;

// ── Update schema (same structure + required id) ────────────────────────────

export const updatePlanningRuleSchema = z.discriminatedUnion("category", [
  basePlanningRuleFields.extend({
    id: z.string().uuid(),
    category: z.literal("STAFFING_MINIMUM"),
    config: staffingMinimumConfigSchema,
  }),
  basePlanningRuleFields.extend({
    id: z.string().uuid(),
    category: z.literal("ROTATION_EQUITY"),
    config: rotationEquityConfigSchema,
  }),
  basePlanningRuleFields.extend({
    id: z.string().uuid(),
    category: z.literal("SKILL_REQUIREMENT"),
    config: skillRequirementConfigSchema,
  }),
  basePlanningRuleFields.extend({
    id: z.string().uuid(),
    category: z.literal("CONTRACT_COMPLIANCE"),
    config: contractComplianceConfigSchema,
  }),
]);
export type UpdatePlanningRuleInput = z.infer<
  typeof updatePlanningRuleSchema
>;

// ── Toggle schema ───────────────────────────────────────────────────────────

export const togglePlanningRuleSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});
export type TogglePlanningRuleInput = z.infer<
  typeof togglePlanningRuleSchema
>;

// ── ID schema ───────────────────────────────────────────────────────────────

export const planningRuleIdSchema = z.object({
  id: z.string().uuid(),
});
export type PlanningRuleIdInput = z.infer<typeof planningRuleIdSchema>;

// ── List/filter schema ──────────────────────────────────────────────────────

export const listPlanningRulesSchema = z.object({
  category: planningRuleCategoryEnum.optional(),
  ruleType: planningRuleTypeEnum.optional(),
  isActive: z.boolean().optional(),
});
export type ListPlanningRulesInput = z.infer<typeof listPlanningRulesSchema>;

// ── Validate shifts schema ──────────────────────────────────────────────────

export const validateShiftsSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
}).refine(
  (data) => {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 62;
  },
  "Date range must be between 0 and 62 days",
);
export type ValidateShiftsInput = z.infer<typeof validateShiftsSchema>;
