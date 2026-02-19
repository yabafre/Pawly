import { describe, it, expect } from "vitest";
import {
  templateSlotSchema,
  templateDaySchema,
  templateDataSchema,
  createTemplateSchema,
  updateTemplateSchema,
  duplicateTemplateSchema,
  templateIdSchema,
  listTemplatesSchema,
} from "./planning-template.schema";

describe("templateSlotSchema", () => {
  it("accepts valid slot with shiftTypeCode and requiredStaff >= 1", () => {
    const result = templateSlotSchema.safeParse({
      shiftTypeCode: "SURGERY",
      requiredStaff: 2,
    });
    expect(result.success).toBe(true);
  });

  it("accepts slot with optional requiredJobTypes (valid enum values)", () => {
    const result = templateSlotSchema.safeParse({
      shiftTypeCode: "RECEPTION",
      requiredStaff: 1,
      requiredJobTypes: ["VET", "ASV"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts slot without requiredJobTypes", () => {
    const result = templateSlotSchema.safeParse({
      shiftTypeCode: "FORMATION",
      requiredStaff: 3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requiredJobTypes).toBeUndefined();
    }
  });

  it("rejects slot with empty shiftTypeCode", () => {
    const result = templateSlotSchema.safeParse({
      shiftTypeCode: "",
      requiredStaff: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects slot with requiredStaff < 1", () => {
    const result = templateSlotSchema.safeParse({
      shiftTypeCode: "SURGERY",
      requiredStaff: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects slot with non-integer requiredStaff", () => {
    const result = templateSlotSchema.safeParse({
      shiftTypeCode: "SURGERY",
      requiredStaff: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects slot with negative requiredStaff", () => {
    const result = templateSlotSchema.safeParse({
      shiftTypeCode: "SURGERY",
      requiredStaff: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects slot with invalid requiredJobTypes enum values", () => {
    const result = templateSlotSchema.safeParse({
      shiftTypeCode: "SURGERY",
      requiredStaff: 1,
      requiredJobTypes: ["VET", "INVALID_TYPE"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts slot with all three valid job types", () => {
    const result = templateSlotSchema.safeParse({
      shiftTypeCode: "SURGERY",
      requiredStaff: 1,
      requiredJobTypes: ["VET", "ASV", "APPRENTICE"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts slot with empty requiredJobTypes array", () => {
    const result = templateSlotSchema.safeParse({
      shiftTypeCode: "SURGERY",
      requiredStaff: 1,
      requiredJobTypes: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("templateDaySchema", () => {
  it("accepts valid day with dayOfWeek 1-7 and slots array", () => {
    const result = templateDaySchema.safeParse({
      dayOfWeek: 1,
      slots: [{ shiftTypeCode: "SURGERY", requiredStaff: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts day with dayOfWeek 7 (Sunday)", () => {
    const result = templateDaySchema.safeParse({
      dayOfWeek: 7,
      slots: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts day with empty slots array", () => {
    const result = templateDaySchema.safeParse({
      dayOfWeek: 3,
      slots: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects day with dayOfWeek 0 (below range)", () => {
    const result = templateDaySchema.safeParse({
      dayOfWeek: 0,
      slots: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects day with dayOfWeek 8 (above range)", () => {
    const result = templateDaySchema.safeParse({
      dayOfWeek: 8,
      slots: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects day with non-integer dayOfWeek", () => {
    const result = templateDaySchema.safeParse({
      dayOfWeek: 1.5,
      slots: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts day with multiple slots", () => {
    const result = templateDaySchema.safeParse({
      dayOfWeek: 2,
      slots: [
        { shiftTypeCode: "SURGERY", requiredStaff: 2 },
        { shiftTypeCode: "RECEPTION", requiredStaff: 1 },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("templateDataSchema", () => {
  it("accepts valid data with unique dayOfWeek values", () => {
    const result = templateDataSchema.safeParse({
      days: [
        { dayOfWeek: 1, slots: [{ shiftTypeCode: "SURGERY", requiredStaff: 2 }] },
        { dayOfWeek: 2, slots: [{ shiftTypeCode: "RECEPTION", requiredStaff: 1 }] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty days array (minimal template)", () => {
    const result = templateDataSchema.safeParse({
      days: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects data with duplicate dayOfWeek values", () => {
    const result = templateDataSchema.safeParse({
      days: [
        { dayOfWeek: 1, slots: [] },
        { dayOfWeek: 1, slots: [] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts full 7-day template with unique days", () => {
    const result = templateDataSchema.safeParse({
      days: [
        { dayOfWeek: 1, slots: [{ shiftTypeCode: "SURGERY", requiredStaff: 1 }] },
        { dayOfWeek: 2, slots: [{ shiftTypeCode: "SURGERY", requiredStaff: 1 }] },
        { dayOfWeek: 3, slots: [] },
        { dayOfWeek: 4, slots: [{ shiftTypeCode: "RECEPTION", requiredStaff: 2 }] },
        { dayOfWeek: 5, slots: [] },
        { dayOfWeek: 6, slots: [{ shiftTypeCode: "SURGERY", requiredStaff: 1 }] },
        { dayOfWeek: 7, slots: [] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts single day template", () => {
    const result = templateDataSchema.safeParse({
      days: [{ dayOfWeek: 5, slots: [{ shiftTypeCode: "SURGERY", requiredStaff: 3 }] }],
    });
    expect(result.success).toBe(true);
  });
});

describe("createTemplateSchema", () => {
  it("accepts valid create input with name and data", () => {
    const result = createTemplateSchema.safeParse({
      name: "Standard Week",
      data: {
        days: [
          { dayOfWeek: 1, slots: [{ shiftTypeCode: "SURGERY", requiredStaff: 2 }] },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects create with empty name", () => {
    const result = createTemplateSchema.safeParse({
      name: "",
      data: { days: [] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects create with name exceeding 100 characters", () => {
    const result = createTemplateSchema.safeParse({
      name: "a".repeat(101),
      data: { days: [] },
    });
    expect(result.success).toBe(false);
  });

  it("accepts create with name at exactly 100 characters", () => {
    const result = createTemplateSchema.safeParse({
      name: "a".repeat(100),
      data: { days: [] },
    });
    expect(result.success).toBe(true);
  });

  it("accepts create with empty data (minimal template)", () => {
    const result = createTemplateSchema.safeParse({
      name: "Empty Template",
      data: { days: [] },
    });
    expect(result.success).toBe(true);
  });
});

describe("updateTemplateSchema", () => {
  it("accepts valid update with id, name, and data", () => {
    const result = updateTemplateSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Updated Week",
      data: {
        days: [
          { dayOfWeek: 1, slots: [{ shiftTypeCode: "SURGERY", requiredStaff: 2 }] },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects update with invalid uuid", () => {
    const result = updateTemplateSchema.safeParse({
      id: "not-a-uuid",
      name: "Updated",
      data: { days: [] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects update with empty name", () => {
    const result = updateTemplateSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "",
      data: { days: [] },
    });
    expect(result.success).toBe(false);
  });
});

describe("duplicateTemplateSchema", () => {
  it("accepts valid uuid id", () => {
    const result = duplicateTemplateSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid uuid", () => {
    const result = duplicateTemplateSchema.safeParse({
      id: "invalid-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("templateIdSchema", () => {
  it("accepts valid uuid", () => {
    const result = templateIdSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid uuid", () => {
    const result = templateIdSchema.safeParse({
      id: "not-valid",
    });
    expect(result.success).toBe(false);
  });
});

describe("listTemplatesSchema", () => {
  it("accepts empty object", () => {
    const result = listTemplatesSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
