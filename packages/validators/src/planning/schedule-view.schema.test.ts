import { describe, it, expect } from "vitest";
import {
  scheduleViewInputSchema,
  weekNavigationSchema,
  scheduleEmployeeSchema,
  scheduleDayInfoSchema,
  scheduleShiftSchema,
  scheduleUnavailabilitySchema,
  scheduleHoleSchema,
  scheduleViewDataSchema,
} from "./schedule-view.schema";

// ── Helpers ───────────────────────────────────────────────────────────

const validUuid = "550e8400-e29b-41d4-a716-446655440000";
const validUuid2 = "550e8400-e29b-41d4-a716-446655440001";
const validUuid3 = "550e8400-e29b-41d4-a716-446655440002";

describe("scheduleViewInputSchema", () => {
  it("should accept valid YYYY-MM month", () => {
    const result = scheduleViewInputSchema.safeParse({ month: "2026-03" });
    expect(result.success).toBe(true);
  });

  it("should accept month at year boundaries (01 and 12)", () => {
    expect(
      scheduleViewInputSchema.safeParse({ month: "2026-01" }).success
    ).toBe(true);
    expect(
      scheduleViewInputSchema.safeParse({ month: "2026-12" }).success
    ).toBe(true);
  });

  it("should reject non-zero-padded month '2026-3'", () => {
    const result = scheduleViewInputSchema.safeParse({ month: "2026-3" });
    expect(result.success).toBe(false);
  });

  it("should reject invalid month '2026-00'", () => {
    const result = scheduleViewInputSchema.safeParse({ month: "2026-00" });
    expect(result.success).toBe(false);
  });

  it("should reject invalid month '2026-13'", () => {
    const result = scheduleViewInputSchema.safeParse({ month: "2026-13" });
    expect(result.success).toBe(false);
  });

  it("should reject text format 'March 2026'", () => {
    const result = scheduleViewInputSchema.safeParse({
      month: "March 2026",
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty string", () => {
    const result = scheduleViewInputSchema.safeParse({ month: "" });
    expect(result.success).toBe(false);
  });

  it("should reject missing month", () => {
    const result = scheduleViewInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("weekNavigationSchema", () => {
  it("should accept weekOffset 0", () => {
    const result = weekNavigationSchema.safeParse({ weekOffset: 0 });
    expect(result.success).toBe(true);
  });

  it("should accept weekOffset 3 (mid-range)", () => {
    const result = weekNavigationSchema.safeParse({ weekOffset: 3 });
    expect(result.success).toBe(true);
  });

  it("should accept weekOffset 5 (max)", () => {
    const result = weekNavigationSchema.safeParse({ weekOffset: 5 });
    expect(result.success).toBe(true);
  });

  it("should reject negative weekOffset", () => {
    const result = weekNavigationSchema.safeParse({ weekOffset: -1 });
    expect(result.success).toBe(false);
  });

  it("should reject weekOffset > 5", () => {
    const result = weekNavigationSchema.safeParse({ weekOffset: 6 });
    expect(result.success).toBe(false);
  });

  it("should reject float weekOffset", () => {
    const result = weekNavigationSchema.safeParse({ weekOffset: 2.5 });
    expect(result.success).toBe(false);
  });

  it("should reject missing weekOffset", () => {
    const result = weekNavigationSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("scheduleEmployeeSchema", () => {
  it("should accept valid employee data", () => {
    const result = scheduleEmployeeSchema.safeParse({
      id: validUuid,
      firstName: "Alice",
      lastName: "Martin",
      color: "#FF5733",
      jobType: "VETERINARIAN",
      contractHours: 35,
    });
    expect(result.success).toBe(true);
  });

  it("should accept employee with null color", () => {
    const result = scheduleEmployeeSchema.safeParse({
      id: validUuid,
      firstName: "Bob",
      lastName: "Dupont",
      color: null,
      jobType: "ASV",
      contractHours: 28,
    });
    expect(result.success).toBe(true);
  });

  it("should accept employee with contractHours 0", () => {
    const result = scheduleEmployeeSchema.safeParse({
      id: validUuid,
      firstName: "Claire",
      lastName: "Petit",
      color: null,
      jobType: "ASV",
      contractHours: 0,
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid UUID for id", () => {
    const result = scheduleEmployeeSchema.safeParse({
      id: "not-a-uuid",
      firstName: "Alice",
      lastName: "Martin",
      color: null,
      jobType: "VETERINARIAN",
      contractHours: 35,
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty firstName", () => {
    const result = scheduleEmployeeSchema.safeParse({
      id: validUuid,
      firstName: "",
      lastName: "Martin",
      color: null,
      jobType: "VETERINARIAN",
      contractHours: 35,
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty lastName", () => {
    const result = scheduleEmployeeSchema.safeParse({
      id: validUuid,
      firstName: "Alice",
      lastName: "",
      color: null,
      jobType: "VETERINARIAN",
      contractHours: 35,
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty jobType", () => {
    const result = scheduleEmployeeSchema.safeParse({
      id: validUuid,
      firstName: "Alice",
      lastName: "Martin",
      color: null,
      jobType: "",
      contractHours: 35,
    });
    expect(result.success).toBe(false);
  });

  it("should reject negative contractHours", () => {
    const result = scheduleEmployeeSchema.safeParse({
      id: validUuid,
      firstName: "Alice",
      lastName: "Martin",
      color: null,
      jobType: "VETERINARIAN",
      contractHours: -5,
    });
    expect(result.success).toBe(false);
  });
});

describe("scheduleDayInfoSchema", () => {
  it("should accept valid work day", () => {
    const result = scheduleDayInfoSchema.safeParse({
      date: "2026-03-15",
      dayOfWeek: 1,
      isWorkDay: true,
      isClosed: false,
      isSpecialDay: false,
    });
    expect(result.success).toBe(true);
  });

  it("should accept day with specialDayLabel", () => {
    const result = scheduleDayInfoSchema.safeParse({
      date: "2026-12-25",
      dayOfWeek: 4,
      isWorkDay: false,
      isClosed: true,
      isSpecialDay: true,
      specialDayLabel: "Christmas",
    });
    expect(result.success).toBe(true);
  });

  it("should accept dayOfWeek 1 (Monday) through 7 (Sunday)", () => {
    for (let day = 1; day <= 7; day++) {
      const result = scheduleDayInfoSchema.safeParse({
        date: "2026-03-15",
        dayOfWeek: day,
        isWorkDay: true,
        isClosed: false,
        isSpecialDay: false,
      });
      expect(result.success).toBe(true);
    }
  });

  it("should reject dayOfWeek 0", () => {
    const result = scheduleDayInfoSchema.safeParse({
      date: "2026-03-15",
      dayOfWeek: 0,
      isWorkDay: true,
      isClosed: false,
      isSpecialDay: false,
    });
    expect(result.success).toBe(false);
  });

  it("should reject dayOfWeek 8", () => {
    const result = scheduleDayInfoSchema.safeParse({
      date: "2026-03-15",
      dayOfWeek: 8,
      isWorkDay: true,
      isClosed: false,
      isSpecialDay: false,
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid date format", () => {
    const result = scheduleDayInfoSchema.safeParse({
      date: "15/03/2026",
      dayOfWeek: 1,
      isWorkDay: true,
      isClosed: false,
      isSpecialDay: false,
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing date", () => {
    const result = scheduleDayInfoSchema.safeParse({
      dayOfWeek: 1,
      isWorkDay: true,
      isClosed: false,
      isSpecialDay: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("scheduleShiftSchema", () => {
  it("should accept valid GENERATED shift", () => {
    const result = scheduleShiftSchema.safeParse({
      id: validUuid,
      date: "2026-03-15",
      startTime: "08:00",
      endTime: "16:00",
      shiftTypeCode: "SURGERY",
      breakMinutes: 30,
      source: "GENERATED",
      employeeId: validUuid2,
      isConfirmed: false,
    });
    expect(result.success).toBe(true);
  });

  it("should accept valid MANUAL shift", () => {
    const result = scheduleShiftSchema.safeParse({
      id: validUuid,
      date: "2026-03-15",
      startTime: "09:00",
      endTime: "17:00",
      shiftTypeCode: "RECEPTION",
      breakMinutes: 0,
      source: "MANUAL",
      employeeId: validUuid2,
      isConfirmed: true,
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid source value", () => {
    const result = scheduleShiftSchema.safeParse({
      id: validUuid,
      date: "2026-03-15",
      startTime: "08:00",
      endTime: "16:00",
      shiftTypeCode: "SURGERY",
      source: "AUTO",
      employeeId: validUuid2,
      isConfirmed: false,
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid time format for startTime", () => {
    const result = scheduleShiftSchema.safeParse({
      id: validUuid,
      date: "2026-03-15",
      startTime: "8:00",
      endTime: "16:00",
      shiftTypeCode: "SURGERY",
      source: "GENERATED",
      employeeId: validUuid2,
      isConfirmed: false,
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid time format for endTime", () => {
    const result = scheduleShiftSchema.safeParse({
      id: validUuid,
      date: "2026-03-15",
      startTime: "08:00",
      endTime: "4pm",
      shiftTypeCode: "SURGERY",
      source: "GENERATED",
      employeeId: validUuid2,
      isConfirmed: false,
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty shiftTypeCode", () => {
    const result = scheduleShiftSchema.safeParse({
      id: validUuid,
      date: "2026-03-15",
      startTime: "08:00",
      endTime: "16:00",
      shiftTypeCode: "",
      source: "GENERATED",
      employeeId: validUuid2,
      isConfirmed: false,
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid UUID for id", () => {
    const result = scheduleShiftSchema.safeParse({
      id: "not-a-uuid",
      date: "2026-03-15",
      startTime: "08:00",
      endTime: "16:00",
      shiftTypeCode: "SURGERY",
      source: "GENERATED",
      employeeId: validUuid2,
      isConfirmed: false,
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid UUID for employeeId", () => {
    const result = scheduleShiftSchema.safeParse({
      id: validUuid,
      date: "2026-03-15",
      startTime: "08:00",
      endTime: "16:00",
      shiftTypeCode: "SURGERY",
      source: "GENERATED",
      employeeId: "not-a-uuid",
      isConfirmed: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("scheduleUnavailabilitySchema", () => {
  it("should accept VACATION type", () => {
    const result = scheduleUnavailabilitySchema.safeParse({
      employeeId: validUuid,
      date: "2026-03-15",
      type: "VACATION",
      reason: "Annual leave",
    });
    expect(result.success).toBe(true);
  });

  it("should accept SICK type", () => {
    const result = scheduleUnavailabilitySchema.safeParse({
      employeeId: validUuid,
      date: "2026-03-15",
      type: "SICK",
    });
    expect(result.success).toBe(true);
  });

  it("should accept SCHOOL type", () => {
    const result = scheduleUnavailabilitySchema.safeParse({
      employeeId: validUuid,
      date: "2026-03-15",
      type: "SCHOOL",
    });
    expect(result.success).toBe(true);
  });

  it("should accept OTHER type", () => {
    const result = scheduleUnavailabilitySchema.safeParse({
      employeeId: validUuid,
      date: "2026-03-15",
      type: "OTHER",
      reason: "Personal appointment",
    });
    expect(result.success).toBe(true);
  });

  it("should accept without optional reason", () => {
    const result = scheduleUnavailabilitySchema.safeParse({
      employeeId: validUuid,
      date: "2026-03-15",
      type: "VACATION",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid type", () => {
    const result = scheduleUnavailabilitySchema.safeParse({
      employeeId: validUuid,
      date: "2026-03-15",
      type: "HOLIDAY",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid UUID for employeeId", () => {
    const result = scheduleUnavailabilitySchema.safeParse({
      employeeId: "not-a-uuid",
      date: "2026-03-15",
      type: "VACATION",
    });
    expect(result.success).toBe(false);
  });
});

describe("scheduleHoleSchema", () => {
  it("should accept valid hole info", () => {
    const result = scheduleHoleSchema.safeParse({
      date: "2026-03-15",
      shiftTypeCode: "SURGERY",
      requiredStaff: 2,
      assignedStaff: 0,
      reason: "No eligible employees available",
    });
    expect(result.success).toBe(true);
  });

  it("should accept assignedStaff = 0", () => {
    const result = scheduleHoleSchema.safeParse({
      date: "2026-03-15",
      shiftTypeCode: "RECEPTION",
      requiredStaff: 3,
      assignedStaff: 0,
      reason: "All employees on leave",
    });
    expect(result.success).toBe(true);
  });

  it("should reject requiredStaff = 0", () => {
    const result = scheduleHoleSchema.safeParse({
      date: "2026-03-15",
      shiftTypeCode: "SURGERY",
      requiredStaff: 0,
      assignedStaff: 0,
      reason: "No staff required",
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty shiftTypeCode", () => {
    const result = scheduleHoleSchema.safeParse({
      date: "2026-03-15",
      shiftTypeCode: "",
      requiredStaff: 2,
      assignedStaff: 1,
      reason: "Insufficient staff",
    });
    expect(result.success).toBe(false);
  });

  it("should reject negative assignedStaff", () => {
    const result = scheduleHoleSchema.safeParse({
      date: "2026-03-15",
      shiftTypeCode: "SURGERY",
      requiredStaff: 2,
      assignedStaff: -1,
      reason: "Error",
    });
    expect(result.success).toBe(false);
  });
});

describe("scheduleViewDataSchema", () => {
  const validScheduleViewData = {
    month: "2026-03",
    employees: [
      {
        id: validUuid,
        firstName: "Alice",
        lastName: "Martin",
        color: "#FF5733",
        jobType: "VETERINARIAN",
        contractHours: 35,
      },
    ],
    days: [
      {
        date: "2026-03-02",
        dayOfWeek: 1,
        isWorkDay: true,
        isClosed: false,
        isSpecialDay: false,
      },
    ],
    shifts: [
      {
        id: validUuid2,
        date: "2026-03-02",
        startTime: "08:00",
        endTime: "16:00",
        shiftTypeCode: "SURGERY",
        breakMinutes: 30,
        source: "GENERATED" as const,
        employeeId: validUuid,
        isConfirmed: false,
      },
    ],
    unavailabilities: [
      {
        employeeId: validUuid,
        date: "2026-03-05",
        type: "VACATION" as const,
        reason: "Annual leave",
      },
    ],
    holes: [
      {
        date: "2026-03-10",
        shiftTypeCode: "RECEPTION",
        requiredStaff: 2,
        assignedStaff: 1,
        reason: "Not enough eligible employees",
      },
    ],
    violations: {
      hard: [],
      soft: [
        {
          ruleId: validUuid3,
          ruleName: "Contract compliance",
          category: "CONTRACT_COMPLIANCE",
          message: "Employee exceeds 35h/week",
          severity: "warning" as const,
        },
      ],
    },
    templateId: validUuid3,
  };

  it("should accept valid full schedule view data", () => {
    const result = scheduleViewDataSchema.safeParse(validScheduleViewData);
    expect(result.success).toBe(true);
  });

  it("should accept empty arrays for all collections", () => {
    const result = scheduleViewDataSchema.safeParse({
      month: "2026-03",
      employees: [],
      days: [],
      shifts: [],
      unavailabilities: [],
      holes: [],
      violations: { hard: [], soft: [] },
    });
    expect(result.success).toBe(true);
  });

  it("should accept without optional templateId", () => {
    const { templateId, ...withoutTemplate } = validScheduleViewData;
    const result = scheduleViewDataSchema.safeParse(withoutTemplate);
    expect(result.success).toBe(true);
  });

  it("should accept hard violations with optional fields", () => {
    const result = scheduleViewDataSchema.safeParse({
      ...validScheduleViewData,
      violations: {
        hard: [
          {
            ruleId: validUuid3,
            ruleName: "Min 2 vets per surgery shift",
            category: "STAFFING_MINIMUM",
            message: "Only 1 vet assigned, minimum 2 required",
            affectedEmployeeId: validUuid,
            affectedDate: "2026-03-02",
            severity: "blocking",
          },
        ],
        soft: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid month in view data", () => {
    const result = scheduleViewDataSchema.safeParse({
      ...validScheduleViewData,
      month: "2026-13",
    });
    expect(result.success).toBe(false);
  });

  it("should reject hard violation with severity 'warning'", () => {
    const result = scheduleViewDataSchema.safeParse({
      ...validScheduleViewData,
      violations: {
        hard: [
          {
            ruleId: validUuid3,
            ruleName: "Test rule",
            category: "STAFFING_MINIMUM",
            message: "Test message",
            severity: "warning",
          },
        ],
        soft: [],
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject soft violation with severity 'blocking'", () => {
    const result = scheduleViewDataSchema.safeParse({
      ...validScheduleViewData,
      violations: {
        hard: [],
        soft: [
          {
            ruleId: validUuid3,
            ruleName: "Test rule",
            category: "ROTATION_EQUITY",
            message: "Test message",
            severity: "blocking",
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing violations object", () => {
    const { violations, ...withoutViolations } = validScheduleViewData;
    const result = scheduleViewDataSchema.safeParse(withoutViolations);
    expect(result.success).toBe(false);
  });
});
