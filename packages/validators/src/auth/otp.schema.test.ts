import { describe, it, expect } from "vitest";
import { requestOtpSchema, verifyOtpSchema, otpRequestResponseSchema } from "./otp.schema";

describe("requestOtpSchema", () => {
  it("accepts a valid email", () => {
    const result = requestOtpSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = requestOtpSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty email", () => {
    const result = requestOtpSchema.safeParse({ email: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const result = requestOtpSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("verifyOtpSchema", () => {
  it("accepts valid email and 6-digit code", () => {
    const result = verifyOtpSchema.safeParse({ email: "user@example.com", code: "428715" });
    expect(result.success).toBe(true);
  });

  it("accepts boundary code 100000", () => {
    const result = verifyOtpSchema.safeParse({ email: "user@example.com", code: "100000" });
    expect(result.success).toBe(true);
  });

  it("accepts boundary code 999999", () => {
    const result = verifyOtpSchema.safeParse({ email: "user@example.com", code: "999999" });
    expect(result.success).toBe(true);
  });

  it("rejects code with letters", () => {
    const result = verifyOtpSchema.safeParse({ email: "user@example.com", code: "abc123" });
    expect(result.success).toBe(false);
  });

  it("rejects 5-digit code", () => {
    const result = verifyOtpSchema.safeParse({ email: "user@example.com", code: "12345" });
    expect(result.success).toBe(false);
  });

  it("rejects 7-digit code", () => {
    const result = verifyOtpSchema.safeParse({ email: "user@example.com", code: "1234567" });
    expect(result.success).toBe(false);
  });

  it("rejects empty code", () => {
    const result = verifyOtpSchema.safeParse({ email: "user@example.com", code: "" });
    expect(result.success).toBe(false);
  });

  it("rejects code with spaces", () => {
    const result = verifyOtpSchema.safeParse({ email: "user@example.com", code: "12 345" });
    expect(result.success).toBe(false);
  });

  it("rejects missing code", () => {
    const result = verifyOtpSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email with valid code", () => {
    const result = verifyOtpSchema.safeParse({ email: "bad-email", code: "123456" });
    expect(result.success).toBe(false);
  });
});

describe("otpRequestResponseSchema", () => {
  it("accepts method 'otp'", () => {
    const result = otpRequestResponseSchema.safeParse({ method: "otp", message: "Code sent" });
    expect(result.success).toBe(true);
  });

  it("accepts method 'magic_link'", () => {
    const result = otpRequestResponseSchema.safeParse({ method: "magic_link", message: "Link sent" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid method", () => {
    const result = otpRequestResponseSchema.safeParse({ method: "sms", message: "Sent" });
    expect(result.success).toBe(false);
  });

  it("rejects missing message", () => {
    const result = otpRequestResponseSchema.safeParse({ method: "otp" });
    expect(result.success).toBe(false);
  });
});
