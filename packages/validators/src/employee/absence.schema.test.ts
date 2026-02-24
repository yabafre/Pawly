import { describe, expect, it } from "vitest";
import {
  createAbsenceRequestSchema,
  reviewAbsenceSchema,
  listAbsencesSchema,
  absenceIdSchema,
  adminCreateAbsenceSchema,
  ABSENCE_TYPES,
  ABSENCE_STATUSES,
} from "./absence.schema";

const validUuid = "550e8400-e29b-41d4-a716-446655440000";

describe("createAbsenceRequestSchema", () => {
  const validInput = {
    employeeId: validUuid,
    type: "PAID_LEAVE" as const,
    startDate: "2026-03-10T00:00:00.000Z",
    endDate: "2026-03-14T00:00:00.000Z",
    reason: "Family vacation",
  };

  it("accepts valid absence request with all fields", () => {
    const result = createAbsenceRequestSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it.each(ABSENCE_TYPES)("accepts type %s", (type) => {
    const result = createAbsenceRequestSchema.safeParse({
      ...validInput,
      type,
    });
    expect(result.success).toBe(true);
  });

  it("accepts request without reason (optional)", () => {
    const { reason: _, ...withoutReason } = validInput;
    const result = createAbsenceRequestSchema.safeParse(withoutReason);
    expect(result.success).toBe(true);
  });

  it("accepts request with empty reason", () => {
    const result = createAbsenceRequestSchema.safeParse({
      ...validInput,
      reason: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects endDate before startDate", () => {
    const result = createAbsenceRequestSchema.safeParse({
      ...validInput,
      startDate: "2026-03-14T00:00:00.000Z",
      endDate: "2026-03-10T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("endDate");
    }
  });

  it("accepts same-day range (startDate === endDate)", () => {
    const result = createAbsenceRequestSchema.safeParse({
      ...validInput,
      startDate: "2026-03-10T00:00:00.000Z",
      endDate: "2026-03-10T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = createAbsenceRequestSchema.safeParse({
      ...validInput,
      type: "INVALID_TYPE",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing employeeId", () => {
    const { employeeId: _, ...withoutEmployee } = validInput;
    const result = createAbsenceRequestSchema.safeParse(withoutEmployee);
    expect(result.success).toBe(false);
  });

  it("rejects missing type", () => {
    const { type: _, ...withoutType } = validInput;
    const result = createAbsenceRequestSchema.safeParse(withoutType);
    expect(result.success).toBe(false);
  });

  it("rejects missing startDate", () => {
    const { startDate: _, ...withoutStart } = validInput;
    const result = createAbsenceRequestSchema.safeParse(withoutStart);
    expect(result.success).toBe(false);
  });

  it("rejects missing endDate", () => {
    const { endDate: _, ...withoutEnd } = validInput;
    const result = createAbsenceRequestSchema.safeParse(withoutEnd);
    expect(result.success).toBe(false);
  });

  it("rejects invalid employeeId format", () => {
    const result = createAbsenceRequestSchema.safeParse({
      ...validInput,
      employeeId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reason exceeding 500 characters", () => {
    const result = createAbsenceRequestSchema.safeParse({
      ...validInput,
      reason: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid datetime format", () => {
    const result = createAbsenceRequestSchema.safeParse({
      ...validInput,
      startDate: "2026-03-10",
    });
    expect(result.success).toBe(false);
  });
});

describe("reviewAbsenceSchema", () => {
  it("accepts approve action without rejectionReason", () => {
    const result = reviewAbsenceSchema.safeParse({
      absenceId: validUuid,
      action: "approve",
    });
    expect(result.success).toBe(true);
  });

  it("accepts approve action with rejectionReason (ignored)", () => {
    const result = reviewAbsenceSchema.safeParse({
      absenceId: validUuid,
      action: "approve",
      rejectionReason: "Not needed but provided",
    });
    expect(result.success).toBe(true);
  });

  it("accepts reject action with rejectionReason", () => {
    const result = reviewAbsenceSchema.safeParse({
      absenceId: validUuid,
      action: "reject",
      rejectionReason: "Scheduling conflict",
    });
    expect(result.success).toBe(true);
  });

  it("rejects reject action without rejectionReason", () => {
    const result = reviewAbsenceSchema.safeParse({
      absenceId: validUuid,
      action: "reject",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("rejectionReason");
    }
  });

  it("rejects reject action with empty rejectionReason", () => {
    const result = reviewAbsenceSchema.safeParse({
      absenceId: validUuid,
      action: "reject",
      rejectionReason: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reject action with whitespace-only rejectionReason", () => {
    const result = reviewAbsenceSchema.safeParse({
      absenceId: validUuid,
      action: "reject",
      rejectionReason: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid action", () => {
    const result = reviewAbsenceSchema.safeParse({
      absenceId: validUuid,
      action: "cancel",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid absenceId format", () => {
    const result = reviewAbsenceSchema.safeParse({
      absenceId: "not-a-uuid",
      action: "approve",
    });
    expect(result.success).toBe(false);
  });

  it("rejects rejectionReason exceeding 500 characters", () => {
    const result = reviewAbsenceSchema.safeParse({
      absenceId: validUuid,
      action: "reject",
      rejectionReason: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe("listAbsencesSchema", () => {
  it("accepts all optional filters", () => {
    const result = listAbsencesSchema.safeParse({
      employeeId: validUuid,
      status: "PENDING",
      month: "2026-03",
    });
    expect(result.success).toBe(true);
  });

  it("accepts no filters (all optional)", () => {
    const result = listAbsencesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts employeeId filter alone", () => {
    const result = listAbsencesSchema.safeParse({
      employeeId: validUuid,
    });
    expect(result.success).toBe(true);
  });

  it.each(ABSENCE_STATUSES)("accepts status filter %s", (status) => {
    const result = listAbsencesSchema.safeParse({ status });
    expect(result.success).toBe(true);
  });

  it("accepts month filter alone", () => {
    const result = listAbsencesSchema.safeParse({
      month: "2026-03",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid month format", () => {
    const result = listAbsencesSchema.safeParse({
      month: "2026-3",
    });
    expect(result.success).toBe(false);
  });

  it("rejects out-of-range month (13)", () => {
    const result = listAbsencesSchema.safeParse({
      month: "2026-13",
    });
    expect(result.success).toBe(false);
  });

  it("rejects month 00", () => {
    const result = listAbsencesSchema.safeParse({
      month: "2026-00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status", () => {
    const result = listAbsencesSchema.safeParse({
      status: "CANCELLED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid employeeId format", () => {
    const result = listAbsencesSchema.safeParse({
      employeeId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("absenceIdSchema", () => {
  it("accepts valid uuid", () => {
    const result = absenceIdSchema.safeParse({ id: validUuid });
    expect(result.success).toBe(true);
  });

  it("rejects invalid uuid", () => {
    const result = absenceIdSchema.safeParse({ id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects missing id", () => {
    const result = absenceIdSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("adminCreateAbsenceSchema", () => {
  const validInput = {
    employeeId: validUuid,
    type: "SICK_LEAVE" as const,
    startDate: "2026-03-17T00:00:00.000Z",
    endDate: "2026-03-19T00:00:00.000Z",
    reason: "Medical certificate provided",
  };

  it("accepts valid admin create input", () => {
    const result = adminCreateAbsenceSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts without reason", () => {
    const { reason: _, ...withoutReason } = validInput;
    const result = adminCreateAbsenceSchema.safeParse(withoutReason);
    expect(result.success).toBe(true);
  });

  it("rejects endDate before startDate", () => {
    const result = adminCreateAbsenceSchema.safeParse({
      ...validInput,
      startDate: "2026-03-19T00:00:00.000Z",
      endDate: "2026-03-17T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it.each(ABSENCE_TYPES)("accepts type %s", (type) => {
    const result = adminCreateAbsenceSchema.safeParse({
      ...validInput,
      type,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = adminCreateAbsenceSchema.safeParse({
      ...validInput,
      type: "SCHOOL",
    });
    expect(result.success).toBe(false);
  });
});

describe("constants", () => {
  it("ABSENCE_TYPES has 5 types", () => {
    expect(ABSENCE_TYPES).toHaveLength(5);
    expect(ABSENCE_TYPES).toEqual([
      "PAID_LEAVE",
      "SICK_LEAVE",
      "TRAINING",
      "CHILD_SICK",
      "OTHER",
    ]);
  });

  it("ABSENCE_STATUSES has 3 statuses", () => {
    expect(ABSENCE_STATUSES).toHaveLength(3);
    expect(ABSENCE_STATUSES).toEqual(["PENDING", "APPROVED", "REJECTED"]);
  });
});
