import { describe, it, expect } from "vitest";
import {
  EQUITY_COUNTER_TYPES,
  equityCounterTypeSchema,
  getEquityCountersSchema,
  getQuarterlySummarySchema,
  recalculateCountersSchema,
} from "./equity-counter.schema";

// ── EQUITY_COUNTER_TYPES constant ───────────────────────────────────────────

describe("EQUITY_COUNTER_TYPES", () => {
  it("has exactly 4 values", () => {
    expect(EQUITY_COUNTER_TYPES).toHaveLength(4);
  });

  it("contains the correct counter types", () => {
    expect(EQUITY_COUNTER_TYPES).toEqual([
      "SATURDAY_WORKED",
      "WEEKEND_TOTAL",
      "HOLIDAY_WORKED",
      "OVERTIME_HOURS",
    ]);
  });
});

// ── equityCounterTypeSchema ─────────────────────────────────────────────────

describe("equityCounterTypeSchema", () => {
  it("accepts all valid counter types", () => {
    for (const type of EQUITY_COUNTER_TYPES) {
      const result = equityCounterTypeSchema.safeParse(type);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid counter type", () => {
    const result = equityCounterTypeSchema.safeParse("INVALID_TYPE");
    expect(result.success).toBe(false);
  });
});

// ── getEquityCountersSchema ─────────────────────────────────────────────────

describe("getEquityCountersSchema", () => {
  it("accepts valid input with year and months", () => {
    const result = getEquityCountersSchema.safeParse({
      year: 2026,
      months: [1, 2, 3],
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with optional counterTypes", () => {
    const result = getEquityCountersSchema.safeParse({
      year: 2026,
      months: [6],
      counterTypes: ["SATURDAY_WORKED", "OVERTIME_HOURS"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects year below 2024", () => {
    const result = getEquityCountersSchema.safeParse({
      year: 2023,
      months: [1],
    });
    expect(result.success).toBe(false);
  });

  it("rejects year above 2100", () => {
    const result = getEquityCountersSchema.safeParse({
      year: 2101,
      months: [1],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty months array", () => {
    const result = getEquityCountersSchema.safeParse({
      year: 2026,
      months: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects month below 1", () => {
    const result = getEquityCountersSchema.safeParse({
      year: 2026,
      months: [0],
    });
    expect(result.success).toBe(false);
  });

  it("rejects month above 12", () => {
    const result = getEquityCountersSchema.safeParse({
      year: 2026,
      months: [13],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid counterType in array", () => {
    const result = getEquityCountersSchema.safeParse({
      year: 2026,
      months: [1],
      counterTypes: ["INVALID_TYPE"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts without counterTypes (optional field)", () => {
    const result = getEquityCountersSchema.safeParse({
      year: 2024,
      months: [12],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.counterTypes).toBeUndefined();
    }
  });
});

// ── getQuarterlySummarySchema ────────────────────────────────────────────────

describe("getQuarterlySummarySchema", () => {
  it("accepts valid input", () => {
    const result = getQuarterlySummarySchema.safeParse({
      year: 2026,
      quarter: 1,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid quarters (1-4)", () => {
    for (const quarter of [1, 2, 3, 4]) {
      const result = getQuarterlySummarySchema.safeParse({
        year: 2026,
        quarter,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects quarter below 1", () => {
    const result = getQuarterlySummarySchema.safeParse({
      year: 2026,
      quarter: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects quarter above 4", () => {
    const result = getQuarterlySummarySchema.safeParse({
      year: 2026,
      quarter: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer quarter", () => {
    const result = getQuarterlySummarySchema.safeParse({
      year: 2026,
      quarter: 2.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects year below 2024", () => {
    const result = getQuarterlySummarySchema.safeParse({
      year: 2020,
      quarter: 1,
    });
    expect(result.success).toBe(false);
  });
});

// ── recalculateCountersSchema ───────────────────────────────────────────────

describe("recalculateCountersSchema", () => {
  it("accepts valid input", () => {
    const result = recalculateCountersSchema.safeParse({
      year: 2026,
      month: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects month below 1", () => {
    const result = recalculateCountersSchema.safeParse({
      year: 2026,
      month: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects month above 12", () => {
    const result = recalculateCountersSchema.safeParse({
      year: 2026,
      month: 13,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer month", () => {
    const result = recalculateCountersSchema.safeParse({
      year: 2026,
      month: 6.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects year above 2100", () => {
    const result = recalculateCountersSchema.safeParse({
      year: 2101,
      month: 1,
    });
    expect(result.success).toBe(false);
  });
});
