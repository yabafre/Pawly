import { describe, it, expect } from "vitest";
import { changePasswordSchema } from "./change-password.schema";

describe("changePasswordSchema", () => {
  const valid = { currentPassword: "OldPass1", newPassword: "NewPass1x" };

  it("accepts valid input", () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty current password", () => {
    expect(changePasswordSchema.safeParse({ ...valid, currentPassword: "" }).success).toBe(false);
  });

  it("rejects missing current password", () => {
    expect(changePasswordSchema.safeParse({ newPassword: "NewPass1x" }).success).toBe(false);
  });

  it("rejects short new password", () => {
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: "Ab1" }).success).toBe(false);
  });

  it("rejects new password without uppercase", () => {
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: "newpass1x" }).success).toBe(false);
  });

  it("rejects new password without lowercase", () => {
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: "NEWPASS1X" }).success).toBe(false);
  });

  it("rejects new password without digit", () => {
    expect(changePasswordSchema.safeParse({ ...valid, newPassword: "NewPassxx" }).success).toBe(false);
  });
});
