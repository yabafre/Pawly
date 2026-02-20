import { describe, it, expect } from "vitest";
import {
  listApprenticeDeclarationsSchema,
  upsertNoSchoolSchema,
  deleteDeclarationSchema,
  getDeclarationStatusSchema,
  apprenticeDeclarationRowSchema,
} from "./apprentice-declaration.schema";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("listApprenticeDeclarationsSchema", () => {
  it("accepts valid YYYY-MM month", () => {
    const result = listApprenticeDeclarationsSchema.safeParse({ month: "2026-03" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid month format", () => {
    expect(listApprenticeDeclarationsSchema.safeParse({ month: "2026-3" }).success).toBe(false);
    expect(listApprenticeDeclarationsSchema.safeParse({ month: "2026-13" }).success).toBe(false);
    expect(listApprenticeDeclarationsSchema.safeParse({ month: "2026" }).success).toBe(false);
  });
});

describe("upsertNoSchoolSchema", () => {
  it("accepts valid input", () => {
    const result = upsertNoSchoolSchema.safeParse({
      employeeId: VALID_UUID,
      month: "2026-02",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID employeeId", () => {
    const result = upsertNoSchoolSchema.safeParse({
      employeeId: "not-uuid",
      month: "2026-02",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid month", () => {
    const result = upsertNoSchoolSchema.safeParse({
      employeeId: VALID_UUID,
      month: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

describe("deleteDeclarationSchema", () => {
  it("accepts valid input", () => {
    const result = deleteDeclarationSchema.safeParse({
      employeeId: VALID_UUID,
      month: "2026-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing fields", () => {
    expect(deleteDeclarationSchema.safeParse({}).success).toBe(false);
    expect(deleteDeclarationSchema.safeParse({ employeeId: VALID_UUID }).success).toBe(false);
  });
});

describe("getDeclarationStatusSchema", () => {
  it("accepts valid month", () => {
    const result = getDeclarationStatusSchema.safeParse({ month: "2026-06" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid month", () => {
    const result = getDeclarationStatusSchema.safeParse({ month: "06-2026" });
    expect(result.success).toBe(false);
  });
});

describe("apprenticeDeclarationRowSchema", () => {
  it("accepts valid row with each status", () => {
    for (const status of ["SCHOOL_DAYS_PROVIDED", "NO_SCHOOL_THIS_MONTH", "MISSING"] as const) {
      const result = apprenticeDeclarationRowSchema.safeParse({
        employeeId: VALID_UUID,
        firstName: "Alice",
        lastName: "Dupont",
        status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    const result = apprenticeDeclarationRowSchema.safeParse({
      employeeId: VALID_UUID,
      firstName: "Alice",
      lastName: "Dupont",
      status: "INVALID",
    });
    expect(result.success).toBe(false);
  });
});
