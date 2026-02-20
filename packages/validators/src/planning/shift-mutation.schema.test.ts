import { describe, it, expect } from "vitest";
import {
  moveShiftInputSchema,
  createManualShiftInputSchema,
  deleteShiftInputSchema,
  preValidateMoveInputSchema,
} from "./shift-mutation.schema";

// ── Test helpers ─────────────────────────────────────────────────────────

const VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const VALID_UUID_2 = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
const VALID_DATE = "2026-03-15";
const VALID_TIME = "08:30";

// ── moveShiftInputSchema ─────────────────────────────────────────────────

describe("moveShiftInputSchema", () => {
  it("accepts valid input with shiftId and targetEmployeeId", () => {
    const result = moveShiftInputSchema.safeParse({
      shiftId: VALID_UUID,
      targetEmployeeId: VALID_UUID_2,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with shiftId and targetDate", () => {
    const result = moveShiftInputSchema.safeParse({
      shiftId: VALID_UUID,
      targetDate: VALID_DATE,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with both targetEmployeeId and targetDate", () => {
    const result = moveShiftInputSchema.safeParse({
      shiftId: VALID_UUID,
      targetEmployeeId: VALID_UUID_2,
      targetDate: VALID_DATE,
    });
    expect(result.success).toBe(true);
  });

  it("rejects input with neither targetEmployeeId nor targetDate", () => {
    const result = moveShiftInputSchema.safeParse({
      shiftId: VALID_UUID,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("At least one");
    }
  });

  it("rejects input with invalid shiftId UUID", () => {
    const result = moveShiftInputSchema.safeParse({
      shiftId: "not-a-uuid",
      targetEmployeeId: VALID_UUID_2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects input with invalid targetEmployeeId UUID", () => {
    const result = moveShiftInputSchema.safeParse({
      shiftId: VALID_UUID,
      targetEmployeeId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects input with invalid targetDate format", () => {
    const result = moveShiftInputSchema.safeParse({
      shiftId: VALID_UUID,
      targetDate: "15-03-2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects input with missing shiftId", () => {
    const result = moveShiftInputSchema.safeParse({
      targetEmployeeId: VALID_UUID_2,
    });
    expect(result.success).toBe(false);
  });
});

// ── createManualShiftInputSchema ──────────────────────────────────────────

describe("createManualShiftInputSchema", () => {
  const validInput = {
    employeeId: VALID_UUID,
    date: VALID_DATE,
    shiftTypeCode: "SURGERY",
    startTime: "08:30",
    endTime: "18:30",
  };

  it("accepts valid input with all required fields", () => {
    const result = createManualShiftInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts valid input with breakMinutes", () => {
    const result = createManualShiftInputSchema.safeParse({
      ...validInput,
      breakMinutes: 30,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.breakMinutes).toBe(30);
    }
  });

  it("defaults breakMinutes to 0 when not provided", () => {
    const result = createManualShiftInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.breakMinutes).toBe(0);
    }
  });

  it("rejects input with missing employeeId", () => {
    const { employeeId: _, ...input } = validInput;
    const result = createManualShiftInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects input with missing date", () => {
    const { date: _, ...input } = validInput;
    const result = createManualShiftInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects input with missing shiftTypeCode", () => {
    const { shiftTypeCode: _, ...input } = validInput;
    const result = createManualShiftInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects input with empty shiftTypeCode", () => {
    const result = createManualShiftInputSchema.safeParse({
      ...validInput,
      shiftTypeCode: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects input with missing startTime", () => {
    const { startTime: _, ...input } = validInput;
    const result = createManualShiftInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects input with missing endTime", () => {
    const { endTime: _, ...input } = validInput;
    const result = createManualShiftInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects input with invalid date format", () => {
    const result = createManualShiftInputSchema.safeParse({
      ...validInput,
      date: "2026/03/15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects input with invalid time format", () => {
    const result = createManualShiftInputSchema.safeParse({
      ...validInput,
      startTime: "8:30",
    });
    expect(result.success).toBe(false);
  });

  it("rejects input with invalid employeeId UUID", () => {
    const result = createManualShiftInputSchema.safeParse({
      ...validInput,
      employeeId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative breakMinutes", () => {
    const result = createManualShiftInputSchema.safeParse({
      ...validInput,
      breakMinutes: -5,
    });
    expect(result.success).toBe(false);
  });
});

// ── deleteShiftInputSchema ───────────────────────────────────────────────

describe("deleteShiftInputSchema", () => {
  it("accepts valid input with shiftId UUID", () => {
    const result = deleteShiftInputSchema.safeParse({
      shiftId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("rejects input with invalid UUID", () => {
    const result = deleteShiftInputSchema.safeParse({
      shiftId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects input with missing shiftId", () => {
    const result = deleteShiftInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ── preValidateMoveInputSchema ───────────────────────────────────────────

describe("preValidateMoveInputSchema", () => {
  it("accepts valid input with all required fields", () => {
    const result = preValidateMoveInputSchema.safeParse({
      shiftId: VALID_UUID,
      targetEmployeeId: VALID_UUID_2,
      targetDate: VALID_DATE,
    });
    expect(result.success).toBe(true);
  });

  it("rejects input with missing shiftId", () => {
    const result = preValidateMoveInputSchema.safeParse({
      targetEmployeeId: VALID_UUID_2,
      targetDate: VALID_DATE,
    });
    expect(result.success).toBe(false);
  });

  it("rejects input with missing targetEmployeeId", () => {
    const result = preValidateMoveInputSchema.safeParse({
      shiftId: VALID_UUID,
      targetDate: VALID_DATE,
    });
    expect(result.success).toBe(false);
  });

  it("rejects input with missing targetDate", () => {
    const result = preValidateMoveInputSchema.safeParse({
      shiftId: VALID_UUID,
      targetEmployeeId: VALID_UUID_2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects input with invalid UUID for shiftId", () => {
    const result = preValidateMoveInputSchema.safeParse({
      shiftId: "bad",
      targetEmployeeId: VALID_UUID_2,
      targetDate: VALID_DATE,
    });
    expect(result.success).toBe(false);
  });

  it("rejects input with invalid date format", () => {
    const result = preValidateMoveInputSchema.safeParse({
      shiftId: VALID_UUID,
      targetEmployeeId: VALID_UUID_2,
      targetDate: "March 15, 2026",
    });
    expect(result.success).toBe(false);
  });
});
