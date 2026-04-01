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
  Check: (props: any) => <span data-testid="icon-check" {...props} />,
  X: (props: any) => <span data-testid="icon-x" {...props} />,
  Plus: (props: any) => <span data-testid="icon-plus" {...props} />,
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
  Button: ({ children, disabled, onClick, variant, size, ...rest }: any) => (
    <button
      disabled={disabled}
      onClick={onClick}
      data-variant={variant}
      data-size={size}
      {...rest}
    >
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

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select" data-value={value}>
      {children}
    </div>
  ),
  SelectContent: ({ children }: any) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({ children, value }: any) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: any) => (
    <button data-testid="select-trigger">{children}</button>
  ),
  SelectValue: ({ placeholder }: any) => (
    <span data-testid="select-value">{placeholder}</span>
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: any) =>
    open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: any) => (
    <div data-testid="alert-dialog-content">{children}</div>
  ),
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children, onClick }: any) => (
    <button data-testid="dialog-cancel" onClick={onClick}>
      {children}
    </button>
  ),
  AlertDialogAction: ({ children, onClick, disabled }: any) => (
    <button data-testid="dialog-confirm" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock validators
vi.mock("@pawly/validators", () => ({
  ABSENCE_TYPES: ["PAID_LEAVE", "SICK_LEAVE", "TRAINING", "CHILD_SICK", "OTHER"],
  listAbsencesSchema: { parse: vi.fn(), safeParse: vi.fn() },
  reviewAbsenceSchema: { parse: vi.fn(), safeParse: vi.fn() },
  adminCreateAbsenceSchema: { parse: vi.fn(), safeParse: vi.fn() },
}));

// Mock custom hooks
const mockApprove = vi.fn();
const mockReject = vi.fn();
const mockUseReviewAbsence = vi.fn().mockReturnValue({
  approve: mockApprove,
  reject: mockReject,
  isPending: false,
  error: null,
});

const mockCreateAbsence = vi.fn();
const mockUseAdminCreateAbsence = vi.fn().mockReturnValue({
  createAbsence: mockCreateAbsence,
  isPending: false,
  error: null,
});

vi.mock("../_hooks/useAdminAbsences", () => ({
  useReviewAbsence: () => mockUseReviewAbsence(),
  useAdminCreateAbsence: () => mockUseAdminCreateAbsence(),
}));

// Mock server-action-hooks for AdminAbsenceForm (employee list)
vi.mock("@/lib/hooks/server-action-hooks", () => ({
  useServerActionQuery: vi.fn().mockReturnValue({
    data: [
      { id: "emp-1", firstName: "Jean", lastName: "Dupont", jobType: "VET" },
      { id: "emp-2", firstName: "Marie", lastName: "Martin", jobType: "ASV" },
    ],
    isPending: false,
  }),
  QueryKeyFactory: {
    employees: () => ["employees"],
  },
}));

// Mock zsa with chainable API
vi.mock("zsa", () => {
  const chainable: any = {
    input: () => chainable,
    output: () => chainable,
    handler: () => vi.fn(),
  };
  return {
    createServerAction: () => chainable,
  };
});

// ── Imports (after mocks) ────────────────────────────────────────────────

import { AbsenceStatusFilter } from "../_components/AbsenceStatusFilter";
import { AbsencePendingList } from "../_components/AbsencePendingList";
import { AbsenceRejectDialog } from "../_components/AbsenceRejectDialog";
import { AdminAbsenceForm } from "../_components/AdminAbsenceForm";

// ── Tests ────────────────────────────────────────────────────────────────

describe("AbsenceStatusFilter", () => {
  const mockOnSelect = vi.fn();

  beforeEach(() => {
    mockOnSelect.mockClear();
  });

  it("renders all 4 filter tabs", () => {
    render(
      <AbsenceStatusFilter selected={undefined} onSelect={mockOnSelect} />,
    );

    expect(screen.getByText("all")).toBeDefined();
    expect(screen.getByText("pending")).toBeDefined();
    expect(screen.getByText("approved")).toBeDefined();
    expect(screen.getByText("rejected")).toBeDefined();
  });

  it("renders 4 filter tabs", () => {
    render(
      <AbsenceStatusFilter selected={undefined} onSelect={mockOnSelect} />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
  });

  it("highlights the active filter with dark background", () => {
    render(
      <AbsenceStatusFilter selected={undefined} onSelect={mockOnSelect} />,
    );

    // When selected is undefined, the "all" filter is active
    const allButton = screen.getByText("all");
    expect(allButton.className).toContain("bg-foreground");
    expect(allButton.className).toContain("text-background");
  });

  it("highlights PENDING filter when selected", () => {
    render(
      <AbsenceStatusFilter selected="PENDING" onSelect={mockOnSelect} />,
    );

    const pendingButton = screen.getByText("pending");
    expect(pendingButton.className).toContain("bg-foreground");
  });

  it("does not highlight inactive filters", () => {
    render(
      <AbsenceStatusFilter selected="PENDING" onSelect={mockOnSelect} />,
    );

    const allButton = screen.getByText("all");
    expect(allButton.className).toContain("text-muted-foreground");
    expect(allButton.className).not.toContain("bg-foreground");
  });

  it("calls onSelect with undefined when all tab is clicked", () => {
    render(
      <AbsenceStatusFilter selected="PENDING" onSelect={mockOnSelect} />,
    );

    fireEvent.click(screen.getByText("all"));
    expect(mockOnSelect).toHaveBeenCalledWith(undefined);
  });

  it("calls onSelect with PENDING when pending tab is clicked", () => {
    render(
      <AbsenceStatusFilter selected={undefined} onSelect={mockOnSelect} />,
    );

    fireEvent.click(screen.getByText("pending"));
    expect(mockOnSelect).toHaveBeenCalledWith("PENDING");
  });

  it("calls onSelect with REJECTED when rejected tab is clicked", () => {
    render(
      <AbsenceStatusFilter selected={undefined} onSelect={mockOnSelect} />,
    );

    fireEvent.click(screen.getByText("rejected"));
    expect(mockOnSelect).toHaveBeenCalledWith("REJECTED");
  });
});

describe("AbsencePendingList", () => {
  beforeEach(() => {
    mockUseReviewAbsence.mockClear();
    mockApprove.mockClear();
    mockReject.mockClear();
    mockUseReviewAbsence.mockReturnValue({
      approve: mockApprove,
      reject: mockReject,
      isPending: false,
      error: null,
    });
  });

  it("renders empty state when no absences", () => {
    render(<AbsencePendingList absences={[]} isPending={false} />);
    expect(screen.getByText("list.empty")).toBeDefined();
  });

  it("renders loading skeletons when isPending", () => {
    const { container } = render(
      <AbsencePendingList absences={[]} isPending={true} />,
    );
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(3);
  });

  it("renders employee names in the list", () => {
    const absences = [
      {
        id: "abs-1",
        type: "PAID_LEAVE",
        startDate: "2025-03-01T00:00:00.000Z",
        endDate: "2025-03-03T00:00:00.000Z",
        status: "PENDING",
        employee: { firstName: "Jean", lastName: "Dupont", jobType: "VET" },
      },
    ];

    render(<AbsencePendingList absences={absences} isPending={false} />);
    expect(screen.getByText(/Jean/)).toBeDefined();
    expect(screen.getByText(/Dupont/)).toBeDefined();
  });

  it("renders absence type for each item", () => {
    const absences = [
      {
        id: "abs-1",
        type: "SICK_LEAVE",
        startDate: "2025-03-01T00:00:00.000Z",
        endDate: "2025-03-02T00:00:00.000Z",
        status: "PENDING",
        employee: { firstName: "Jean", lastName: "Dupont" },
      },
    ];

    render(<AbsencePendingList absences={absences} isPending={false} />);
    expect(screen.getByText(/types\.SICK_LEAVE/)).toBeDefined();
  });

  it("renders approve and reject buttons for PENDING absences", () => {
    const absences = [
      {
        id: "abs-1",
        type: "PAID_LEAVE",
        startDate: "2025-03-01T00:00:00.000Z",
        endDate: "2025-03-03T00:00:00.000Z",
        status: "PENDING",
        employee: { firstName: "Jean", lastName: "Dupont" },
      },
    ];

    render(<AbsencePendingList absences={absences} isPending={false} />);
    expect(screen.getByText("actions.approve")).toBeDefined();
    expect(screen.getByText("actions.reject")).toBeDefined();
  });

  it("does not render approve/reject buttons for non-PENDING absences", () => {
    const absences = [
      {
        id: "abs-1",
        type: "PAID_LEAVE",
        startDate: "2025-03-01T00:00:00.000Z",
        endDate: "2025-03-03T00:00:00.000Z",
        status: "APPROVED",
        employee: { firstName: "Jean", lastName: "Dupont" },
      },
    ];

    render(<AbsencePendingList absences={absences} isPending={false} />);
    expect(screen.queryByText("actions.approve")).toBeNull();
    expect(screen.queryByText("actions.reject")).toBeNull();
  });

  it("shows status badge for each absence", () => {
    const absences = [
      {
        id: "abs-1",
        type: "PAID_LEAVE",
        startDate: "2025-03-01T00:00:00.000Z",
        endDate: "2025-03-03T00:00:00.000Z",
        status: "PENDING",
        employee: { firstName: "Jean", lastName: "Dupont" },
      },
    ];

    render(<AbsencePendingList absences={absences} isPending={false} />);
    expect(screen.getByText("status.PENDING")).toBeDefined();
  });

  it("shows employee job type when available", () => {
    const absences = [
      {
        id: "abs-1",
        type: "PAID_LEAVE",
        startDate: "2025-03-01T00:00:00.000Z",
        endDate: "2025-03-03T00:00:00.000Z",
        status: "PENDING",
        employee: { firstName: "Jean", lastName: "Dupont", jobType: "VET" },
      },
    ];

    render(<AbsencePendingList absences={absences} isPending={false} />);
    expect(screen.getByText("(VET)")).toBeDefined();
  });

  it("shows rejection reason for rejected absences", () => {
    const absences = [
      {
        id: "abs-1",
        type: "PAID_LEAVE",
        startDate: "2025-03-01T00:00:00.000Z",
        endDate: "2025-03-03T00:00:00.000Z",
        status: "REJECTED",
        rejectionReason: "Staffing issue",
        employee: { firstName: "Jean", lastName: "Dupont" },
      },
    ];

    render(<AbsencePendingList absences={absences} isPending={false} />);
    expect(screen.getByText(/Staffing issue/)).toBeDefined();
  });

  it("shows reason when absence has a reason", () => {
    const absences = [
      {
        id: "abs-1",
        type: "PAID_LEAVE",
        startDate: "2025-03-01T00:00:00.000Z",
        endDate: "2025-03-03T00:00:00.000Z",
        status: "PENDING",
        reason: "Family vacation",
        employee: { firstName: "Jean", lastName: "Dupont" },
      },
    ];

    render(<AbsencePendingList absences={absences} isPending={false} />);
    expect(screen.getByText(/Family vacation/)).toBeDefined();
  });

  it("renders multiple absences", () => {
    const absences = [
      {
        id: "abs-1",
        type: "PAID_LEAVE",
        startDate: "2025-03-01T00:00:00.000Z",
        endDate: "2025-03-03T00:00:00.000Z",
        status: "PENDING",
        employee: { firstName: "Jean", lastName: "Dupont" },
      },
      {
        id: "abs-2",
        type: "SICK_LEAVE",
        startDate: "2025-04-01T00:00:00.000Z",
        endDate: "2025-04-02T00:00:00.000Z",
        status: "APPROVED",
        employee: { firstName: "Marie", lastName: "Martin" },
      },
    ];

    render(<AbsencePendingList absences={absences} isPending={false} />);
    expect(screen.getByText(/Jean/)).toBeDefined();
    expect(screen.getByText(/Marie/)).toBeDefined();
  });
});

describe("AbsenceRejectDialog", () => {
  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
    mockOnConfirm.mockClear();
  });

  it("renders dialog content when open", () => {
    render(
      <AbsenceRejectDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />,
    );

    expect(screen.getByTestId("alert-dialog")).toBeDefined();
  });

  it("does not render dialog when closed", () => {
    render(
      <AbsenceRejectDialog
        open={false}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />,
    );

    expect(screen.queryByTestId("alert-dialog")).toBeNull();
  });

  it("renders dialog title and description", () => {
    render(
      <AbsenceRejectDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />,
    );

    expect(screen.getByText("title")).toBeDefined();
    expect(screen.getByText("description")).toBeDefined();
  });

  it("renders textarea for rejection reason", () => {
    render(
      <AbsenceRejectDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />,
    );

    expect(screen.getByTestId("textarea")).toBeDefined();
  });

  it("renders cancel button", () => {
    render(
      <AbsenceRejectDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />,
    );

    expect(screen.getByTestId("dialog-cancel")).toBeDefined();
    expect(screen.getByText("cancel")).toBeDefined();
  });

  it("renders confirm button", () => {
    render(
      <AbsenceRejectDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />,
    );

    expect(screen.getByTestId("dialog-confirm")).toBeDefined();
    expect(screen.getByText("confirm")).toBeDefined();
  });

  it("renders the reason label", () => {
    render(
      <AbsenceRejectDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />,
    );

    expect(screen.getByText("reasonLabel")).toBeDefined();
  });

  it("renders textarea with placeholder", () => {
    render(
      <AbsenceRejectDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />,
    );

    const textarea = screen.getByTestId("textarea");
    expect(textarea.getAttribute("placeholder")).toBe("reasonPlaceholder");
  });

  it("disables confirm button when reason is empty", () => {
    render(
      <AbsenceRejectDialog
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />,
    );

    const confirmButton = screen.getByTestId("dialog-confirm");
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("AdminAbsenceForm", () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockUseAdminCreateAbsence.mockClear();
    mockCreateAbsence.mockClear();
    mockOnClose.mockClear();
    mockUseAdminCreateAbsence.mockReturnValue({
      createAbsence: mockCreateAbsence,
      isPending: false,
      error: null,
    });
  });

  it("does not render when closed", () => {
    render(<AdminAbsenceForm open={false} onClose={mockOnClose} />);
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("renders the form title when open", () => {
    render(<AdminAbsenceForm open={true} onClose={mockOnClose} />);
    expect(screen.getByText("adminCreate.title")).toBeDefined();
  });

  it("renders the form subtitle", () => {
    render(<AdminAbsenceForm open={true} onClose={mockOnClose} />);
    expect(screen.getByText("adminCreate.subtitle")).toBeDefined();
  });

  it("renders employee selector", () => {
    render(<AdminAbsenceForm open={true} onClose={mockOnClose} />);
    const elements = screen.getAllByText("adminCreate.selectEmployee");
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders employee options from the hook data", () => {
    render(<AdminAbsenceForm open={true} onClose={mockOnClose} />);
    expect(screen.getByText("Jean Dupont (VET)")).toBeDefined();
    expect(screen.getByText("Marie Martin (ASV)")).toBeDefined();
  });

  it("renders type selector with absence types", () => {
    render(<AdminAbsenceForm open={true} onClose={mockOnClose} />);
    expect(screen.getAllByText("PAID_LEAVE").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("SICK_LEAVE")).toBeDefined();
    expect(screen.getByText("TRAINING")).toBeDefined();
    expect(screen.getByText("CHILD_SICK")).toBeDefined();
    expect(screen.getByText("OTHER")).toBeDefined();
  });

  it("renders the calendar component", () => {
    render(<AdminAbsenceForm open={true} onClose={mockOnClose} />);
    expect(screen.getByTestId("calendar")).toBeDefined();
  });

  it("renders the reason textarea", () => {
    render(<AdminAbsenceForm open={true} onClose={mockOnClose} />);
    expect(screen.getByTestId("textarea")).toBeDefined();
  });

  it("renders submit button", () => {
    render(<AdminAbsenceForm open={true} onClose={mockOnClose} />);
    expect(screen.getByText("adminCreate.submit")).toBeDefined();
  });

  it("disables submit button when form is incomplete", () => {
    render(<AdminAbsenceForm open={true} onClose={mockOnClose} />);
    const submitButton = screen.getByText("adminCreate.submit");
    expect(submitButton.closest("button")?.disabled).toBe(true);
  });

  it("shows submitting text when isPending", () => {
    mockUseAdminCreateAbsence.mockReturnValue({
      createAbsence: mockCreateAbsence,
      isPending: true,
      error: null,
    });

    render(<AdminAbsenceForm open={true} onClose={mockOnClose} />);
    expect(screen.getByText("adminCreate.submitting")).toBeDefined();
  });
});
