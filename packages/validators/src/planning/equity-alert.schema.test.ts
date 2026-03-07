import { describe, it, expect } from "vitest";
import {
  publishPlanInputSchema,
  planningPeriodStatusSchema,
  publishPlanResultSchema,
  publicationStatusResultSchema,
} from "./equity-alert.schema";
import {
  equityContextSchema,
  softViolationSchema,
} from "./planning-generation.schema";
import {
  equitySummaryEntrySchema,
  scheduleViewDataSchema,
} from "./schedule-view.schema";

// ── equityContextSchema ──────────────────────────────────────────────

describe("equityContextSchema", () => {
  it("accepts valid equityContext with all fields", () => {
    const result = equityContextSchema.safeParse({
      counterType: "SATURDAY_WORKED",
      currentCount: 3,
      maxPerPeriod: 2,
      clinicAverage: 1.5,
      trend: "above_average",
    });
    expect(result.success).toBe(true);
  });

  it("accepts equityContext with zero currentCount", () => {
    const result = equityContextSchema.safeParse({
      counterType: "OVERTIME_HOURS",
      currentCount: 0,
      maxPerPeriod: 160,
      clinicAverage: 140,
      trend: "below_average",
    });
    expect(result.success).toBe(true);
  });

  it("accepts equityContext with average trend", () => {
    const result = equityContextSchema.safeParse({
      counterType: "WEEKEND_TOTAL",
      currentCount: 2,
      maxPerPeriod: 3,
      clinicAverage: 2.1,
      trend: "average",
    });
    expect(result.success).toBe(true);
  });

  it("rejects equityContext with invalid trend value", () => {
    const result = equityContextSchema.safeParse({
      counterType: "SATURDAY_WORKED",
      currentCount: 3,
      maxPerPeriod: 2,
      clinicAverage: 1.5,
      trend: "very_high",
    });
    expect(result.success).toBe(false);
  });

  it("rejects equityContext missing counterType", () => {
    const result = equityContextSchema.safeParse({
      currentCount: 3,
      maxPerPeriod: 2,
      clinicAverage: 1.5,
      trend: "above_average",
    });
    expect(result.success).toBe(false);
  });

  it("rejects equityContext with non-numeric currentCount", () => {
    const result = equityContextSchema.safeParse({
      counterType: "SATURDAY_WORKED",
      currentCount: "three",
      maxPerPeriod: 2,
      clinicAverage: 1.5,
      trend: "above_average",
    });
    expect(result.success).toBe(false);
  });
});

// ── softViolationSchema with equityContext ────────────────────────────

describe("softViolationSchema with equityContext", () => {
  const baseSoftViolation = {
    ruleId: "550e8400-e29b-41d4-a716-446655440001",
    ruleName: "Saturday rotation",
    category: "ROTATION_EQUITY",
    message: "Employee has 3 saturday shifts",
    affectedEmployeeId: "550e8400-e29b-41d4-a716-446655440002",
    affectedDate: "2026-03-07",
    severity: "warning" as const,
  };

  it("accepts enriched softViolation with equityContext", () => {
    const result = softViolationSchema.safeParse({
      ...baseSoftViolation,
      equityContext: {
        counterType: "SATURDAY_WORKED",
        currentCount: 3,
        maxPerPeriod: 2,
        clinicAverage: 1.5,
        trend: "above_average",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.equityContext).toBeDefined();
      expect(result.data.equityContext!.counterType).toBe("SATURDAY_WORKED");
    }
  });

  it("accepts softViolation without equityContext (backward compatible)", () => {
    const result = softViolationSchema.safeParse(baseSoftViolation);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.equityContext).toBeUndefined();
    }
  });

  it("rejects softViolation with invalid equityContext", () => {
    const result = softViolationSchema.safeParse({
      ...baseSoftViolation,
      equityContext: {
        counterType: "SATURDAY_WORKED",
        currentCount: 3,
        // missing maxPerPeriod, clinicAverage, trend
      },
    });
    expect(result.success).toBe(false);
  });
});

// ── publishPlanInputSchema ───────────────────────────────────────────

describe("publishPlanInputSchema", () => {
  it("accepts valid YYYY-MM month format", () => {
    expect(publishPlanInputSchema.safeParse({ month: "2026-03" }).success).toBe(true);
    expect(publishPlanInputSchema.safeParse({ month: "2026-12" }).success).toBe(true);
    expect(publishPlanInputSchema.safeParse({ month: "2026-01" }).success).toBe(true);
  });

  it("rejects invalid month formats", () => {
    expect(publishPlanInputSchema.safeParse({ month: "2026-13" }).success).toBe(false);
    expect(publishPlanInputSchema.safeParse({ month: "2026-00" }).success).toBe(false);
    expect(publishPlanInputSchema.safeParse({ month: "2026-3" }).success).toBe(false);
    expect(publishPlanInputSchema.safeParse({ month: "March 2026" }).success).toBe(false);
    expect(publishPlanInputSchema.safeParse({ month: "" }).success).toBe(false);
  });

  it("rejects missing month", () => {
    expect(publishPlanInputSchema.safeParse({}).success).toBe(false);
  });
});

// ── planningPeriodStatusSchema ───────────────────────────────────────

