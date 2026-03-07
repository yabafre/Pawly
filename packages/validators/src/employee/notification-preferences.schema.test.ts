import { describe, it, expect } from "vitest";
import {
  updateNotificationPreferencesSchema,
  notificationPreferencesResponseSchema,
} from "./notification-preferences.schema";

describe("updateNotificationPreferencesSchema", () => {
  it("should accept notifyOnPublish = true", () => {
    const result = updateNotificationPreferencesSchema.safeParse({ notifyOnPublish: true });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ notifyOnPublish: true });
  });

  it("should accept notifyOnPublish = false", () => {
    const result = updateNotificationPreferencesSchema.safeParse({ notifyOnPublish: false });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ notifyOnPublish: false });
  });

  it("should reject missing notifyOnPublish", () => {
    const result = updateNotificationPreferencesSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should reject non-boolean notifyOnPublish", () => {
    const result = updateNotificationPreferencesSchema.safeParse({ notifyOnPublish: "true" });
    expect(result.success).toBe(false);
  });

  it("should reject null notifyOnPublish", () => {
    const result = updateNotificationPreferencesSchema.safeParse({ notifyOnPublish: null });
    expect(result.success).toBe(false);
  });

  it("should reject number notifyOnPublish", () => {
    const result = updateNotificationPreferencesSchema.safeParse({ notifyOnPublish: 1 });
    expect(result.success).toBe(false);
  });

  it("should strip extra fields", () => {
    const result = updateNotificationPreferencesSchema.safeParse({
      notifyOnPublish: true,
      extra: "field",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ notifyOnPublish: true });
  });
});

describe("notificationPreferencesResponseSchema", () => {
  it("should accept valid response with true", () => {
    const result = notificationPreferencesResponseSchema.safeParse({ notifyOnPublish: true });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ notifyOnPublish: true });
  });

  it("should accept notifyOnPublish = false", () => {
    const result = notificationPreferencesResponseSchema.safeParse({ notifyOnPublish: false });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ notifyOnPublish: false });
  });

  it("should reject missing notifyOnPublish", () => {
    const result = notificationPreferencesResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should reject invalid type", () => {
    const result = notificationPreferencesResponseSchema.safeParse({ notifyOnPublish: "yes" });
    expect(result.success).toBe(false);
  });

  it("should reject null notifyOnPublish", () => {
    const result = notificationPreferencesResponseSchema.safeParse({ notifyOnPublish: null });
    expect(result.success).toBe(false);
  });

  it("should reject number notifyOnPublish", () => {
    const result = notificationPreferencesResponseSchema.safeParse({ notifyOnPublish: 1 });
    expect(result.success).toBe(false);
  });

  it("should strip extra fields", () => {
    const result = notificationPreferencesResponseSchema.safeParse({
      notifyOnPublish: false,
      extra: "x",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ notifyOnPublish: false });
  });
});
