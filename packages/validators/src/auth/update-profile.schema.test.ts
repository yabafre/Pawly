import { describe, it, expect } from "vitest";
import { updateAdminProfileSchema } from "./update-profile.schema";

describe("updateAdminProfileSchema", () => {
  it("accepts name only", () => {
    expect(updateAdminProfileSchema.safeParse({ name: "Dr. Martin" }).success).toBe(true);
  });

  it("accepts locale only", () => {
    expect(updateAdminProfileSchema.safeParse({ locale: "en" }).success).toBe(true);
  });

  it("accepts both", () => {
    expect(updateAdminProfileSchema.safeParse({ name: "Dr. Martin", locale: "fr" }).success).toBe(true);
  });

  it("accepts empty object", () => {
    expect(updateAdminProfileSchema.safeParse({}).success).toBe(true);
  });

  it("rejects name too short", () => {
    expect(updateAdminProfileSchema.safeParse({ name: "A" }).success).toBe(false);
  });

  it("rejects name too long", () => {
    expect(updateAdminProfileSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });

  it("rejects invalid locale", () => {
    expect(updateAdminProfileSchema.safeParse({ locale: "de" }).success).toBe(false);
  });

  it("trims name", () => {
    const result = updateAdminProfileSchema.safeParse({ name: "  Dr. Martin  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Dr. Martin");
  });
});
