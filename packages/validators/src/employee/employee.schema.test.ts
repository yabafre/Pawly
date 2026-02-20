import { describe, it, expect } from "vitest";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  employeeIdSchema,
  listEmployeesSchema,
  employeeFieldsSchema,
} from "./employee.schema";

describe("employeeFieldsSchema", () => {
  const validData = {
    firstName: "Jean",
    lastName: "Dupont",
    email: "jean@clinic.fr",
    phone: "+33612345678",
    jobType: "VET" as const,
    contractType: "CDI" as const,
    contractHours: 35,
    color: "#3b82f6",
    hireDate: "2024-01-15T00:00:00.000Z",
    endDate: "",
  };

  it("accepts valid employee data", () => {
    const result = employeeFieldsSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("rejects missing firstName", () => {
    const result = employeeFieldsSchema.safeParse({
      ...validData,
      firstName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing lastName", () => {
    const result = employeeFieldsSchema.safeParse({
      ...validData,
      lastName: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty email", () => {
    const result = employeeFieldsSchema.safeParse({
      ...validData,
      email: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email format", () => {
    const result = employeeFieldsSchema.safeParse({
      ...validData,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid email", () => {
    const result = employeeFieldsSchema.safeParse({
      ...validData,
      email: "valid@email.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid jobType", () => {
    const result = employeeFieldsSchema.safeParse({
      ...validData,
      jobType: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid jobTypes", () => {
    for (const jt of ["VET", "ASV", "APPRENTICE"]) {
      const result = employeeFieldsSchema.safeParse({
        ...validData,
        jobType: jt,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid contractType", () => {
    const result = employeeFieldsSchema.safeParse({
      ...validData,
      contractType: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid contractTypes", () => {
    for (const ct of ["CDI", "CDD", "APPRENTICESHIP"]) {
      const result = employeeFieldsSchema.safeParse({
        ...validData,
        contractType: ct,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects contractHours below 1", () => {
    const result = employeeFieldsSchema.safeParse({
      ...validData,
      contractHours: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects contractHours above 48", () => {
    const result = employeeFieldsSchema.safeParse({
      ...validData,
      contractHours: 49,
    });
    expect(result.success).toBe(false);
  });

  it("accepts contractHours at boundaries (1 and 48)", () => {
    expect(
      employeeFieldsSchema.safeParse({ ...validData, contractHours: 1 }).success
    ).toBe(true);
    expect(
      employeeFieldsSchema.safeParse({ ...validData, contractHours: 48 }).success
    ).toBe(true);
  });

  it("rejects invalid hex color", () => {
    const result = employeeFieldsSchema.safeParse({
      ...validData,
      color: "not-a-color",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid hex color", () => {
    const result = employeeFieldsSchema.safeParse({
      ...validData,
      color: "#FF5733",
    });
    expect(result.success).toBe(true);
  });

  it("rejects firstName exceeding 50 characters", () => {
    const result = employeeFieldsSchema.safeParse({
      ...validData,
      firstName: "a".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("rejects lastName exceeding 50 characters", () => {
    const result = employeeFieldsSchema.safeParse({
      ...validData,
      lastName: "a".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("rejects phone exceeding 20 characters", () => {
    const result = employeeFieldsSchema.safeParse({
      ...validData,
      phone: "1".repeat(21),
    });
    expect(result.success).toBe(false);
  });
});

describe("createEmployeeSchema", () => {
  const validData = {
    firstName: "Marie",
    lastName: "Martin",
    email: "",
    phone: "",
    jobType: "ASV" as const,
    contractType: "CDD" as const,
    contractHours: 20,
    color: "#3b82f6",
    hireDate: "2024-01-15T00:00:00.000Z",
    endDate: "2024-12-31T00:00:00.000Z",
  };

  it("accepts valid create data with endDate after hireDate", () => {
    const result = createEmployeeSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("rejects endDate before hireDate", () => {
    const result = createEmployeeSchema.safeParse({
      ...validData,
      hireDate: "2024-12-31T00:00:00.000Z",
      endDate: "2024-01-15T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("allows empty endDate", () => {
    const result = createEmployeeSchema.safeParse({
      ...validData,
      endDate: "",
    });
    expect(result.success).toBe(true);
  });

  it("allows empty hireDate", () => {
    const result = createEmployeeSchema.safeParse({
      ...validData,
      hireDate: "",
      endDate: "",
    });
    expect(result.success).toBe(true);
  });

  it("accepts CDI with endDate before hireDate (CDI skips endDate validation)", () => {
    const result = createEmployeeSchema.safeParse({
      ...validData,
      contractType: "CDI" as const,
      hireDate: "2024-12-31T00:00:00.000Z",
      endDate: "2024-01-15T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects CDD with endDate before hireDate", () => {
    const result = createEmployeeSchema.safeParse({
      ...validData,
      contractType: "CDD" as const,
      hireDate: "2024-12-31T00:00:00.000Z",
      endDate: "2024-01-15T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateEmployeeSchema", () => {
  it("requires an id (UUID)", () => {
    const result = updateEmployeeSchema.safeParse({
      id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid UUID id with partial fields", () => {
    const result = updateEmployeeSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      firstName: "Updated",
    });
    expect(result.success).toBe(true);
  });

  it("accepts id-only update", () => {
    const result = updateEmployeeSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

describe("employeeIdSchema", () => {
  it("accepts valid UUID", () => {
    const result = employeeIdSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID", () => {
    const result = employeeIdSchema.safeParse({ id: "not-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects missing id", () => {
    const result = employeeIdSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("listEmployeesSchema", () => {
  it("accepts empty input (undefined)", () => {
    const result = listEmployeesSchema.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = listEmployeesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts includeInactive filter", () => {
    const result = listEmployeesSchema.safeParse({ includeInactive: true });
    expect(result.success).toBe(true);
  });

  it("accepts jobType filter", () => {
    const result = listEmployeesSchema.safeParse({ jobType: "VET" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid jobType filter", () => {
    const result = listEmployeesSchema.safeParse({ jobType: "INVALID" });
    expect(result.success).toBe(false);
  });

  it("accepts search filter", () => {
    const result = listEmployeesSchema.safeParse({ search: "Jean" });
    expect(result.success).toBe(true);
  });

  it("accepts combined filters", () => {
    const result = listEmployeesSchema.safeParse({
      includeInactive: true,
      jobType: "ASV",
      search: "Mar",
    });
    expect(result.success).toBe(true);
  });
});
