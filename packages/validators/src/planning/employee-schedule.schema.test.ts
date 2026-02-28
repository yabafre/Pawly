import { describe, it, expect } from "vitest";
import {
  getEmployeeScheduleSchema,
  employeeShiftSchema,
  employeeUnavailabilitySchema,
  employeeWeeklySummarySchema,
  employeeShiftTypeInfoSchema,
  employeeScheduleDataSchema,
} from "./employee-schedule.schema";

// ── Fixtures ──────────────────────────────────────────────────────────

const VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const VALID_UUID_2 = "b2c3d4e5-f6a7-8901-bcde-f12345678901";

const validShift = {
  id: VALID_UUID,
  date: "2026-03-15",
  startTime: "08:00",
  endTime: "17:00",
  shiftTypeCode: "MORNING",
  breakMinutes: 60,
  isConfirmed: true,
  source: "GENERATED" as const,
};

const validUnavailability = {
  date: "2026-03-20",
  type: "VACATION" as const,
  reason: "Family trip",
};

const validWeeklySummary = {
  weekNumber: 12,
  totalMinutes: 2100,
  shiftCount: 5,
  contractMinutes: 2100,
};

const validShiftTypeInfo = {
  code: "MORNING",
  label: "Matin",
  color: "#4CAF50",
  breakMinutes: 60,
};

const validEmployee = {
  id: VALID_UUID_2,
  firstName: "Marie",
  lastName: "Dupont",
  jobType: "ASV",
  contractHours: 35,
  color: "#2196F3",
};

const validScheduleData = {
  month: "2026-03",
  employee: validEmployee,
  shifts: [validShift],
  unavailabilities: [validUnavailability],
  publicationStatus: {
    status: "DRAFT" as const,
    publishedAt: null,
  },
  weeklySummary: [validWeeklySummary],
  shiftTypes: [validShiftTypeInfo],
};

// ── getEmployeeScheduleSchema ─────────────────────────────────────────

