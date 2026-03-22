import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmployeeCard } from "../_components/EmployeeCard";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      if (params) return `${key}:${JSON.stringify(params)}`;
      return key;
    };
    return t;
  },
}));

const baseEmployee = {
  id: "emp-1",
  firstName: "Léa",
  lastName: "Bernard",
  email: "lea@clinic.fr",
  phone: null,
  jobType: "APPRENTICE",
  contractType: "CDD",
  contractHours: 35,
  color: "#3b82f6",
  isActive: true,
  hireDate: null,
  endDate: null,
};

const handlers = {
  onEdit: vi.fn(),
  onToggleActive: vi.fn(),
  onManageConstraints: vi.fn(),
};

describe("EmployeeCard — school days badge", () => {
  it("shows 'declared' badge for apprentice with schoolDaysDeclared=true", () => {
    render(
      <EmployeeCard
        employee={baseEmployee}
        {...handlers}
        schoolDaysDeclared={true}
      />,
    );

    expect(screen.getByText("schoolDays.declared")).toBeDefined();
  });

  it("shows 'not declared' badge for apprentice with schoolDaysDeclared=false", () => {
    render(
      <EmployeeCard
        employee={baseEmployee}
        {...handlers}
        schoolDaysDeclared={false}
      />,
    );

    expect(screen.getByText("schoolDays.notDeclared")).toBeDefined();
  });

  it("does not show school days badge for non-apprentice employees", () => {
    render(
      <EmployeeCard
        employee={{ ...baseEmployee, jobType: "VET" }}
        {...handlers}
        schoolDaysDeclared={true}
      />,
    );

    expect(screen.queryByText("schoolDays.declared")).toBeNull();
    expect(screen.queryByText("schoolDays.notDeclared")).toBeNull();
  });

  it("does not show school days badge when prop is undefined", () => {
    render(
      <EmployeeCard
        employee={baseEmployee}
        {...handlers}
      />,
    );

    expect(screen.queryByText("schoolDays.declared")).toBeNull();
    expect(screen.queryByText("schoolDays.notDeclared")).toBeNull();
  });

  it("renders declared badge with emerald styling", () => {
    const { container } = render(
      <EmployeeCard
        employee={baseEmployee}
        {...handlers}
        schoolDaysDeclared={true}
      />,
    );

    const badge = screen.getByText("schoolDays.declared").closest("[data-slot='badge']");
    expect(badge?.classList.contains("border-border")).toBe(true);
  });

  it("renders not-declared badge with amber styling", () => {
    const { container } = render(
      <EmployeeCard
        employee={baseEmployee}
        {...handlers}
        schoolDaysDeclared={false}
      />,
    );

    const badge = screen.getByText("schoolDays.notDeclared").closest("[data-slot='badge']");
    expect(badge?.classList.contains("border-border")).toBe(true);
  });
});
