import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    Clock: (props: any) => <span data-testid="icon-clock" {...props} />,
    AlertCircle: (props: any) => <span data-testid="icon-alert" {...props} />,
    LogOut: (props: any) => <span data-testid="icon-logout" {...props} />,
    Check: (props: any) => <span data-testid="icon-check" {...props} />,
    X: (props: any) => <span data-testid="icon-x" {...props} />,
    Download: (props: any) => <span data-testid="icon-download" {...props} />,
    BarChart3: (props: any) => <span data-testid="icon-barchart" {...props} />,
    AlertTriangle: (props: any) => <span data-testid="icon-triangle" {...props} />,
    UserX: (props: any) => <span data-testid="icon-userx" {...props} />,
  };
});

vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  m: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  LazyMotion: ({ children }: any) => children,
  domAnimation: {},
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, disabled, onClick, variant, size, ...rest }: any) => (
    <button disabled={disabled} onClick={onClick} data-variant={variant} data-size={size} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...rest }: any) => <span data-testid="badge" {...rest}>{children}</span>,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: ({ value, onChange, placeholder, ...rest }: any) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} data-testid="textarea" {...rest} />
  ),
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...rest }: any) => <label {...rest}>{children}</label>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: any) =>
    open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: any) => <div data-testid="alert-dialog-content">{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogCancel: ({ children, onClick }: any) => (
    <button data-testid="dialog-cancel" onClick={onClick}>{children}</button>
  ),
  AlertDialogAction: ({ children, onClick, disabled }: any) => (
    <button data-testid="dialog-confirm" onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ── Hook mocks ────────────────────────────────────────────────────────

const mockApprove = vi.fn();
const mockReject = vi.fn();
const mockExportCsv = vi.fn();

const mockUseAdminVarianceEvents = vi.fn().mockReturnValue({
  events: [],
  isPending: false,
  isFetching: false,
  error: null,
});

const mockUseVarianceStats = vi.fn().mockReturnValue({
  stats: null,
  isPending: false,
  error: null,
});

const mockUsePendingVarianceCount = vi.fn().mockReturnValue({
  count: 0,
  isPending: false,
});

const mockUseReviewVariance = vi.fn().mockReturnValue({
  approve: mockApprove,
  reject: mockReject,
  isPending: false,
  error: null,
});

const mockUseExportVarianceCsv = vi.fn().mockReturnValue({
  exportCsv: mockExportCsv,
  isPending: false,
});

vi.mock("../_hooks/useAdminVariance", () => ({
  useAdminVarianceEvents: () => mockUseAdminVarianceEvents(),
  useVarianceStats: () => mockUseVarianceStats(),
  usePendingVarianceCount: () => mockUsePendingVarianceCount(),
  useReviewVariance: () => mockUseReviewVariance(),
  useExportVarianceCsv: () => mockUseExportVarianceCsv(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@/app/[locale]/admin/employees/_hooks/useEmployees", () => ({
  useEmployees: () => ({
    employees: [
      { id: "emp-1", firstName: "Martin", lastName: "Dupont" },
      { id: "emp-2", firstName: "Julie", lastName: "Moreau" },
    ],
    isPending: false,
    isFetching: false,
    error: null,
  }),
}));

vi.mock("@/lib/hooks/server-action-hooks", () => ({
  useServerActionQuery: vi.fn().mockReturnValue({ data: null, isPending: false }),
  useServerActionMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
  QueryKeyFactory: {
    varianceEvents: () => ["variance-events"],
    pendingVarianceCount: () => ["variance-events", "pending-count"],
    varianceStats: () => ["variance-events", "stats", "all"],
  },
}));

// ── Import components ─────────────────────────────────────────────────

import { VariancePageClient } from "../_components/VariancePageClient";
import { VarianceStatusFilter } from "../_components/VarianceStatusFilter";
import { VarianceStatsPanel } from "../_components/VarianceStatsPanel";
import { VarianceEventList } from "../_components/VarianceEventList";
import { VarianceRejectDialog } from "../_components/VarianceRejectDialog";

// ── Test Data ─────────────────────────────────────────────────────────

// Note: The global next-intl mock returns just the key segment (e.g., t("title") => "title"),
// not the full namespace path. All text assertions use the key segment only.

const mockEvent = {
  id: "var-1",
  type: "CLOCK_IN_DEVIATION",
  status: "PENDING",
  plannedTime: "2026-02-24T08:30:00Z",
  actualTime: "2026-02-24T08:47:00Z",
  deltaMinutes: 17,
  exceptionNote: null,
  shift: {
    shiftTypeCode: "CHIR",
    startTime: "08:30",
    endTime: "18:30",
    date: "2026-02-24",
    employee: {
      id: "emp-1",
      firstName: "Martin",
      lastName: "Dupont",
      jobType: "VET",
    },
  },
};

const mockStats = {
  countByType: [
    { type: "CLOCK_IN_DEVIATION", _count: { id: 5 }, _avg: { deltaMinutes: 12 } },
    { type: "NO_SHOW", _count: { id: 2 }, _avg: { deltaMinutes: null } },
  ],
  countByStatus: [
    { status: "PENDING", _count: { id: 3 } },
    { status: "APPROVED", _count: { id: 4 } },
  ],
  totals: {
    _count: { id: 7 },
    _sum: { deltaMinutes: 84 },
    _avg: { deltaMinutes: 12 },
  },
};

// ── VariancePageClient ────────────────────────────────────────────────

describe("VariancePageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAdminVarianceEvents.mockReturnValue({ events: [], isPending: false, isFetching: false, error: null });
    mockUseVarianceStats.mockReturnValue({ stats: null, isPending: false, error: null });
    mockUsePendingVarianceCount.mockReturnValue({ count: 0, isPending: false });
    mockUseExportVarianceCsv.mockReturnValue({ exportCsv: mockExportCsv, isPending: false });
  });

  it("renders title and subtitle", () => {
    render(<VariancePageClient />);
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("subtitle")).toBeInTheDocument();
  });

  it("renders export CSV button", () => {
    render(<VariancePageClient />);
    expect(screen.getByText("actions.exportCsv")).toBeInTheDocument();
  });

  it("renders pending badge when count > 0", () => {
    mockUsePendingVarianceCount.mockReturnValue({ count: 5, isPending: false });
    render(<VariancePageClient />);
    expect(screen.getByTestId("badge")).toBeInTheDocument();
  });

  it("does not render pending badge when count is 0", () => {
    render(<VariancePageClient />);
    expect(screen.queryByTestId("badge")).not.toBeInTheDocument();
  });

  it("renders month selector input", () => {
    render(<VariancePageClient />);
    const input = screen.getByLabelText("monthSelector.label");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "month");
  });
});

