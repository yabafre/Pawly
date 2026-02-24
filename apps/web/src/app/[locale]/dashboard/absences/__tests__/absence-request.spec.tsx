import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────

// next-intl is already mocked globally in vitest.setup.ts

// Mock lucide-react icons as simple spans
vi.mock("lucide-react", () => ({
  Plane: (props: any) => <span data-testid="icon-plane" {...props} />,
  Thermometer: (props: any) => (
    <span data-testid="icon-thermometer" {...props} />
  ),
  GraduationCap: (props: any) => (
    <span data-testid="icon-graduation" {...props} />
  ),
  Baby: (props: any) => <span data-testid="icon-baby" {...props} />,
  HelpCircle: (props: any) => (
    <span data-testid="icon-help" {...props} />
  ),
  AlertTriangle: (props: any) => (
    <span data-testid="icon-alert-triangle" {...props} />
  ),
}));

// Mock date-fns
vi.mock("date-fns", () => ({
  differenceInCalendarDays: vi.fn().mockReturnValue(2),
}));

vi.mock("date-fns/locale", () => ({
  fr: {},
  enUS: {},
}));

// Mock UI components
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, disabled, onClick, ...rest }: any) => (
    <button disabled={disabled} onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: ({ value, onChange, placeholder, ...rest }: any) => (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      data-testid="textarea"
      {...rest}
    />
  ),
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...rest }: any) => <label {...rest}>{children}</label>,
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: (props: any) => (
    <div data-testid="calendar" data-mode={props.mode}>
      Calendar
    </div>
  ),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock custom hooks
const mockCreateAbsence = vi.fn();
const mockUseCreateAbsenceRequest = vi.fn().mockReturnValue({
  createAbsence: mockCreateAbsence,
  isPending: false,
  error: null,
});

const mockUseCheckOverlap = vi.fn().mockReturnValue({
  overlap: {
    hasOverlap: false,
    overlappingAbsences: [],
    overlappingUnavailabilities: [],
  },
  isChecking: false,
});

const mockUseMyAbsences = vi.fn().mockReturnValue({
  absences: [],
  isPending: false,
  isFetching: false,
  error: null,
});

