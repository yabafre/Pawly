import { describe, expect, it } from "vitest";
import { updateClinicOperationalConfigSchema } from "./operational-config.schema";

const validPayload = {
  workDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  defaultStartTime: "08:30",
  defaultEndTime: "18:30",
  closedDays: [
    {
      date: "2026-12-25",
      reason: "Christmas",
    },
  ],
  specialDays: [
    {
      date: "2026-12-24",
      startTime: "09:00",
      endTime: "14:00",
      label: "Half-day",
    },
  ],
};

describe("updateClinicOperationalConfigSchema", () => {
  it("accepts a valid payload", () => {
    const result = updateClinicOperationalConfigSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("rejects empty workDays", () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      workDays: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects default end time before default start time", () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      defaultStartTime: "18:00",
      defaultEndTime: "08:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate closed day dates", () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      closedDays: [
        { date: "2026-12-25", reason: "Christmas" },
        { date: "2026-12-25", reason: "Duplicate" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate special day dates", () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      specialDays: [
        {
          date: "2026-12-24",
          startTime: "09:00",
          endTime: "14:00",
          label: "Half-day",
        },
        {
          date: "2026-12-24",
          startTime: "10:00",
          endTime: "13:00",
          label: "Duplicate",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects special day endTime before startTime", () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      specialDays: [
        {
          date: "2026-12-24",
          startTime: "14:00",
          endTime: "10:00",
          label: "Invalid",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      closedDays: [{ date: "24-12-2026", reason: "Invalid" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a date that is both closed and special", () => {
    const result = updateClinicOperationalConfigSchema.safeParse({
      ...validPayload,
      closedDays: [{ date: "2026-12-25", reason: "Holiday" }],
      specialDays: [
        {
          date: "2026-12-25",
          startTime: "09:00",
          endTime: "12:00",
          label: "Conflict",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
