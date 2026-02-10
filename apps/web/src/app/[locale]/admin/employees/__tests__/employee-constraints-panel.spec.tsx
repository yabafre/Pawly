import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EmployeeConstraintsPanel } from "../_components/EmployeeConstraintsPanel";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

const mockCreateConstraint = vi.fn();
const mockUpdateConstraint = vi.fn();
const mockDeleteConstraint = vi.fn();

const mockUseEmployeeConstraints = vi.fn().mockReturnValue({
  constraints: [],
  isPending: false,
  createConstraint: mockCreateConstraint,
  updateConstraint: mockUpdateConstraint,
  deleteConstraint: mockDeleteConstraint,
  isCreating: false,
  isUpdating: false,
  isDeleting: false,
});

vi.mock("../_hooks/useEmployeeConstraints", () => ({
  useEmployeeConstraints: (...args: any[]) => mockUseEmployeeConstraints(...args),
}));

vi.mock("../_components/EmployeeConstraintForm", () => ({
  EmployeeConstraintForm: () => <div data-testid="constraint-form">form</div>,
}));

describe("EmployeeConstraintsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when there are no constraints", () => {
    render(
      <EmployeeConstraintsPanel
        open
        onOpenChange={vi.fn()}
        employee={{ id: "emp-1", firstName: "Jean", lastName: "Dupont" }}
      />,
    );

    expect(screen.getByText("constraints.empty.title")).toBeDefined();
  });

  it("renders existing constraints", () => {
    mockUseEmployeeConstraints.mockReturnValue({
      constraints: [
        {
          id: "c1",
          type: "SCHOOL",
          reason: "School day",
          startDate: "2026-03-01T00:00:00.000Z",
          endDate: "2026-03-31T23:59:59.999Z",
          daysOfWeek: [1, 3],
        },
      ],
      isPending: false,
      createConstraint: mockCreateConstraint,
      updateConstraint: mockUpdateConstraint,
      deleteConstraint: mockDeleteConstraint,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });

    render(
      <EmployeeConstraintsPanel
        open
        onOpenChange={vi.fn()}
        employee={{ id: "emp-1", firstName: "Jean", lastName: "Dupont" }}
      />,
    );

    expect(screen.getByText("School day")).toBeDefined();
  });

  it("opens form when add button is clicked", () => {
    render(
      <EmployeeConstraintsPanel
        open
        onOpenChange={vi.fn()}
        employee={{ id: "emp-1", firstName: "Jean", lastName: "Dupont" }}
      />,
    );

    fireEvent.click(screen.getByText("constraints.actions.add"));

    expect(screen.getByText("constraints.form.createTitle")).toBeDefined();
  });
});