describe("planningPeriodStatusSchema", () => {
  it("accepts valid DRAFT status", () => {
    const result = planningPeriodStatusSchema.safeParse({
      id: "abc123",
      clinicId: "550e8400-e29b-41d4-a716-446655440001",
      month: "2026-03",
      status: "DRAFT",
      publishedAt: null,
      publishedBy: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid PUBLISHED status with timestamps", () => {
    const result = planningPeriodStatusSchema.safeParse({
      id: "abc123",
      clinicId: "550e8400-e29b-41d4-a716-446655440001",
      month: "2026-03",
      status: "PUBLISHED",
      publishedAt: "2026-03-15T10:00:00.000Z",
      publishedBy: "550e8400-e29b-41d4-a716-446655440002",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status value", () => {
    const result = planningPeriodStatusSchema.safeParse({
      id: "abc123",
      clinicId: "550e8400-e29b-41d4-a716-446655440001",
      month: "2026-03",
      status: "ARCHIVED",
      publishedAt: null,
      publishedBy: null,
    });
    expect(result.success).toBe(false);
  });
});

// ── publishPlanResultSchema ──────────────────────────────────────────

describe("publishPlanResultSchema", () => {
  it("accepts valid publish result", () => {
    const result = publishPlanResultSchema.safeParse({
      publishedAt: "2026-03-15T10:00:00.000Z",
      totalWithShifts: 8,
    });
    expect(result.success).toBe(true);
  });

  it("accepts zero totalWithShifts", () => {
    const result = publishPlanResultSchema.safeParse({
      publishedAt: "2026-03-15T10:00:00.000Z",
      totalWithShifts: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative totalWithShifts", () => {
    const result = publishPlanResultSchema.safeParse({
      publishedAt: "2026-03-15T10:00:00.000Z",
      totalWithShifts: -1,
    });
    expect(result.success).toBe(false);
  });
});

// ── equitySummaryEntrySchema ─────────────────────────────────────────

describe("equitySummaryEntrySchema", () => {
  it("accepts valid equity summary entry", () => {
    const result = equitySummaryEntrySchema.safeParse({
      employeeId: "550e8400-e29b-41d4-a716-446655440001",
      counters: [
        { counterType: "SATURDAY_WORKED", count: 3, clinicAverage: 1.5, maxPerPeriod: 2 },
        { counterType: "WEEKEND_TOTAL", count: 4, clinicAverage: 3.2, maxPerPeriod: null },
        { counterType: "HOLIDAY_WORKED", count: 0, clinicAverage: 0.5, maxPerPeriod: null },
        { counterType: "OVERTIME_HOURS", count: 120, clinicAverage: 80, maxPerPeriod: null },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty counters array", () => {
    const result = equitySummaryEntrySchema.safeParse({
      employeeId: "550e8400-e29b-41d4-a716-446655440001",
      counters: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing employeeId", () => {
    const result = equitySummaryEntrySchema.safeParse({
      counters: [{ counterType: "SATURDAY_WORKED", count: 3, clinicAverage: 1.5 }],
    });
    expect(result.success).toBe(false);
  });
});

// ── scheduleViewDataSchema with equitySummary ────────────────────────

describe("scheduleViewDataSchema equitySummary field", () => {
  const minimalScheduleView = {
    month: "2026-03",
    employees: [],
    days: [],
    shifts: [],
    unavailabilities: [],
    holes: [],
    violations: { hard: [], soft: [] },
  };

  it("accepts scheduleViewData with equitySummary", () => {
    const result = scheduleViewDataSchema.safeParse({
      ...minimalScheduleView,
      equitySummary: [
        {
          employeeId: "550e8400-e29b-41d4-a716-446655440001",
          counters: [
            { counterType: "SATURDAY_WORKED", count: 3, clinicAverage: 1.5, maxPerPeriod: 2 },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts scheduleViewData without equitySummary (backward compatible)", () => {
    const result = scheduleViewDataSchema.safeParse(minimalScheduleView);
    expect(result.success).toBe(true);
  });

  it("accepts scheduleViewData with soft violations containing equityContext", () => {
    const result = scheduleViewDataSchema.safeParse({
      ...minimalScheduleView,
      violations: {
        hard: [],
        soft: [
          {
            ruleId: "550e8400-e29b-41d4-a716-446655440001",
            ruleName: "Saturday rotation",
            category: "ROTATION_EQUITY",
            message: "Employee has 3 saturday shifts",
            affectedEmployeeId: "550e8400-e29b-41d4-a716-446655440002",
            affectedDate: "2026-03-07",
            severity: "warning",
            equityContext: {
              counterType: "SATURDAY_WORKED",
              currentCount: 3,
              maxPerPeriod: 2,
              clinicAverage: 1.5,
              trend: "above_average",
            },
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});

// ── publicationStatusResultSchema ────────────────────────────────────

describe("publicationStatusResultSchema", () => {
  it("accepts DRAFT status", () => {
    const result = publicationStatusResultSchema.safeParse({
      status: "DRAFT",
      publishedAt: null,
      publishedBy: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts PUBLISHED status with timestamps", () => {
    const result = publicationStatusResultSchema.safeParse({
      status: "PUBLISHED",
      publishedAt: "2026-03-15T10:00:00.000Z",
      publishedBy: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(result.success).toBe(true);
  });
});
