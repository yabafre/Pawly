import { describe, it, expect } from "vitest";
import {
  updateClinicNameSchema,
  updateWorkDaysSchema,
  updateWorkHoursSchema,
  createShiftTypesSchema,
  completeOnboardingSchema,
  updateClinicConfigSchema,
} from "./onboarding.schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validShiftType = {
  name: "Morning",
  code: "AM",
  startTime: "08:00",
  endTime: "12:00",
  color: "#FF5733",
};

const validCompleteOnboarding = {
  clinicName: "Happy Paws Clinic",
  workDays: ["MONDAY", "TUESDAY", "WEDNESDAY"] as const,
  defaultStartTime: "08:30",
  defaultEndTime: "18:30",
  shiftTypes: [validShiftType],
};

// ---------------------------------------------------------------------------
// updateClinicNameSchema
// ---------------------------------------------------------------------------

describe("updateClinicNameSchema", () => {
  it("should reject an empty string", () => {
    const result = updateClinicNameSchema.safeParse({ clinicName: "" });
    expect(result.success).toBe(false);
  });

  it("should reject a name shorter than 2 characters", () => {
    const result = updateClinicNameSchema.safeParse({ clinicName: "A" });
    expect(result.success).toBe(false);
  });

  it("should reject a name longer than 100 characters", () => {
    const result = updateClinicNameSchema.safeParse({
      clinicName: "X".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("should accept a valid clinic name", () => {
    const result = updateClinicNameSchema.safeParse({
      clinicName: "Happy Paws Clinic",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ clinicName: "Happy Paws Clinic" });
  });

  it("should accept a name with exactly 2 characters", () => {
    const result = updateClinicNameSchema.safeParse({ clinicName: "AB" });
    expect(result.success).toBe(true);
  });

  it("should accept a name with exactly 100 characters", () => {
    const result = updateClinicNameSchema.safeParse({
      clinicName: "A".repeat(100),
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateWorkDaysSchema
// ---------------------------------------------------------------------------

describe("updateWorkDaysSchema", () => {
  it("should reject an empty array", () => {
    const result = updateWorkDaysSchema.safeParse({ workDays: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "At least one work day is required",
      );
    }
  });

  it("should reject invalid day names", () => {
    const result = updateWorkDaysSchema.safeParse({
      workDays: ["NOTADAY"],
    });
    expect(result.success).toBe(false);
  });

  it("should reject lowercase day names", () => {
    const result = updateWorkDaysSchema.safeParse({
      workDays: ["monday"],
    });
    expect(result.success).toBe(false);
  });

  it("should accept a valid single-day array", () => {
    const result = updateWorkDaysSchema.safeParse({
      workDays: ["MONDAY"],
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ workDays: ["MONDAY"] });
  });

  it("should accept a valid multi-day array", () => {
    const result = updateWorkDaysSchema.safeParse({
      workDays: ["MONDAY", "WEDNESDAY", "FRIDAY"],
    });
    expect(result.success).toBe(true);
    expect(result.data!.workDays).toHaveLength(3);
  });

  it("should accept all seven days", () => {
    const result = updateWorkDaysSchema.safeParse({
      workDays: [
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
        "SUNDAY",
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data!.workDays).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// updateWorkHoursSchema
// ---------------------------------------------------------------------------

describe("updateWorkHoursSchema", () => {
  it("should reject an invalid time format for start time", () => {
    const result = updateWorkHoursSchema.safeParse({
      defaultStartTime: "8:30",
      defaultEndTime: "18:30",
    });
    expect(result.success).toBe(false);
  });

  it("should reject an invalid time format for end time", () => {
    const result = updateWorkHoursSchema.safeParse({
      defaultStartTime: "08:30",
      defaultEndTime: "6pm",
    });
    expect(result.success).toBe(false);
  });

  it("should reject when end time equals start time", () => {
    const result = updateWorkHoursSchema.safeParse({
      defaultStartTime: "09:00",
      defaultEndTime: "09:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const endTimeIssue = result.error.issues.find(
        (i) => i.path.includes("defaultEndTime"),
      );
      expect(endTimeIssue?.message).toBe("End time must be after start time");
    }
  });

  it("should reject when end time is before start time", () => {
    const result = updateWorkHoursSchema.safeParse({
      defaultStartTime: "18:00",
      defaultEndTime: "08:00",
    });
    expect(result.success).toBe(false);
  });

  it("should accept a valid time range", () => {
    const result = updateWorkHoursSchema.safeParse({
      defaultStartTime: "08:30",
      defaultEndTime: "18:30",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      defaultStartTime: "08:30",
      defaultEndTime: "18:30",
    });
  });

  it("should accept a narrow valid time range", () => {
    const result = updateWorkHoursSchema.safeParse({
      defaultStartTime: "09:00",
      defaultEndTime: "09:01",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createShiftTypesSchema
// ---------------------------------------------------------------------------

describe("createShiftTypesSchema", () => {
  it("should reject an empty shiftTypes array", () => {
    const result = createShiftTypesSchema.safeParse({ shiftTypes: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "At least one shift type is required",
      );
    }
  });

  it("should reject a shift type with missing name", () => {
    const { name: _, ...noName } = validShiftType;
    const result = createShiftTypesSchema.safeParse({
      shiftTypes: [noName],
    });
    expect(result.success).toBe(false);
  });

  it("should reject a shift type with missing code", () => {
    const { code: _, ...noCode } = validShiftType;
    const result = createShiftTypesSchema.safeParse({
      shiftTypes: [noCode],
    });
    expect(result.success).toBe(false);
  });

  it("should reject a shift type with missing startTime", () => {
    const { startTime: _, ...noStart } = validShiftType;
    const result = createShiftTypesSchema.safeParse({
      shiftTypes: [noStart],
    });
    expect(result.success).toBe(false);
  });

  it("should reject a shift type with missing endTime", () => {
    const { endTime: _, ...noEnd } = validShiftType;
    const result = createShiftTypesSchema.safeParse({
      shiftTypes: [noEnd],
    });
    expect(result.success).toBe(false);
  });

  it("should reject a shift type with missing color", () => {
    const { color: _, ...noColor } = validShiftType;
    const result = createShiftTypesSchema.safeParse({
      shiftTypes: [noColor],
    });
    expect(result.success).toBe(false);
  });

  it("should reject an invalid hex color (no hash)", () => {
    const result = createShiftTypesSchema.safeParse({
      shiftTypes: [{ ...validShiftType, color: "FF5733" }],
    });
    expect(result.success).toBe(false);
  });

  it("should reject an invalid hex color (short format)", () => {
    const result = createShiftTypesSchema.safeParse({
      shiftTypes: [{ ...validShiftType, color: "#FFF" }],
    });
    expect(result.success).toBe(false);
  });

  it("should reject an invalid hex color (non-hex characters)", () => {
    const result = createShiftTypesSchema.safeParse({
      shiftTypes: [{ ...validShiftType, color: "#ZZZZZZ" }],
    });
    expect(result.success).toBe(false);
  });

  it("should reject a shift type with an invalid time format", () => {
    const result = createShiftTypesSchema.safeParse({
      shiftTypes: [{ ...validShiftType, startTime: "8AM" }],
    });
    expect(result.success).toBe(false);
  });

  it("should accept valid shift types", () => {
    const result = createShiftTypesSchema.safeParse({
      shiftTypes: [validShiftType],
    });
    expect(result.success).toBe(true);
    expect(result.data!.shiftTypes).toHaveLength(1);
  });

  it("should accept multiple valid shift types", () => {
    const result = createShiftTypesSchema.safeParse({
      shiftTypes: [
        validShiftType,
        {
          name: "Afternoon",
          code: "PM",
          startTime: "13:00",
          endTime: "18:00",
          color: "#33FF57",
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data!.shiftTypes).toHaveLength(2);
  });

  it("should uppercase the code field", () => {
    const result = createShiftTypesSchema.safeParse({
      shiftTypes: [{ ...validShiftType, code: "am" }],
    });
    expect(result.success).toBe(true);
    expect(result.data!.shiftTypes[0].code).toBe("AM");
  });
});

// ---------------------------------------------------------------------------
// completeOnboardingSchema
// ---------------------------------------------------------------------------

describe("completeOnboardingSchema", () => {
  it("should reject when clinicName is missing", () => {
    const { clinicName: _, ...rest } = validCompleteOnboarding;
    const result = completeOnboardingSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("should reject when workDays is missing", () => {
    const { workDays: _, ...rest } = validCompleteOnboarding;
    const result = completeOnboardingSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("should reject when defaultStartTime is missing", () => {
    const { defaultStartTime: _, ...rest } = validCompleteOnboarding;
    const result = completeOnboardingSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("should reject when defaultEndTime is missing", () => {
    const { defaultEndTime: _, ...rest } = validCompleteOnboarding;
    const result = completeOnboardingSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("should reject when shiftTypes is missing", () => {
    const { shiftTypes: _, ...rest } = validCompleteOnboarding;
    const result = completeOnboardingSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("should reject when workDays array is empty", () => {
    const result = completeOnboardingSchema.safeParse({
      ...validCompleteOnboarding,
      workDays: [],
    });
    expect(result.success).toBe(false);
  });

  it("should reject when shiftTypes array is empty", () => {
    const result = completeOnboardingSchema.safeParse({
      ...validCompleteOnboarding,
      shiftTypes: [],
    });
    expect(result.success).toBe(false);
  });

  it("should reject an invalid clinicName within complete data", () => {
    const result = completeOnboardingSchema.safeParse({
      ...validCompleteOnboarding,
      clinicName: "A",
    });
    expect(result.success).toBe(false);
  });

  it("should accept valid complete onboarding data", () => {
    const result = completeOnboardingSchema.safeParse(validCompleteOnboarding);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      ...validCompleteOnboarding,
      // code gets uppercased by the transform
      shiftTypes: [
        { ...validShiftType, code: validShiftType.code.toUpperCase() },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// updateClinicConfigSchema (combined workDays + workHours with refine)
// ---------------------------------------------------------------------------

describe("updateClinicConfigSchema", () => {
  const validConfig = {
    workDays: ["MONDAY", "FRIDAY"] as const,
    defaultStartTime: "08:00",
    defaultEndTime: "17:00",
  };

  it("should reject when workDays is missing", () => {
    const { workDays: _, ...rest } = validConfig;
    const result = updateClinicConfigSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("should reject when defaultStartTime is missing", () => {
    const { defaultStartTime: _, ...rest } = validConfig;
    const result = updateClinicConfigSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("should reject when defaultEndTime is missing", () => {
    const { defaultEndTime: _, ...rest } = validConfig;
    const result = updateClinicConfigSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("should reject an empty workDays array", () => {
    const result = updateClinicConfigSchema.safeParse({
      ...validConfig,
      workDays: [],
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid day names in workDays", () => {
    const result = updateClinicConfigSchema.safeParse({
      ...validConfig,
      workDays: ["FUNDAY"],
    });
    expect(result.success).toBe(false);
  });

  it("should reject when end time equals start time", () => {
    const result = updateClinicConfigSchema.safeParse({
      ...validConfig,
      defaultStartTime: "10:00",
      defaultEndTime: "10:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const endTimeIssue = result.error.issues.find(
        (i) => i.path.includes("defaultEndTime"),
      );
      expect(endTimeIssue?.message).toBe("End time must be after start time");
    }
  });

  it("should reject when end time is before start time", () => {
    const result = updateClinicConfigSchema.safeParse({
      ...validConfig,
      defaultStartTime: "18:00",
      defaultEndTime: "08:00",
    });
    expect(result.success).toBe(false);
  });

  it("should reject an invalid time format in the combined schema", () => {
    const result = updateClinicConfigSchema.safeParse({
      ...validConfig,
      defaultStartTime: "8:00",
    });
    expect(result.success).toBe(false);
  });

  it("should accept valid combined config data", () => {
    const result = updateClinicConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(validConfig);
  });

  it("should accept valid config with all seven days", () => {
    const result = updateClinicConfigSchema.safeParse({
      ...validConfig,
      workDays: [
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
        "SUNDAY",
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data!.workDays).toHaveLength(7);
  });
});
