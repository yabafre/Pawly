import { describe, it, expect } from "vitest";
import {
  confirmShiftSchema,
  noShowDetectionSchema,
  DEVIATION_THRESHOLD_MINUTES,
} from "./presence-confirmation.schema";

const validUuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

// ── DEVIATION_THRESHOLD_MINUTES ───────────────────────────────────────

describe("DEVIATION_THRESHOLD_MINUTES", () => {
  it("equals 15", () => {
    expect(DEVIATION_THRESHOLD_MINUTES).toBe(15);
  });
});

// ── confirmShiftSchema ────────────────────────────────────────────────

describe("confirmShiftSchema", () => {
  it("accepts valid shiftId without actualStartTime", () => {
    const result = confirmShiftSchema.safeParse({ shiftId: validUuid });
    expect(result.success).toBe(true);
  });

  it("accepts valid shiftId with valid actualStartTime", () => {
    const result = confirmShiftSchema.safeParse({
      shiftId: validUuid,
      actualStartTime: "2026-02-28T08:30:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects actualStartTime with timezone offset (only UTC Z accepted)", () => {
    const result = confirmShiftSchema.safeParse({
      shiftId: validUuid,
      actualStartTime: "2026-02-28T09:30:00+01:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing shiftId", () => {
    const result = confirmShiftSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid shiftId (not uuid)", () => {
    const result = confirmShiftSchema.safeParse({ shiftId: "not-a-uuid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("shiftId");
    }
  });

  it("rejects empty string shiftId", () => {
    const result = confirmShiftSchema.safeParse({ shiftId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid actualStartTime (not ISO datetime)", () => {
    const result = confirmShiftSchema.safeParse({
      shiftId: validUuid,
      actualStartTime: "2026-02-28",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("actualStartTime");
    }
  });

  it("rejects actualStartTime as plain text", () => {
    const result = confirmShiftSchema.safeParse({
      shiftId: validUuid,
      actualStartTime: "not-a-datetime",
    });
    expect(result.success).toBe(false);
  });

  it("rejects actualStartTime as number", () => {
    const result = confirmShiftSchema.safeParse({
      shiftId: validUuid,
      actualStartTime: 1709107800000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects null shiftId", () => {
    const result = confirmShiftSchema.safeParse({ shiftId: null });
    expect(result.success).toBe(false);
  });

  it("accepts undefined actualStartTime explicitly", () => {
    const result = confirmShiftSchema.safeParse({
      shiftId: validUuid,
      actualStartTime: undefined,
    });
    expect(result.success).toBe(true);
  });

  it("strips extra properties", () => {
    const result = confirmShiftSchema.safeParse({
      shiftId: validUuid,
      extraField: "should be stripped",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("extraField");
    }
  });
});

// ── noShowDetectionSchema ─────────────────────────────────────────────

describe("noShowDetectionSchema", () => {
  it("accepts valid date YYYY-MM-DD", () => {
    const result = noShowDetectionSchema.safeParse({ date: "2026-02-28" });
    expect(result.success).toBe(true);
  });

  it("accepts date with day 01", () => {
    const result = noShowDetectionSchema.safeParse({ date: "2026-01-01" });
    expect(result.success).toBe(true);
  });

  it("accepts date with day 31", () => {
    const result = noShowDetectionSchema.safeParse({ date: "2026-01-31" });
    expect(result.success).toBe(true);
  });

  it("rejects missing date", () => {
    const result = noShowDetectionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid format YYYY-M-D", () => {
    const result = noShowDetectionSchema.safeParse({ date: "2026-2-8" });
    expect(result.success).toBe(false);
  });

  it("rejects month 00", () => {
    const result = noShowDetectionSchema.safeParse({ date: "2026-00-15" });
    expect(result.success).toBe(false);
  });

  it("rejects month 13", () => {
    const result = noShowDetectionSchema.safeParse({ date: "2026-13-15" });
    expect(result.success).toBe(false);
  });

  it("rejects day 00", () => {
    const result = noShowDetectionSchema.safeParse({ date: "2026-02-00" });
    expect(result.success).toBe(false);
  });

  it("rejects day 32", () => {
    const result = noShowDetectionSchema.safeParse({ date: "2026-02-32" });
    expect(result.success).toBe(false);
  });
});
