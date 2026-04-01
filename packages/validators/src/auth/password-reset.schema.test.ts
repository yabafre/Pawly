import { describe, it, expect } from "vitest";
import {
  requestPasswordResetSchema,
  resetPasswordInputSchema,
  resetPasswordFormSchema,
} from "./password-reset.schema";

describe("requestPasswordResetSchema", () => {
  it("accepts valid email", () => {
    expect(requestPasswordResetSchema.safeParse({ email: "admin@clinic.com" }).success).toBe(true);
  });

  it("rejects missing email", () => {
    expect(requestPasswordResetSchema.safeParse({}).success).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(requestPasswordResetSchema.safeParse({ email: "not-email" }).success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(requestPasswordResetSchema.safeParse({ email: "" }).success).toBe(false);
  });
});

describe("resetPasswordInputSchema", () => {
  const validToken = "a".repeat(64);
  const validPassword = "Password1";

  it("accepts valid token + password", () => {
    expect(resetPasswordInputSchema.safeParse({ token: validToken, password: validPassword }).success).toBe(true);
  });

  it("rejects short password", () => {
    expect(resetPasswordInputSchema.safeParse({ token: validToken, password: "Short1" }).success).toBe(false);
  });

  it("rejects password without uppercase", () => {
    expect(resetPasswordInputSchema.safeParse({ token: validToken, password: "password1" }).success).toBe(false);
  });

  it("rejects password without lowercase", () => {
    expect(resetPasswordInputSchema.safeParse({ token: validToken, password: "PASSWORD1" }).success).toBe(false);
  });

  it("rejects password without digit", () => {
    expect(resetPasswordInputSchema.safeParse({ token: validToken, password: "Passwordx" }).success).toBe(false);
  });

  it("rejects invalid token format (too short)", () => {
    expect(resetPasswordInputSchema.safeParse({ token: "abc123", password: validPassword }).success).toBe(false);
  });

  it("rejects invalid token format (non-hex)", () => {
    expect(resetPasswordInputSchema.safeParse({ token: "z".repeat(64), password: validPassword }).success).toBe(false);
  });

  it("rejects missing token", () => {
    expect(resetPasswordInputSchema.safeParse({ password: validPassword }).success).toBe(false);
  });

  it("rejects missing password", () => {
    expect(resetPasswordInputSchema.safeParse({ token: validToken }).success).toBe(false);
  });
});

describe("resetPasswordFormSchema", () => {
  const validToken = "b".repeat(64);

  it("accepts matching passwords", () => {
    const result = resetPasswordFormSchema.safeParse({
      token: validToken,
      password: "NewPass1x",
      passwordConfirm: "NewPass1x",
    });
    expect(result.success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = resetPasswordFormSchema.safeParse({
      token: validToken,
      password: "NewPass1x",
      passwordConfirm: "DiffPass1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("passwordConfirm");
    }
  });

  it("rejects weak password even with matching confirm", () => {
    const result = resetPasswordFormSchema.safeParse({
      token: validToken,
      password: "weak",
      passwordConfirm: "weak",
    });
    expect(result.success).toBe(false);
  });
});
