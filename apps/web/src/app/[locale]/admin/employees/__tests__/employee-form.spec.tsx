import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmployeeForm } from "../_components/EmployeeForm";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    return t;
  },
  useLocale: () => "fr",
}));

// Mock @tanstack/react-form
vi.mock("@tanstack/react-form", () => ({
  useForm: vi.fn().mockImplementation(({ defaultValues }) => ({
    Field: ({ name, children }: any) =>
      children({
        state: {
          value: defaultValues?.[name] ?? "",
          meta: { errors: [] },
        },
        handleChange: vi.fn(),
        handleBlur: vi.fn(),
      }),
    Subscribe: ({ selector, children }: any) => {
      // Simulate selector: return contractType default so both date fields render
      // Use "CDD" to ensure endDate field is visible in tests
      return children("CDD");
    },
    handleSubmit: vi.fn(),
  })),
}));

// Mock validators
vi.mock("@pawly/validators", () => ({
  JOB_TYPES: ["VET", "ASV", "APPRENTICE"],
  CONTRACT_TYPES: ["CDI", "CDD", "APPRENTICESHIP"],
  employeeFieldsSchema: {
    shape: {
      firstName: { safeParse: vi.fn().mockReturnValue({ success: true }) },
      lastName: { safeParse: vi.fn().mockReturnValue({ success: true }) },
      email: { safeParse: vi.fn().mockReturnValue({ success: true }) },
      contractHours: { safeParse: vi.fn().mockReturnValue({ success: true }) },
    },
  },
}));

// Mock UI components
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: any) => <button>{children}</button>,
  SelectValue: () => <span>value</span>,
}));

describe("EmployeeForm", () => {
  const mockOnSubmit = vi.fn();

  it("renders all form fields", () => {
    render(
      <EmployeeForm mode="create" onSubmit={mockOnSubmit} isPending={false} />,
    );

    expect(screen.getByText("form.firstName")).toBeDefined();
    expect(screen.getByText("form.lastName")).toBeDefined();
    expect(screen.getByText(/form\.email/)).toBeDefined();
    expect(screen.getByText("form.phone")).toBeDefined();
    expect(screen.getByText("form.jobType")).toBeDefined();
    expect(screen.getByText("form.contractType")).toBeDefined();
    expect(screen.getByText("form.contractHours")).toBeDefined();
    expect(screen.getByText("form.color")).toBeDefined();
    expect(screen.getAllByText("form.hireDate").length).toBeGreaterThan(0);
    expect(screen.getAllByText("form.endDate").length).toBeGreaterThan(0);
  });

  it("renders save button", () => {
    render(
      <EmployeeForm mode="create" onSubmit={mockOnSubmit} isPending={false} />,
    );

    expect(screen.getByText("actions.save")).toBeDefined();
  });

  it("disables save button when isPending", () => {
    render(
      <EmployeeForm mode="create" onSubmit={mockOnSubmit} isPending={true} />,
    );

    expect(screen.getByText("...")).toBeDefined();
  });

  it("renders with edit mode default values", () => {
    render(
      <EmployeeForm
        mode="edit"
        defaultValues={{
          id: "emp-1",
          firstName: "Jean",
          lastName: "Dupont",
          email: "jean@clinic.fr",
          phone: "+33612345678",
          jobType: "VET",
          contractType: "CDI",
          contractHours: 35,
          color: "#3b82f6",
        }}
        onSubmit={mockOnSubmit}
        isPending={false}
      />,
    );

    expect(screen.getByText("form.firstName")).toBeDefined();
  });
});
