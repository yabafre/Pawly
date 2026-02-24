import { describe, it, expect } from "vitest";
import {
  VARIANCE_EVENT_STATUSES,
  VARIANCE_EVENT_TYPES,
  listVarianceEventsSchema,
  reviewVarianceSchema,
  getVarianceStatsSchema,
  exportVarianceSchema,
} from "./variance.schema";

// ── Constants ──────────────────────────────────────────────────────────

describe("VARIANCE_EVENT_STATUSES", () => {
  it("contains PENDING, APPROVED, REJECTED", () => {
    expect(VARIANCE_EVENT_STATUSES).toEqual([
      "PENDING",
      "APPROVED",
      "REJECTED",
    ]);
  });
});

describe("VARIANCE_EVENT_TYPES", () => {
  it("contains all 4 variance event types", () => {
    expect(VARIANCE_EVENT_TYPES).toEqual([
      "CLOCK_IN_DEVIATION",
      "CLOCK_OUT_DEVIATION",
      "NO_SHOW",
      "EARLY_DEPARTURE",
    ]);
  });
});

// ── listVarianceEventsSchema ───────────────────────────────────────────

describe("listVarianceEventsSchema", () => {
  it("accepts empty object (all filters optional)", () => {
    const result = listVarianceEventsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts all filters provided", () => {
    const result = listVarianceEventsSchema.safeParse({
      status: "PENDING",
      employeeId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      month: "2026-02",
      type: "NO_SHOW",
    });
    expect(result.success).toBe(true);
  });

  it("accepts each status value", () => {
    for (const status of VARIANCE_EVENT_STATUSES) {
      const result = listVarianceEventsSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it("accepts each type value", () => {
    for (const type of VARIANCE_EVENT_TYPES) {
      const result = listVarianceEventsSchema.safeParse({ type });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    const result = listVarianceEventsSchema.safeParse({
      status: "UNKNOWN",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = listVarianceEventsSchema.safeParse({
      type: "INVALID_TYPE",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid employeeId (not uuid)", () => {
    const result = listVarianceEventsSchema.safeParse({
      employeeId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid month format YYYY-M", () => {
    const result = listVarianceEventsSchema.safeParse({ month: "2026-2" });
    expect(result.success).toBe(false);
  });

  it("rejects month 00", () => {
    const result = listVarianceEventsSchema.safeParse({ month: "2026-00" });
    expect(result.success).toBe(false);
  });

  it("rejects month 13", () => {
    const result = listVarianceEventsSchema.safeParse({ month: "2026-13" });
    expect(result.success).toBe(false);
  });

  it("accepts month 01", () => {
    const result = listVarianceEventsSchema.safeParse({ month: "2026-01" });
    expect(result.success).toBe(true);
  });

  it("accepts month 12", () => {
    const result = listVarianceEventsSchema.safeParse({ month: "2026-12" });
    expect(result.success).toBe(true);
  });
});

// ── reviewVarianceSchema ───────────────────────────────────────────────

describe("reviewVarianceSchema", () => {
  const validUuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  it("accepts approve without exceptionNote", () => {
    const result = reviewVarianceSchema.safeParse({
      varianceId: validUuid,
      action: "approve",
    });
    expect(result.success).toBe(true);
  });

  it("accepts approve with exceptionNote", () => {
    const result = reviewVarianceSchema.safeParse({
      varianceId: validUuid,
      action: "approve",
      exceptionNote: "Approved with note",
    });
    expect(result.success).toBe(true);
  });

  it("accepts reject with exceptionNote", () => {
    const result = reviewVarianceSchema.safeParse({
      varianceId: validUuid,
      action: "reject",
      exceptionNote: "Not valid",
    });
    expect(result.success).toBe(true);
  });

  it("rejects reject without exceptionNote", () => {
    const result = reviewVarianceSchema.safeParse({
      varianceId: validUuid,
      action: "reject",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("exceptionNote");
    }
  });

  it("rejects reject with empty exceptionNote", () => {
    const result = reviewVarianceSchema.safeParse({
      varianceId: validUuid,
      action: "reject",
      exceptionNote: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reject with whitespace-only exceptionNote", () => {
    const result = reviewVarianceSchema.safeParse({
      varianceId: validUuid,
      action: "reject",
      exceptionNote: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid varianceId", () => {
    const result = reviewVarianceSchema.safeParse({
      varianceId: "not-uuid",
      action: "approve",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid action", () => {
    const result = reviewVarianceSchema.safeParse({
      varianceId: validUuid,
      action: "delete",
    });
    expect(result.success).toBe(false);
  });

  it("rejects exceptionNote exceeding 500 chars", () => {
    const result = reviewVarianceSchema.safeParse({
      varianceId: validUuid,
      action: "reject",
      exceptionNote: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ── getVarianceStatsSchema ─────────────────────────────────────────────

describe("getVarianceStatsSchema", () => {
  it("accepts empty object (month optional)", () => {
    const result = getVarianceStatsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid month", () => {
    const result = getVarianceStatsSchema.safeParse({ month: "2026-03" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid month format", () => {
    const result = getVarianceStatsSchema.safeParse({ month: "2026-3" });
    expect(result.success).toBe(false);
  });

  it("rejects month 00", () => {
    const result = getVarianceStatsSchema.safeParse({ month: "2026-00" });
    expect(result.success).toBe(false);
  });

  it("rejects month 13", () => {
    const result = getVarianceStatsSchema.safeParse({ month: "2026-13" });
    expect(result.success).toBe(false);
  });
});

// ── exportVarianceSchema ───────────────────────────────────────────────

describe("exportVarianceSchema", () => {
  it("accepts valid month without employeeId", () => {
    const result = exportVarianceSchema.safeParse({ month: "2026-02" });
    expect(result.success).toBe(true);
  });

  it("accepts valid month with employeeId", () => {
    const result = exportVarianceSchema.safeParse({
      month: "2026-02",
      employeeId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing month (required)", () => {
    const result = exportVarianceSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid month format", () => {
    const result = exportVarianceSchema.safeParse({ month: "Feb-2026" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid employeeId", () => {
    const result = exportVarianceSchema.safeParse({
      month: "2026-02",
      employeeId: "bad-id",
    });
    expect(result.success).toBe(false);
  });
});
