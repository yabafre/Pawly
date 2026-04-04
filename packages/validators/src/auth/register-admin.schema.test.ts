import { describe, it, expect } from "vitest";
import {
  registerAdminInputSchema,
  registerAdminFormSchema,
} from "./register-admin.schema";

const validInput = {
  clinicName: "Clinique Vétérinaire du Parc",
  adminName: "Dr. Martin",
  email: "admin@clinic.com",
  password: "Password1",
  turnstileToken: "token-abc-123",
};

describe("registerAdminInputSchema", () => {
  it("accepts valid input", () => {
    const result = registerAdminInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("trims and lowercases email", () => {
    const result = registerAdminInputSchema.safeParse({
      ...validInput,
      email: "  Admin@Clinic.COM  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("admin@clinic.com");
    }
  });

  it("trims clinicName", () => {
    const result = registerAdminInputSchema.safeParse({
      ...validInput,
      clinicName: "  My Clinic  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clinicName).toBe("My Clinic");
    }
  });

  it("trims adminName", () => {
    const result = registerAdminInputSchema.safeParse({
      ...validInput,
      adminName: "  Dr. Martin  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.adminName).toBe("Dr. Martin");
    }
  });

  it("rejects clinicName shorter than 2 chars", () => {
    expect(
      registerAdminInputSchema.safeParse({ ...validInput, clinicName: "A" }).success
    ).toBe(false);
  });

  it("rejects clinicName longer than 100 chars", () => {
    expect(
      registerAdminInputSchema.safeParse({
        ...validInput,
        clinicName: "A".repeat(101),
      }).success
    ).toBe(false);
  });

  it("rejects adminName shorter than 2 chars", () => {
    expect(
      registerAdminInputSchema.safeParse({ ...validInput, adminName: "A" }).success
    ).toBe(false);
  });

  it("rejects adminName longer than 100 chars", () => {
    expect(
      registerAdminInputSchema.safeParse({
        ...validInput,
        adminName: "A".repeat(101),
      }).success
    ).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(
      registerAdminInputSchema.safeParse({ ...validInput, email: "not-email" }).success
    ).toBe(false);
  });

  it("rejects empty email", () => {
    expect(
      registerAdminInputSchema.safeParse({ ...validInput, email: "" }).success
    ).toBe(false);
  });

  it("rejects password shorter than 8 chars", () => {
    expect(
      registerAdminInputSchema.safeParse({ ...validInput, password: "Pass1" }).success
    ).toBe(false);
  });

  it("rejects password without uppercase", () => {
    expect(
      registerAdminInputSchema.safeParse({ ...validInput, password: "password1" }).success
    ).toBe(false);
  });

  it("rejects password without lowercase", () => {
    expect(
      registerAdminInputSchema.safeParse({ ...validInput, password: "PASSWORD1" }).success
    ).toBe(false);
  });

  it("rejects password without digit", () => {
    expect(
      registerAdminInputSchema.safeParse({ ...validInput, password: "Passwordd" }).success
    ).toBe(false);
  });

  it("rejects empty turnstileToken", () => {
    expect(
      registerAdminInputSchema.safeParse({ ...validInput, turnstileToken: "" }).success
    ).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(registerAdminInputSchema.safeParse({}).success).toBe(false);
  });
});

describe("registerAdminFormSchema", () => {
  const validForm = {
    ...validInput,
    passwordConfirm: "Password1",
  };

  it("accepts valid form with matching passwords", () => {
    expect(registerAdminFormSchema.safeParse(validForm).success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = registerAdminFormSchema.safeParse({
      ...validForm,
      passwordConfirm: "DifferentPass1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing passwordConfirm", () => {
    const { passwordConfirm: _, ...withoutConfirm } = validForm;
    expect(registerAdminFormSchema.safeParse(withoutConfirm).success).toBe(false);
  });
});
