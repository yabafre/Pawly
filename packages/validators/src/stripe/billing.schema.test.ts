import { describe, it, expect } from "vitest";
import {
  createBillingPortalSessionSchema,
  subscriptionDetailsSchema,
  invoiceSchema,
  billingOverviewSchema,
} from "./billing.schema";

describe("createBillingPortalSessionSchema", () => {
  it("should accept valid input with returnUrl", () => {
    const result = createBillingPortalSessionSchema.safeParse({
      returnUrl: "https://example.com/admin/billing",
    });
    expect(result.success).toBe(true);
  });

  it("should accept valid input with returnUrl and locale", () => {
    const result = createBillingPortalSessionSchema.safeParse({
      returnUrl: "https://example.com/fr/admin/billing",
      locale: "fr",
    });
    expect(result.success).toBe(true);
  });

  it("should accept locale 'en'", () => {
    const result = createBillingPortalSessionSchema.safeParse({
      returnUrl: "https://example.com/en/admin/billing",
      locale: "en",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing returnUrl", () => {
    const result = createBillingPortalSessionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should reject invalid URL format", () => {
    const result = createBillingPortalSessionSchema.safeParse({
      returnUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid locale", () => {
    const result = createBillingPortalSessionSchema.safeParse({
      returnUrl: "https://example.com/billing",
      locale: "de",
    });
    expect(result.success).toBe(false);
  });
});

describe("subscriptionDetailsSchema", () => {
  const validSubscription = {
    status: "active",
    planKey: "starter_monthly",
    planName: "Starter",
    entitlementTier: "starter",
    currentPeriodEnd: "2026-03-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    trialEnd: null,
    priceAmount: 2900,
    priceCurrency: "eur",
    priceInterval: "month",
  };

  it("should accept valid subscription with all fields", () => {
    const result = subscriptionDetailsSchema.safeParse(validSubscription);
    expect(result.success).toBe(true);
  });

  it("should accept all valid status values", () => {
    const statuses = ["trialing", "active", "past_due", "canceled", "unpaid"];
    for (const status of statuses) {
      const result = subscriptionDetailsSchema.safeParse({
        ...validSubscription,
        status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("should reject invalid status value", () => {
    const result = subscriptionDetailsSchema.safeParse({
      ...validSubscription,
      status: "invalid_status",
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing required fields", () => {
    const result = subscriptionDetailsSchema.safeParse({
      status: "active",
    });
    expect(result.success).toBe(false);
  });

  it("should accept nullable currentPeriodEnd", () => {
    const result = subscriptionDetailsSchema.safeParse({
      ...validSubscription,
      currentPeriodEnd: null,
    });
    expect(result.success).toBe(true);
  });

  it("should accept nullable trialEnd", () => {
    const result = subscriptionDetailsSchema.safeParse({
      ...validSubscription,
      trialEnd: "2026-02-15T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("should accept nullable price fields", () => {
    const result = subscriptionDetailsSchema.safeParse({
      ...validSubscription,
      priceAmount: null,
      priceCurrency: null,
      priceInterval: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("invoiceSchema", () => {
  const validInvoice = {
    id: "in_test_123",
    amountPaid: 2900,
    currency: "eur",
    status: "paid",
    invoicePdf: "https://stripe.com/invoice.pdf",
    hostedInvoiceUrl: "https://stripe.com/invoice",
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-02-01T00:00:00.000Z",
    created: "2026-01-01T00:00:00.000Z",
  };

  it("should accept valid invoice", () => {
    const result = invoiceSchema.safeParse(validInvoice);
    expect(result.success).toBe(true);
  });

  it("should accept all valid invoice statuses", () => {
    const statuses = ["paid", "open", "void", "uncollectible"];
    for (const status of statuses) {
      const result = invoiceSchema.safeParse({
        ...validInvoice,
        status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("should accept nullable invoicePdf", () => {
    const result = invoiceSchema.safeParse({
      ...validInvoice,
      invoicePdf: null,
    });
    expect(result.success).toBe(true);
  });

  it("should accept nullable hostedInvoiceUrl", () => {
    const result = invoiceSchema.safeParse({
      ...validInvoice,
      hostedInvoiceUrl: null,
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing required fields", () => {
    const result = invoiceSchema.safeParse({ id: "in_123" });
    expect(result.success).toBe(false);
  });

  it("should reject invalid status", () => {
    const result = invoiceSchema.safeParse({
      ...validInvoice,
      status: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

describe("billingOverviewSchema", () => {
  const validSubscription = {
    status: "active",
    planKey: "starter_monthly",
    planName: "Starter",
    entitlementTier: "starter",
    currentPeriodEnd: "2026-03-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    trialEnd: null,
    priceAmount: 2900,
    priceCurrency: "eur",
    priceInterval: "month",
  };

  const validInvoice = {
    id: "in_test_123",
    amountPaid: 2900,
    currency: "eur",
    status: "paid",
    invoicePdf: "https://stripe.com/invoice.pdf",
    hostedInvoiceUrl: "https://stripe.com/invoice",
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-02-01T00:00:00.000Z",
    created: "2026-01-01T00:00:00.000Z",
  };

  it("should accept valid billing overview", () => {
    const result = billingOverviewSchema.safeParse({
      subscription: validSubscription,
      invoices: [validInvoice],
    });
    expect(result.success).toBe(true);
  });

  it("should accept empty invoices array", () => {
    const result = billingOverviewSchema.safeParse({
      subscription: validSubscription,
      invoices: [],
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing subscription", () => {
    const result = billingOverviewSchema.safeParse({
      invoices: [validInvoice],
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing invoices", () => {
    const result = billingOverviewSchema.safeParse({
      subscription: validSubscription,
    });
    expect(result.success).toBe(false);
  });
});