describe("getEmployeeScheduleSchema", () => {
  it("accepts valid month in YYYY-MM format", () => {
    const result = getEmployeeScheduleSchema.safeParse({ month: "2026-03" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (month is optional)", () => {
    const result = getEmployeeScheduleSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts month 01 (January)", () => {
    const result = getEmployeeScheduleSchema.safeParse({ month: "2026-01" });
    expect(result.success).toBe(true);
  });

  it("accepts month 12 (December)", () => {
    const result = getEmployeeScheduleSchema.safeParse({ month: "2026-12" });
    expect(result.success).toBe(true);
  });

  it("rejects month 13 (out of range)", () => {
    const result = getEmployeeScheduleSchema.safeParse({ month: "2026-13" });
    expect(result.success).toBe(false);
  });

  it("rejects month 00 (out of range)", () => {
    const result = getEmployeeScheduleSchema.safeParse({ month: "2026-00" });
    expect(result.success).toBe(false);
  });

  it("rejects non-zero-padded month YYYY-M", () => {
    const result = getEmployeeScheduleSchema.safeParse({ month: "2026-1" });
    expect(result.success).toBe(false);
  });

  it("rejects non-date string", () => {
    const result = getEmployeeScheduleSchema.safeParse({
      month: "not-a-month",
    });
    expect(result.success).toBe(false);
  });

  it("rejects full date YYYY-MM-DD", () => {
    const result = getEmployeeScheduleSchema.safeParse({
      month: "2026-03-15",
    });
    expect(result.success).toBe(false);
  });
});

// ── employeeShiftSchema ───────────────────────────────────────────────

describe("employeeShiftSchema", () => {
  it("accepts a valid complete shift", () => {
    const result = employeeShiftSchema.safeParse(validShift);
    expect(result.success).toBe(true);
  });

  it("accepts shift with MANUAL source", () => {
    const result = employeeShiftSchema.safeParse({
      ...validShift,
      source: "MANUAL",
    });
    expect(result.success).toBe(true);
  });

  it("accepts shift with breakMinutes 0", () => {
    const result = employeeShiftSchema.safeParse({
      ...validShift,
      breakMinutes: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts shift with isConfirmed false", () => {
    const result = employeeShiftSchema.safeParse({
      ...validShift,
      isConfirmed: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const { id: _, ...noId } = validShift;
    const result = employeeShiftSchema.safeParse(noId);
    expect(result.success).toBe(false);
  });

  it("rejects missing date", () => {
    const { date: _, ...noDate } = validShift;
    const result = employeeShiftSchema.safeParse(noDate);
    expect(result.success).toBe(false);
  });

  it("rejects missing startTime", () => {
    const { startTime: _, ...noStart } = validShift;
    const result = employeeShiftSchema.safeParse(noStart);
    expect(result.success).toBe(false);
  });

  it("rejects missing endTime", () => {
    const { endTime: _, ...noEnd } = validShift;
    const result = employeeShiftSchema.safeParse(noEnd);
    expect(result.success).toBe(false);
  });

  it("rejects missing shiftTypeCode", () => {
    const { shiftTypeCode: _, ...noCode } = validShift;
    const result = employeeShiftSchema.safeParse(noCode);
    expect(result.success).toBe(false);
  });

  it("rejects missing source", () => {
    const { source: _, ...noSource } = validShift;
    const result = employeeShiftSchema.safeParse(noSource);
    expect(result.success).toBe(false);
  });

  it("rejects negative breakMinutes", () => {
    const result = employeeShiftSchema.safeParse({
      ...validShift,
      breakMinutes: -10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer breakMinutes", () => {
    const result = employeeShiftSchema.safeParse({
      ...validShift,
      breakMinutes: 30.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid id (not uuid)", () => {
    const result = employeeShiftSchema.safeParse({
      ...validShift,
      id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = employeeShiftSchema.safeParse({
      ...validShift,
      date: "15/03/2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid startTime format", () => {
    const result = employeeShiftSchema.safeParse({
      ...validShift,
      startTime: "8:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid endTime format", () => {
    const result = employeeShiftSchema.safeParse({
      ...validShift,
      endTime: "5pm",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid source value", () => {
    const result = employeeShiftSchema.safeParse({
      ...validShift,
      source: "AUTO",
    });
    expect(result.success).toBe(false);
  });
});

// ── employeeUnavailabilitySchema ──────────────────────────────────────

describe("employeeUnavailabilitySchema", () => {
  it("accepts valid unavailability with VACATION type", () => {
    const result = employeeUnavailabilitySchema.safeParse(validUnavailability);
    expect(result.success).toBe(true);
  });

  it("accepts each valid type", () => {
    const types = ["VACATION", "SICK", "SCHOOL", "OTHER"] as const;
    for (const type of types) {
      const result = employeeUnavailabilitySchema.safeParse({
        date: "2026-03-20",
        type,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts unavailability without reason (optional)", () => {
    const result = employeeUnavailabilitySchema.safeParse({
      date: "2026-03-20",
      type: "SICK",
    });
    expect(result.success).toBe(true);
  });

  it("accepts unavailability with reason", () => {
    const result = employeeUnavailabilitySchema.safeParse({
      date: "2026-03-20",
      type: "OTHER",
      reason: "Personal appointment",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = employeeUnavailabilitySchema.safeParse({
      date: "2026-03-20",
      type: "HOLIDAY",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing date", () => {
    const result = employeeUnavailabilitySchema.safeParse({
      type: "VACATION",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing type", () => {
    const result = employeeUnavailabilitySchema.safeParse({
      date: "2026-03-20",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = employeeUnavailabilitySchema.safeParse({
      date: "20-03-2026",
      type: "VACATION",
    });
    expect(result.success).toBe(false);
  });
});

// ── employeeWeeklySummarySchema ───────────────────────────────────────

describe("employeeWeeklySummarySchema", () => {
  it("accepts a valid weekly summary", () => {
    const result = employeeWeeklySummarySchema.safeParse(validWeeklySummary);
    expect(result.success).toBe(true);
  });

  it("accepts week number 1 (minimum)", () => {
    const result = employeeWeeklySummarySchema.safeParse({
      ...validWeeklySummary,
      weekNumber: 1,
    });
    expect(result.success).toBe(true);
  });

  it("accepts week number 53 (maximum)", () => {
    const result = employeeWeeklySummarySchema.safeParse({
      ...validWeeklySummary,
      weekNumber: 53,
    });
    expect(result.success).toBe(true);
  });

  it("rejects week number 0 (below minimum)", () => {
    const result = employeeWeeklySummarySchema.safeParse({
      ...validWeeklySummary,
      weekNumber: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects week number 54 (above maximum)", () => {
    const result = employeeWeeklySummarySchema.safeParse({
      ...validWeeklySummary,
      weekNumber: 54,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative week number", () => {
    const result = employeeWeeklySummarySchema.safeParse({
      ...validWeeklySummary,
      weekNumber: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer week number", () => {
    const result = employeeWeeklySummarySchema.safeParse({
      ...validWeeklySummary,
      weekNumber: 12.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative totalMinutes", () => {
    const result = employeeWeeklySummarySchema.safeParse({
      ...validWeeklySummary,
      totalMinutes: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative shiftCount", () => {
    const result = employeeWeeklySummarySchema.safeParse({
      ...validWeeklySummary,
      shiftCount: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative contractMinutes", () => {
    const result = employeeWeeklySummarySchema.safeParse({
      ...validWeeklySummary,
      contractMinutes: -50,
    });
    expect(result.success).toBe(false);
  });

  it("accepts zero values for minutes and counts", () => {
    const result = employeeWeeklySummarySchema.safeParse({
      weekNumber: 1,
      totalMinutes: 0,
      shiftCount: 0,
      contractMinutes: 0,
    });
    expect(result.success).toBe(true);
  });
});

// ── employeeShiftTypeInfoSchema ───────────────────────────────────────

describe("employeeShiftTypeInfoSchema", () => {
  it("accepts a valid shift type info", () => {
    const result = employeeShiftTypeInfoSchema.safeParse(validShiftTypeInfo);
    expect(result.success).toBe(true);
  });

  it("rejects missing code", () => {
    const { code: _, ...noCode } = validShiftTypeInfo;
    const result = employeeShiftTypeInfoSchema.safeParse(noCode);
    expect(result.success).toBe(false);
  });

  it("rejects missing label", () => {
    const { label: _, ...noLabel } = validShiftTypeInfo;
    const result = employeeShiftTypeInfoSchema.safeParse(noLabel);
    expect(result.success).toBe(false);
  });

  it("rejects missing color", () => {
    const { color: _, ...noColor } = validShiftTypeInfo;
    const result = employeeShiftTypeInfoSchema.safeParse(noColor);
    expect(result.success).toBe(false);
  });

  it("rejects negative breakMinutes", () => {
    const result = employeeShiftTypeInfoSchema.safeParse({
      ...validShiftTypeInfo,
      breakMinutes: -5,
    });
    expect(result.success).toBe(false);
  });
});

// ── employeeScheduleDataSchema ────────────────────────────────────────

describe("employeeScheduleDataSchema", () => {
  it("accepts a valid complete schedule response", () => {
    const result = employeeScheduleDataSchema.safeParse(validScheduleData);
    expect(result.success).toBe(true);
  });

  it("accepts schedule with empty shifts array", () => {
    const result = employeeScheduleDataSchema.safeParse({
      ...validScheduleData,
      shifts: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts schedule with empty unavailabilities array", () => {
    const result = employeeScheduleDataSchema.safeParse({
      ...validScheduleData,
      unavailabilities: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts schedule with PUBLISHED status and publishedAt date", () => {
    const result = employeeScheduleDataSchema.safeParse({
      ...validScheduleData,
      publicationStatus: {
        status: "PUBLISHED",
        publishedAt: "2026-03-01T10:00:00Z",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts schedule with DRAFT status and null publishedAt", () => {
    const result = employeeScheduleDataSchema.safeParse({
      ...validScheduleData,
      publicationStatus: {
        status: "DRAFT",
        publishedAt: null,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts schedule with multiple shifts", () => {
    const secondShift = {
      ...validShift,
      id: VALID_UUID_2,
      date: "2026-03-16",
      source: "MANUAL" as const,
    };
    const result = employeeScheduleDataSchema.safeParse({
      ...validScheduleData,
      shifts: [validShift, secondShift],
    });
    expect(result.success).toBe(true);
  });

  it("accepts schedule with multiple weekly summaries", () => {
    const result = employeeScheduleDataSchema.safeParse({
      ...validScheduleData,
      weeklySummary: [
        validWeeklySummary,
        { ...validWeeklySummary, weekNumber: 13 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing month", () => {
    const { month: _, ...noMonth } = validScheduleData;
    const result = employeeScheduleDataSchema.safeParse(noMonth);
    expect(result.success).toBe(false);
  });

  it("rejects missing employee", () => {
    const { employee: _, ...noEmployee } = validScheduleData;
    const result = employeeScheduleDataSchema.safeParse(noEmployee);
    expect(result.success).toBe(false);
  });

  it("rejects invalid month format", () => {
    const result = employeeScheduleDataSchema.safeParse({
      ...validScheduleData,
      month: "March 2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid employee id", () => {
    const result = employeeScheduleDataSchema.safeParse({
      ...validScheduleData,
      employee: { ...validEmployee, id: "bad-uuid" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid publication status", () => {
    const result = employeeScheduleDataSchema.safeParse({
      ...validScheduleData,
      publicationStatus: {
        status: "ARCHIVED",
        publishedAt: null,
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing shifts array", () => {
    const { shifts: _, ...noShifts } = validScheduleData;
    const result = employeeScheduleDataSchema.safeParse(noShifts);
    expect(result.success).toBe(false);
  });

  it("rejects missing weeklySummary array", () => {
    const { weeklySummary: _, ...noSummary } = validScheduleData;
    const result = employeeScheduleDataSchema.safeParse(noSummary);
    expect(result.success).toBe(false);
  });

  it("rejects missing shiftTypes array", () => {
    const { shiftTypes: _, ...noTypes } = validScheduleData;
    const result = employeeScheduleDataSchema.safeParse(noTypes);
    expect(result.success).toBe(false);
  });

  it("rejects invalid shift within shifts array", () => {
    const result = employeeScheduleDataSchema.safeParse({
      ...validScheduleData,
      shifts: [{ ...validShift, breakMinutes: -5 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid unavailability within array", () => {
    const result = employeeScheduleDataSchema.safeParse({
      ...validScheduleData,
      unavailabilities: [{ date: "2026-03-20", type: "HOLIDAY" }],
    });
    expect(result.success).toBe(false);
  });
});
