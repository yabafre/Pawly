import { describe, it, expect } from "vitest";
import { declareSchoolDaysSchema, listSchoolDaysSchema } from "./school-days.schema";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("declareSchoolDaysSchema", () => {
  it("accepts a valid declaration with correct month and dates", () => {
    const result = declareSchoolDaysSchema.safeParse({
      month: "2026-03",
      dates: ["2026-03-02", "2026-03-09", "2026-03-16"],
      employeeId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty dates array (clearing declarations)", () => {
    const result = declareSchoolDaysSchema.safeParse({
      month: "2026-03",
      dates: [],
      employeeId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid YYYY-MM month format (missing leading zero)", () => {
    const result = declareSchoolDaysSchema.safeParse({
      month: "2026-3",
      dates: ["2026-03-02"],
      employeeId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid YYYY-MM month format (month 13)", () => {
    const result = declareSchoolDaysSchema.safeParse({
      month: "2026-13",
      dates: [],
      employeeId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid YYYY-MM month format (full date string)", () => {
    const result = declareSchoolDaysSchema.safeParse({
      month: "2026-03-01",
      dates: [],
      employeeId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("rejects dates outside the declared month", () => {
    const result = declareSchoolDaysSchema.safeParse({
      month: "2026-03",
      dates: ["2026-04-01"],
      employeeId: VALID_UUID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const dateErrors = result.error.issues.filter((i) => i.path.includes("dates"));
      expect(dateErrors.length).toBeGreaterThan(0);
    }
  });

  it("rejects dates from a different year", () => {
    const result = declareSchoolDaysSchema.safeParse({
      month: "2026-03",
      dates: ["2025-03-01"],
      employeeId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate dates in a single declaration", () => {
    const result = declareSchoolDaysSchema.safeParse({
      month: "2026-03",
      dates: ["2026-03-02", "2026-03-02"],
      employeeId: VALID_UUID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const dupError = result.error.issues.find((i) =>
        i.message.includes("Duplicate"),
      );
      expect(dupError).toBeDefined();
    }
  });

  it("rejects more than 31 dates", () => {
    const dates = Array.from({ length: 32 }, (_, i) =>
      `2026-03-${String(i + 1).padStart(2, "0")}`,
    );
    const result = declareSchoolDaysSchema.safeParse({
      month: "2026-03",
      dates,
      employeeId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid employeeId (not UUID)", () => {
    const result = declareSchoolDaysSchema.safeParse({
      month: "2026-03",
      dates: ["2026-03-02"],
      employeeId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date strings", () => {
    const result = declareSchoolDaysSchema.safeParse({
      month: "2026-03",
      dates: ["not-a-date"],
      employeeId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid days in a month with 31 days", () => {
    const dates = Array.from({ length: 31 }, (_, i) =>
      `2026-03-${String(i + 1).padStart(2, "0")}`,
    );
    const result = declareSchoolDaysSchema.safeParse({
      month: "2026-03",
      dates,
      employeeId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("handles February correctly (28 days in non-leap year)", () => {
    const dates = ["2026-02-01", "2026-02-28"];
    const result = declareSchoolDaysSchema.safeParse({
      month: "2026-02",
      dates,
      employeeId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });
});

describe("listSchoolDaysSchema", () => {
  it("accepts valid month and employeeId", () => {
    const result = listSchoolDaysSchema.safeParse({
      month: "2026-03",
      employeeId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid month format", () => {
    const result = listSchoolDaysSchema.safeParse({
      month: "March 2026",
      employeeId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid employeeId", () => {
    const result = listSchoolDaysSchema.safeParse({
      month: "2026-03",
      employeeId: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing month", () => {
    const result = listSchoolDaysSchema.safeParse({
      employeeId: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing employeeId", () => {
    const result = listSchoolDaysSchema.safeParse({
      month: "2026-03",
    });
    expect(result.success).toBe(false);
  });
});
