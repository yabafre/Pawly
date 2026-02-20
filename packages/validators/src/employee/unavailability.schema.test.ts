import { describe, expect, it } from "vitest";
import {
  createUnavailabilitySchema,
  updateUnavailabilitySchema,
  unavailabilityIdSchema,
  listUnavailabilitiesSchema,
  hardRuleRangeSchema,
} from "./unavailability.schema";

describe("createUnavailabilitySchema", () => {
  const baseInput = {
    employeeId: "550e8400-e29b-41d4-a716-446655440000",
    type: "SCHOOL" as const,
    startDate: "2026-03-01T00:00:00.000Z",
    endDate: "2026-03-31T23:59:59.999Z",
    reason: "",
    daysOfWeek: [],
  };

  it("accepts a valid one-time unavailability", () => {
    const result = createUnavailabilitySchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it("accepts a valid recurring unavailability", () => {
    const result = createUnavailabilitySchema.safeParse({
      ...baseInput,
      type: "VACATION" as const,
      daysOfWeek: [1, 3, 5],
    });
    expect(result.success).toBe(true);
  });

  it("rejects endDate before startDate", () => {
    const result = createUnavailabilitySchema.safeParse({
      ...baseInput,
      startDate: "2026-03-15T00:00:00.000Z",
      endDate: "2026-03-10T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects weekday outside ISO range 1..7", () => {
    const result = createUnavailabilitySchema.safeParse({
      ...baseInput,
      daysOfWeek: [0, 2],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate weekdays", () => {
    const result = createUnavailabilitySchema.safeParse({
      ...baseInput,
      daysOfWeek: [1, 1, 3],
    });
    expect(result.success).toBe(false);
  });
});

describe("updateUnavailabilitySchema", () => {
  it("accepts partial update with valid id", () => {
    const result = updateUnavailabilitySchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440001",
      reason: "Updated reason",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid id", () => {
    const result = updateUnavailabilitySchema.safeParse({
      id: "invalid-id",
      reason: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date range when both dates are provided", () => {
    const result = updateUnavailabilitySchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440001",
      startDate: "2026-04-20T00:00:00.000Z",
      endDate: "2026-04-10T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("identifier and list schemas", () => {
  it("validates unavailabilityIdSchema", () => {
    expect(
      unavailabilityIdSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
      }).success,
    ).toBe(true);
  });

  it("validates listUnavailabilitiesSchema", () => {
    expect(
      listUnavailabilitiesSchema.safeParse({
        employeeId: "550e8400-e29b-41d4-a716-446655440000",
      }).success,
    ).toBe(true);
  });
});

describe("hardRuleRangeSchema", () => {
  const baseRange = {
    startDate: "2026-03-01T00:00:00.000Z",
    endDate: "2026-03-31T23:59:59.999Z",
  };

  it("accepts valid range without employee filter", () => {
    const result = hardRuleRangeSchema.safeParse(baseRange);
    expect(result.success).toBe(true);
  });

  it("accepts valid range with employeeIds filter", () => {
    const result = hardRuleRangeSchema.safeParse({
      ...baseRange,
      employeeIds: [
        "550e8400-e29b-41d4-a716-446655440000",
        "550e8400-e29b-41d4-a716-446655440001",
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects inverted range", () => {
    const result = hardRuleRangeSchema.safeParse({
      ...baseRange,
      startDate: "2026-03-31T00:00:00.000Z",
      endDate: "2026-03-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});