// ── VarianceStatusFilter ──────────────────────────────────────────────

describe("VarianceStatusFilter", () => {
  it("renders all 4 filter buttons in a group", () => {
    const onSelect = vi.fn();
    render(<VarianceStatusFilter selected={undefined} onSelect={onSelect} />);

    expect(screen.getByRole("group")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  it("marks selected button with aria-pressed", () => {
    const onSelect = vi.fn();
    render(<VarianceStatusFilter selected="PENDING" onSelect={onSelect} />);

    const buttons = screen.getAllByRole("button");
    const pendingBtn = buttons.find(b => b.textContent === "pending");
    expect(pendingBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onSelect when clicking a filter button", () => {
    const onSelect = vi.fn();
    render(<VarianceStatusFilter selected={undefined} onSelect={onSelect} />);

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[1]); // PENDING button
    expect(onSelect).toHaveBeenCalledWith("PENDING");
  });

  it("calls onSelect with undefined for 'all' button", () => {
    const onSelect = vi.fn();
    render(<VarianceStatusFilter selected="PENDING" onSelect={onSelect} />);

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]); // All button
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });
});

// ── VarianceStatsPanel ────────────────────────────────────────────────

describe("VarianceStatsPanel", () => {
  it("shows loading skeletons when isPending", () => {
    const { container } = render(<VarianceStatsPanel stats={null} isPending={true} />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons).toHaveLength(4);
  });

  it("renders 4 stat cards when data available", () => {
    render(<VarianceStatsPanel stats={mockStats} isPending={false} />);

    expect(screen.getByText("totalEvents")).toBeInTheDocument();
    expect(screen.getByText("pendingCount")).toBeInTheDocument();
    expect(screen.getByText("avgDelta")).toBeInTheDocument();
    expect(screen.getByText("noShowCount")).toBeInTheDocument();
  });

  it("displays correct total events count", () => {
    render(<VarianceStatsPanel stats={mockStats} isPending={false} />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("displays correct pending count", () => {
    render(<VarianceStatsPanel stats={mockStats} isPending={false} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("displays correct no-show count", () => {
    render(<VarianceStatsPanel stats={mockStats} isPending={false} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("handles null stats gracefully", () => {
    render(<VarianceStatsPanel stats={null} isPending={false} />);
    expect(screen.getAllByText("0")).toHaveLength(3);
  });
});

// ── VarianceEventList ─────────────────────────────────────────────────

describe("VarianceEventList", () => {
  it("shows loading skeletons when isPending", () => {
    const { container } = render(<VarianceEventList events={[]} total={0} page={0} onPageChange={() => {}} isPending={true} />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows empty state when no events", () => {
    render(<VarianceEventList events={[]} total={0} page={0} onPageChange={() => {}} isPending={false} />);
    expect(screen.getByText("list.empty")).toBeInTheDocument();
  });

  it("renders event cards with employee name", () => {
    render(<VarianceEventList events={[mockEvent]} total={1} page={0} onPageChange={() => {}} isPending={false} />);
    expect(screen.getByText(/Martin/)).toBeInTheDocument();
    expect(screen.getByText(/Dupont/)).toBeInTheDocument();
  });

  it("renders type and status badges", () => {
    render(<VarianceEventList events={[mockEvent]} total={1} page={0} onPageChange={() => {}} isPending={false} />);
    expect(screen.getByText("types.CLOCK_IN_DEVIATION")).toBeInTheDocument();
    expect(screen.getByText("status.PENDING")).toBeInTheDocument();
  });

  it("renders approve/reject buttons for PENDING events", () => {
    render(<VarianceEventList events={[mockEvent]} total={1} page={0} onPageChange={() => {}} isPending={false} />);
    expect(screen.getByText("actions.approve")).toBeInTheDocument();
    expect(screen.getByText("actions.reject")).toBeInTheDocument();
  });

  it("does not render approve/reject for APPROVED events", () => {
    const approvedEvent = { ...mockEvent, status: "APPROVED" };
    render(<VarianceEventList events={[approvedEvent]} total={1} page={0} onPageChange={() => {}} isPending={false} />);
    expect(screen.queryByText("actions.approve")).not.toBeInTheDocument();
  });

  it("calls approve when clicking approve button", () => {
    render(<VarianceEventList events={[mockEvent]} total={1} page={0} onPageChange={() => {}} isPending={false} />);
    fireEvent.click(screen.getByText("actions.approve"));
    expect(mockApprove).toHaveBeenCalledWith("var-1");
  });

  it("opens reject dialog when clicking reject button", () => {
    render(<VarianceEventList events={[mockEvent]} total={1} page={0} onPageChange={() => {}} isPending={false} />);
    fireEvent.click(screen.getByText("actions.reject"));
    expect(screen.getByTestId("alert-dialog")).toBeInTheDocument();
  });

  it("shows exception note for rejected events", () => {
    const rejectedEvent = { ...mockEvent, status: "REJECTED", exceptionNote: "Not valid" };
    render(<VarianceEventList events={[rejectedEvent]} total={1} page={0} onPageChange={() => {}} isPending={false} />);
    expect(screen.getByText("Not valid")).toBeInTheDocument();
  });

  it("shows 'Not confirmed' for NO_SHOW type", () => {
    const noShowEvent = { ...mockEvent, type: "NO_SHOW" };
    render(<VarianceEventList events={[noShowEvent]} total={1} page={0} onPageChange={() => {}} isPending={false} />);
    expect(screen.getByText("list.notConfirmed")).toBeInTheDocument();
  });

  it("renders approve/reject buttons with descriptive aria-labels", () => {
    render(<VarianceEventList events={[mockEvent]} total={1} page={0} onPageChange={() => {}} isPending={false} />);
    const approveBtn = screen.getByText("actions.approve").closest("button");
    expect(approveBtn).toHaveAttribute("aria-label", expect.stringContaining("Dupont"));
  });
});

// ── VarianceRejectDialog ──────────────────────────────────────────────

describe("VarianceRejectDialog", () => {
  it("renders nothing when closed", () => {
    render(<VarianceRejectDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByTestId("alert-dialog")).not.toBeInTheDocument();
  });

  it("renders dialog content when open", () => {
    render(<VarianceRejectDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId("alert-dialog")).toBeInTheDocument();
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("has disabled confirm button when textarea is empty", () => {
    render(<VarianceRejectDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByTestId("dialog-confirm")).toBeDisabled();
  });

  it("enables confirm button when text is entered", () => {
    render(<VarianceRejectDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} />);
    fireEvent.change(screen.getByTestId("textarea"), { target: { value: "Not valid" } });
    expect(screen.getByTestId("dialog-confirm")).not.toBeDisabled();
  });

  it("calls onConfirm with trimmed note", () => {
    const onConfirm = vi.fn();
    render(<VarianceRejectDialog open={true} onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByTestId("textarea"), { target: { value: "  Not valid  " } });
    fireEvent.click(screen.getByTestId("dialog-confirm"));
    expect(onConfirm).toHaveBeenCalledWith("Not valid");
  });

  it("calls onClose when cancel is clicked", () => {
    const onClose = vi.fn();
    render(<VarianceRejectDialog open={true} onClose={onClose} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByTestId("dialog-cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