vi.mock("../_hooks/useAbsences", () => ({
  useCreateAbsenceRequest: (employeeId: string) =>
    mockUseCreateAbsenceRequest(employeeId),
  useCheckOverlap: (
    employeeId: string,
    startDate: string | undefined,
    endDate: string | undefined,
  ) => mockUseCheckOverlap(employeeId, startDate, endDate),
  useMyAbsences: (employeeId: string) => mockUseMyAbsences(employeeId),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────

import { AbsenceTypeSelector } from "../_components/AbsenceTypeSelector";
import { AbsenceStatusBadge } from "../_components/AbsenceStatusBadge";
import { AbsenceRequestList } from "../_components/AbsenceRequestList";
import { AbsenceRequestForm } from "../_components/AbsenceRequestForm";

// ── Tests ────────────────────────────────────────────────────────────────

describe("AbsenceTypeSelector", () => {
  const mockOnSelect = vi.fn();

  beforeEach(() => {
    mockOnSelect.mockClear();
  });

  it("renders all 5 absence type options", () => {
    render(<AbsenceTypeSelector selected={null} onSelect={mockOnSelect} />);

    expect(screen.getByText("PAID_LEAVE")).toBeDefined();
    expect(screen.getByText("SICK_LEAVE")).toBeDefined();
    expect(screen.getByText("TRAINING")).toBeDefined();
    expect(screen.getByText("CHILD_SICK")).toBeDefined();
    expect(screen.getByText("OTHER")).toBeDefined();
  });

  it("renders 5 buttons", () => {
    render(<AbsenceTypeSelector selected={null} onSelect={mockOnSelect} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
  });

  it("marks selected type with aria-pressed=true", () => {
    render(
      <AbsenceTypeSelector selected="SICK_LEAVE" onSelect={mockOnSelect} />,
    );

    const sickLeaveButton = screen.getByRole("button", {
      name: "SICK_LEAVE",
    });
    expect(sickLeaveButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("marks non-selected types with aria-pressed=false", () => {
    render(
      <AbsenceTypeSelector selected="SICK_LEAVE" onSelect={mockOnSelect} />,
    );

    const paidLeaveButton = screen.getByRole("button", {
      name: "PAID_LEAVE",
    });
    expect(paidLeaveButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("calls onSelect callback with type key when clicked", () => {
    render(<AbsenceTypeSelector selected={null} onSelect={mockOnSelect} />);

    const trainingButton = screen.getByRole("button", { name: "TRAINING" });
    fireEvent.click(trainingButton);

    expect(mockOnSelect).toHaveBeenCalledWith("TRAINING");
  });

  it("renders icons for each absence type", () => {
    render(<AbsenceTypeSelector selected={null} onSelect={mockOnSelect} />);

    expect(screen.getByTestId("icon-plane")).toBeDefined();
    expect(screen.getByTestId("icon-thermometer")).toBeDefined();
    expect(screen.getByTestId("icon-graduation")).toBeDefined();
    expect(screen.getByTestId("icon-baby")).toBeDefined();
    expect(screen.getByTestId("icon-help")).toBeDefined();
  });

  it("applies selected styling classes when a type is selected", () => {
    render(
      <AbsenceTypeSelector selected="PAID_LEAVE" onSelect={mockOnSelect} />,
    );

    const paidLeaveButton = screen.getByRole("button", {
      name: "PAID_LEAVE",
    });
    expect(paidLeaveButton.className).toContain("bg-emerald-50");
    expect(paidLeaveButton.className).toContain("border-emerald-300");
  });
});

describe("AbsenceStatusBadge", () => {
  it("renders PENDING status text", () => {
    render(<AbsenceStatusBadge status="PENDING" />);
    expect(screen.getByText("PENDING")).toBeDefined();
  });

  it("renders APPROVED status text", () => {
    render(<AbsenceStatusBadge status="APPROVED" />);
    expect(screen.getByText("APPROVED")).toBeDefined();
  });

  it("renders REJECTED status text", () => {
    render(<AbsenceStatusBadge status="REJECTED" />);
    expect(screen.getByText("REJECTED")).toBeDefined();
  });

  it("applies orange styling for PENDING", () => {
    render(<AbsenceStatusBadge status="PENDING" />);
    const badge = screen.getByText("PENDING");
    expect(badge.className).toContain("bg-orange-100");
    expect(badge.className).toContain("text-orange-700");
  });

  it("applies emerald styling for APPROVED", () => {
    render(<AbsenceStatusBadge status="APPROVED" />);
    const badge = screen.getByText("APPROVED");
    expect(badge.className).toContain("bg-emerald-100");
    expect(badge.className).toContain("text-emerald-700");
  });

  it("applies rose styling for REJECTED", () => {
    render(<AbsenceStatusBadge status="REJECTED" />);
    const badge = screen.getByText("REJECTED");
    expect(badge.className).toContain("bg-rose-100");
    expect(badge.className).toContain("text-rose-700");
  });

  it("applies fallback neutral styling for unknown status", () => {
    render(<AbsenceStatusBadge status="UNKNOWN" />);
    const badge = screen.getByText("UNKNOWN");
    expect(badge.className).toContain("bg-neutral-100");
    expect(badge.className).toContain("text-neutral-600");
  });

  it("renders as a span element", () => {
    render(<AbsenceStatusBadge status="PENDING" />);
    const badge = screen.getByText("PENDING");
    expect(badge.tagName).toBe("SPAN");
  });
});

describe("AbsenceRequestList", () => {
  beforeEach(() => {
    mockUseMyAbsences.mockClear();
  });

  it("renders empty state when no absences", () => {
    mockUseMyAbsences.mockReturnValue({
      absences: [],
      isPending: false,
      isFetching: false,
      error: null,
    });

    render(<AbsenceRequestList employeeId="emp-1" />);
    expect(screen.getByText("list.empty")).toBeDefined();
  });

  it("renders loading skeletons when isPending", () => {
    mockUseMyAbsences.mockReturnValue({
      absences: [],
      isPending: true,
      isFetching: true,
      error: null,
    });

    const { container } = render(
      <AbsenceRequestList employeeId="emp-1" />,
    );
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(3);
  });

  it("renders list title when absences exist", () => {
    mockUseMyAbsences.mockReturnValue({
      absences: [
        {
          id: "abs-1",
          type: "PAID_LEAVE",
          startDate: "2025-03-01T00:00:00.000Z",
          endDate: "2025-03-03T00:00:00.000Z",
          status: "PENDING",
        },
      ],
      isPending: false,
      isFetching: false,
      error: null,
    });

    render(<AbsenceRequestList employeeId="emp-1" />);
    expect(screen.getByText("list.title")).toBeDefined();
  });

  it("renders absence type for each item", () => {
    mockUseMyAbsences.mockReturnValue({
      absences: [
        {
          id: "abs-1",
          type: "PAID_LEAVE",
          startDate: "2025-03-01T00:00:00.000Z",
          endDate: "2025-03-03T00:00:00.000Z",
          status: "PENDING",
        },
        {
          id: "abs-2",
          type: "SICK_LEAVE",
          startDate: "2025-04-01T00:00:00.000Z",
          endDate: "2025-04-02T00:00:00.000Z",
          status: "APPROVED",
        },
      ],
      isPending: false,
      isFetching: false,
      error: null,
    });

    render(<AbsenceRequestList employeeId="emp-1" />);
    expect(screen.getByText("types.PAID_LEAVE")).toBeDefined();
    expect(screen.getByText("types.SICK_LEAVE")).toBeDefined();
  });

  it("renders status badges for each absence", () => {
    mockUseMyAbsences.mockReturnValue({
      absences: [
        {
          id: "abs-1",
          type: "PAID_LEAVE",
          startDate: "2025-03-01T00:00:00.000Z",
          endDate: "2025-03-03T00:00:00.000Z",
          status: "PENDING",
        },
        {
          id: "abs-2",
          type: "SICK_LEAVE",
          startDate: "2025-04-01T00:00:00.000Z",
          endDate: "2025-04-02T00:00:00.000Z",
          status: "APPROVED",
        },
      ],
      isPending: false,
      isFetching: false,
      error: null,
    });

    render(<AbsenceRequestList employeeId="emp-1" />);
    // Badges rendered by AbsenceStatusBadge (identity fn returns key)
    expect(screen.getByText("PENDING")).toBeDefined();
    expect(screen.getByText("APPROVED")).toBeDefined();
  });

  it("shows rejection reason for rejected absences", () => {
    mockUseMyAbsences.mockReturnValue({
      absences: [
        {
          id: "abs-1",
          type: "PAID_LEAVE",
          startDate: "2025-03-01T00:00:00.000Z",
          endDate: "2025-03-03T00:00:00.000Z",
          status: "REJECTED",
          rejectionReason: "Not enough staff coverage",
        },
      ],
      isPending: false,
      isFetching: false,
      error: null,
    });

    render(<AbsenceRequestList employeeId="emp-1" />);
    expect(screen.getByText("list.rejectionReason")).toBeDefined();
    expect(screen.getByText("Not enough staff coverage")).toBeDefined();
  });

  it("does not show rejection reason for non-rejected absences", () => {
    mockUseMyAbsences.mockReturnValue({
      absences: [
        {
          id: "abs-1",
          type: "PAID_LEAVE",
          startDate: "2025-03-01T00:00:00.000Z",
          endDate: "2025-03-03T00:00:00.000Z",
          status: "APPROVED",
        },
      ],
      isPending: false,
      isFetching: false,
      error: null,
    });

    render(<AbsenceRequestList employeeId="emp-1" />);
    expect(screen.queryByText("list.rejectionReason")).toBeNull();
  });

  it("passes employeeId to the useMyAbsences hook", () => {
    mockUseMyAbsences.mockReturnValue({
      absences: [],
      isPending: false,
      isFetching: false,
      error: null,
    });

    render(<AbsenceRequestList employeeId="emp-42" />);
    expect(mockUseMyAbsences).toHaveBeenCalledWith("emp-42");
  });
});

describe("AbsenceRequestForm", () => {
  beforeEach(() => {
    mockUseCreateAbsenceRequest.mockClear();
    mockUseCheckOverlap.mockClear();
    mockCreateAbsence.mockClear();

    mockUseCreateAbsenceRequest.mockReturnValue({
      createAbsence: mockCreateAbsence,
      isPending: false,
      error: null,
    });

    mockUseCheckOverlap.mockReturnValue({
      overlap: {
        hasOverlap: false,
        overlappingAbsences: [],
        overlappingUnavailabilities: [],
      },
      isChecking: false,
    });
  });

  it("renders the form title", () => {
    render(<AbsenceRequestForm employeeId="emp-1" />);
    expect(screen.getByText("title")).toBeDefined();
  });

  it("renders the type selector label", () => {
    render(<AbsenceRequestForm employeeId="emp-1" />);
    expect(screen.getByText("selectType")).toBeDefined();
  });

  it("renders the date range label", () => {
    render(<AbsenceRequestForm employeeId="emp-1" />);
    expect(screen.getByText("dateRange")).toBeDefined();
  });

  it("renders the reason label", () => {
    render(<AbsenceRequestForm employeeId="emp-1" />);
    expect(screen.getByText("reason")).toBeDefined();
  });

  it("renders the calendar component", () => {
    render(<AbsenceRequestForm employeeId="emp-1" />);
    expect(screen.getByTestId("calendar")).toBeDefined();
  });

  it("renders submit button", () => {
    render(<AbsenceRequestForm employeeId="emp-1" />);
    expect(screen.getByText("submit")).toBeDefined();
  });

  it("disables submit button when no type selected", () => {
    render(<AbsenceRequestForm employeeId="emp-1" />);
    const submitButton = screen.getByText("submit");
    expect(submitButton.closest("button")?.disabled).toBe(true);
  });

  it("shows submitting text when isPending", () => {
    mockUseCreateAbsenceRequest.mockReturnValue({
      createAbsence: mockCreateAbsence,
      isPending: true,
      error: null,
    });

    render(<AbsenceRequestForm employeeId="emp-1" />);
    expect(screen.getByText("submitting")).toBeDefined();
  });

  it("renders overlap warning when overlap detected", () => {
    mockUseCheckOverlap.mockReturnValue({
      overlap: {
        hasOverlap: true,
        overlappingAbsences: [
          {
            startDate: "2025-03-01T00:00:00.000Z",
            endDate: "2025-03-03T00:00:00.000Z",
          },
        ],
        overlappingUnavailabilities: [],
      },
      isChecking: false,
    });

    render(<AbsenceRequestForm employeeId="emp-1" />);
    expect(screen.getByTestId("icon-alert-triangle")).toBeDefined();
  });

  it("does not render overlap warning when no overlap", () => {
    render(<AbsenceRequestForm employeeId="emp-1" />);
    expect(screen.queryByTestId("icon-alert-triangle")).toBeNull();
  });

  it("renders the textarea with placeholder", () => {
    render(<AbsenceRequestForm employeeId="emp-1" />);
    const textarea = screen.getByTestId("textarea");
    expect(textarea.getAttribute("placeholder")).toBe("reasonPlaceholder");
  });

  it("renders the AbsenceTypeSelector inside the form", () => {
    render(<AbsenceRequestForm employeeId="emp-1" />);
    // The type selector renders all 5 types
    expect(screen.getByText("PAID_LEAVE")).toBeDefined();
    expect(screen.getByText("SICK_LEAVE")).toBeDefined();
    expect(screen.getByText("OTHER")).toBeDefined();
  });
});
