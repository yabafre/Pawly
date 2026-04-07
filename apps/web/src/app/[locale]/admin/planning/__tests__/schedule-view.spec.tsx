import { render, screen, fireEvent } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type {
  ScheduleEmployee,
  ScheduleDayInfo,
  ScheduleShift,
  ScheduleUnavailability,
  ScheduleHole,
  ScheduleViewData,
} from "@pawly/validators";
import { ScheduleViewWrapper } from "../_components/ScheduleViewWrapper";
import { StaffGrid } from "../_components/StaffGrid";
import { ShiftCell } from "../_components/ShiftCell";
import { HoleCell } from "../_components/HoleCell";
import { AbsenceCell } from "../_components/AbsenceCell";
import { ClosedDayColumn } from "../_components/ClosedDayColumn";
import { WeekNavigator } from "../_components/WeekNavigator";
import { ConflictIndicator } from "../_components/ConflictIndicator";
import { WarningBadge } from "../_components/WarningBadge";
import { useGridKeyboard } from "../_hooks/useGridKeyboard";
import { DraggableShiftCell } from "../_components/DraggableShiftCell";
import { DroppableGridCell } from "../_components/DroppableGridCell";
import { DragGhost } from "../_components/DragGhost";
import { AssignShiftModal } from "../_components/AssignShiftModal";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock window.matchMedia for responsive viewport detection
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: true, // default to desktop
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock("../_hooks/useScheduleView", () => ({
  useScheduleView: vi.fn(() => ({
    scheduleData: null,
    isLoading: false,
    isFetching: false,
    weeks: [],
    weekOffset: 0,
    totalWeeks: 0,
    currentWeekData: null,
    goToNextWeek: vi.fn(),
    goToPreviousWeek: vi.fn(),
    goToWeek: vi.fn(),
  })),
}));

vi.mock("../_hooks/useGridKeyboard", async () => {
  const actual = await vi.importActual("../_hooks/useGridKeyboard");
  return {
    ...actual,
    useGridKeyboard: vi.fn((actual as any).useGridKeyboard),
  };
});

vi.mock("@dnd-kit/core", () => ({
  useDraggable: vi.fn(() => ({
    attributes: { "aria-roledescription": "sortable" },
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
    transform: null,
  })),
  useDroppable: vi.fn(() => ({
    setNodeRef: vi.fn(),
    isOver: false,
  })),
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  closestCenter: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: any) =>
    open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  AlertDialogCancel: ({ children }: any) => <button>{children}</button>,
}));

vi.mock("../_hooks/usePublish", () => ({
  usePublish: vi.fn(() => ({
    publicationStatus: { status: "DRAFT", publishedAt: null, publishedBy: null },
    isLoadingStatus: false,
    publishPlan: vi.fn(),
    isPublishing: false,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const mockEmployee: ScheduleEmployee = {
  id: "00000000-0000-0000-0000-000000000001",
  firstName: "Alice",
  lastName: "Martin",
  color: "#6366f1",
  jobType: "VET",
  contractHours: 35,
};

const mockEmployee2: ScheduleEmployee = {
  id: "00000000-0000-0000-0000-000000000002",
  firstName: "Bob",
  lastName: "Dupont",
  color: null,
  jobType: "ASV",
  contractHours: 28,
};

const mockDay: ScheduleDayInfo = {
  date: "2026-03-02",
  dayOfWeek: 1,
  isWorkDay: true,
  isClosed: false,
  isSpecialDay: false,
};

const mockDay2: ScheduleDayInfo = {
  date: "2026-03-03",
  dayOfWeek: 2,
  isWorkDay: true,
  isClosed: false,
  isSpecialDay: false,
};

const mockShift: ScheduleShift = {
  id: "00000000-0000-0000-0000-aaaaaaaaaaaa",
  date: "2026-03-02",
  startTime: "08:00",
  endTime: "12:00",
  shiftTypeCode: "SURGERY",
  breakMinutes: 0,
  source: "GENERATED",
  employeeId: "00000000-0000-0000-0000-000000000001",
  isConfirmed: false,
  shiftTypeColor: null,
};

const mockUnavailability: ScheduleUnavailability = {
  employeeId: "00000000-0000-0000-0000-000000000001",
  date: "2026-03-03",
  type: "VACATION",
  reason: "Annual leave",
};

const mockHole: ScheduleHole = {
  date: "2026-03-03",
  shiftTypeCode: "RECEPTION",
  requiredStaff: 2,
  assignedStaff: 1,
  reason: "Not enough eligible employees",
};

const mockScheduleData: ScheduleViewData = {
  month: "2026-03",
  employees: [mockEmployee, mockEmployee2],
  days: [mockDay, mockDay2],
  shifts: [mockShift],
  unavailabilities: [mockUnavailability],
  holes: [mockHole],
  violations: {
    hard: [
      {
        ruleId: "00000000-0000-0000-0000-bbbbbbbbbbbb",
        ruleName: "Min 2 vets",
        category: "STAFFING_MINIMUM",
        message: "Only 1 vet eligible for SURGERY",
        severity: "blocking",
        affectedEmployeeId: "00000000-0000-0000-0000-000000000001",
        affectedDate: "2026-03-02",
      },
    ],
    soft: [
      {
        ruleId: "00000000-0000-0000-0000-cccccccccccc",
        ruleName: "Max Saturdays",
        category: "ROTATION_EQUITY",
        message: "Employee has 3 Saturday shifts",
        severity: "warning",
        affectedEmployeeId: "00000000-0000-0000-0000-000000000002",
        affectedDate: "2026-03-03",
      },
    ],
  },
};

// ===========================================================================
// ScheduleViewWrapper
// ===========================================================================

describe("ScheduleViewWrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeleton when data is loading", async () => {
    const { useScheduleView } = await import("../_hooks/useScheduleView");
    vi.mocked(useScheduleView).mockReturnValue({
      scheduleData: null,
      isLoading: true,
      isFetching: true,
      weeks: [],
      weekOffset: 0,
      totalWeeks: 0,
      currentWeekData: null,
      goToNextWeek: vi.fn(),
      goToPreviousWeek: vi.fn(),
      goToWeek: vi.fn(),
      } as any);

    const { container } = render(<ScheduleViewWrapper month="2026-03" />, {
      wrapper: Wrapper,
    });

    // Skeleton has animate-pulse class
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("shows empty state when no schedule data", async () => {
    const { useScheduleView } = await import("../_hooks/useScheduleView");
    vi.mocked(useScheduleView).mockReturnValue({
      scheduleData: null,
      isLoading: false,
      isFetching: false,
      weeks: [],
      weekOffset: 0,
      totalWeeks: 0,
      currentWeekData: null,
      goToNextWeek: vi.fn(),
      goToPreviousWeek: vi.fn(),
      goToWeek: vi.fn(),
      } as any);

    render(<ScheduleViewWrapper month="2026-03" />, { wrapper: Wrapper });

    expect(screen.getByText("emptyState.title")).toBeInTheDocument();
    expect(screen.getByText("emptyState.description")).toBeInTheDocument();
  });

  it("does not render inline conflict summary (moved to MonthShiftsSummary dialog)", async () => {
    const { useScheduleView } = await import("../_hooks/useScheduleView");
    vi.mocked(useScheduleView).mockReturnValue({
      scheduleData: mockScheduleData,
      isLoading: false,
      isFetching: false,
      weeks: [[mockDay, mockDay2]],
      weekOffset: 0,
      totalWeeks: 1,
      currentWeekData: {
        days: [mockDay, mockDay2],
        shifts: [mockShift],
        unavailabilities: [mockUnavailability],
        holes: [mockHole],
      },
      goToNextWeek: vi.fn(),
      goToPreviousWeek: vi.fn(),
      goToWeek: vi.fn(),
      } as any);

    render(<ScheduleViewWrapper month="2026-03" />, { wrapper: Wrapper });

    // Conflict summary was removed from ScheduleViewWrapper (now in MonthShiftsSummary dialog)
    expect(screen.queryByText("conflict.hardCount")).not.toBeInTheDocument();
    expect(screen.queryByText("conflict.softCount")).not.toBeInTheDocument();
  });

  it("renders StaffGrid and WeekNavigator when data is present", async () => {
    const { useScheduleView } = await import("../_hooks/useScheduleView");
    vi.mocked(useScheduleView).mockReturnValue({
      scheduleData: mockScheduleData,
      isLoading: false,
      isFetching: false,
      weeks: [[mockDay, mockDay2]],
      weekOffset: 0,
      totalWeeks: 1,
      currentWeekData: {
        days: [mockDay, mockDay2],
        shifts: [mockShift],
        unavailabilities: [mockUnavailability],
        holes: [mockHole],
      },
      goToNextWeek: vi.fn(),
      goToPreviousWeek: vi.fn(),
      goToWeek: vi.fn(),
      } as any);

    render(<ScheduleViewWrapper month="2026-03" />, { wrapper: Wrapper });

    // Title and subtitle (HealthBar also renders "title" key, so use getAllByText)
    expect(screen.getAllByText("title").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("subtitle")).toBeInTheDocument();

    // StaffGrid renders with role="grid"
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });
});

// ===========================================================================
// StaffGrid
// ===========================================================================

describe("StaffGrid", () => {
  const emptyConflictMap = new Map<
    string,
    Array<{ message: string; severity: "blocking" | "warning" }>
  >();

  it("renders grid with role='grid' and aria-label", () => {
    render(
      <StaffGrid
        employees={[mockEmployee]}
        days={[mockDay]}
        shifts={[]}
        unavailabilities={[]}
        holes={[]}
        conflictMap={emptyConflictMap}
        moveShift={() => {}}
      />,
      { wrapper: Wrapper },
    );

    const grid = screen.getByRole("grid");
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveAttribute("aria-label", "accessibility.gridLabel");
  });

  it("renders header with employee column and day columns", () => {
    render(
      <StaffGrid
        employees={[mockEmployee]}
        days={[mockDay, mockDay2]}
        shifts={[]}
        unavailabilities={[]}
        holes={[]}
        conflictMap={emptyConflictMap}
        moveShift={() => {}}
      />,
      { wrapper: Wrapper },
    );

    // columnheader roles: 1 for employee column + 2 for day columns + 1 for hours column = 4
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(4);

    // First header is employee column
    expect(headers[0]).toHaveTextContent("grid.employeeColumn");
  });

  it("renders hours summary column with weekly hours", () => {
    const shiftMon: ScheduleShift = {
      id: "s1",
      date: "2026-03-02",
      startTime: "08:00",
      endTime: "12:00",
      shiftTypeCode: "SURGERY",
      breakMinutes: 0,
      source: "GENERATED",
      employeeId: mockEmployee.id,
      isConfirmed: false,
      shiftTypeColor: null,
    };
    const shiftTue: ScheduleShift = {
      id: "s2",
      date: "2026-03-03",
      startTime: "08:00",
      endTime: "18:00",
      shiftTypeCode: "RECEPTION",
      breakMinutes: 0,
      source: "GENERATED",
      employeeId: mockEmployee.id,
      isConfirmed: false,
      shiftTypeColor: null,
    };

    render(
      <StaffGrid
        employees={[mockEmployee]}
        days={[mockDay, mockDay2]}
        shifts={[shiftMon, shiftTue]}
        unavailabilities={[]}
        holes={[]}
        conflictMap={emptyConflictMap}
        moveShift={() => {}}
      />,
      { wrapper: Wrapper },
    );

    // 4h (Mon) + 10h (Tue) = 14h gross total
    expect(screen.getByText("14h")).toBeInTheDocument();
    // Prorated contract hours shown: (35h / 5 work days) * 2 displayed days = 14h
    expect(screen.getByText("/ 14h")).toBeInTheDocument();
  });

  it("renders rows for each employee", () => {
    render(
      <StaffGrid
        employees={[mockEmployee, mockEmployee2]}
        days={[mockDay]}
        shifts={[]}
        unavailabilities={[]}
        holes={[]}
        conflictMap={emptyConflictMap}
        moveShift={() => {}}
      />,
      { wrapper: Wrapper },
    );

    // 1 header row + 2 employee rows = 3 rows total
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3);

    // rowheader for each employee
    const rowHeaders = screen.getAllByRole("rowheader");
    expect(rowHeaders).toHaveLength(2);
    expect(rowHeaders[0]).toHaveTextContent("Alice M.");
    expect(rowHeaders[1]).toHaveTextContent("Bob D.");
  });
});

// ===========================================================================
// ShiftCell
// ===========================================================================

describe("ShiftCell", () => {
  it("renders shift type code", () => {
    render(<ShiftCell shift={mockShift} />, { wrapper: Wrapper });

    expect(screen.getByText("SURGERY")).toBeInTheDocument();
  });

  it("renders time range", () => {
    render(<ShiftCell shift={mockShift} />, { wrapper: Wrapper });

    expect(screen.getByText("08:00 - 12:00")).toBeInTheDocument();
  });

  it("does not render source badge for GENERATED shift (harmonized)", () => {
    const generatedShift: ScheduleShift = {
      ...mockShift,
      source: "GENERATED",
    };

    render(<ShiftCell shift={generatedShift} />, {
      wrapper: Wrapper,
    });

    // GENERATED shifts no longer show a badge — only MANUAL shifts show a grey italic label
    expect(screen.queryByText("generated")).not.toBeInTheDocument();
  });

  it("renders manual label with grey italic styling for MANUAL shift", () => {
    const manualShift: ScheduleShift = {
      ...mockShift,
      source: "MANUAL",
    };

    render(<ShiftCell shift={manualShift} />, {
      wrapper: Wrapper,
    });

    const label = screen.getByText("manual");
    expect(label).toBeInTheDocument();
    expect(label).toHaveClass("text-muted-foreground");
    expect(label).toHaveClass("italic");
  });

  it("renders with breakMinutes in shift data", () => {
    const shiftWithBreak: ScheduleShift = {
      ...mockShift,
      breakMinutes: 30,
    };

    render(<ShiftCell shift={shiftWithBreak} />, { wrapper: Wrapper });

    // ShiftCell currently renders shift type and time range
    // The shift data includes breakMinutes but the cell still renders correctly
    expect(screen.getByText("SURGERY")).toBeInTheDocument();
    expect(screen.getByText("08:00 - 12:00")).toBeInTheDocument();
  });

  it("renders correctly with shiftTypeColor in shift data", () => {
    const shiftWithColor: ScheduleShift = {
      ...mockShift,
      shiftTypeColor: "#3B82F6",
    };

    render(<ShiftCell shift={shiftWithColor} />, { wrapper: Wrapper });

    // ShiftCell renders shift type and time correctly regardless of color data
    expect(screen.getByText("SURGERY")).toBeInTheDocument();
    expect(screen.getByText("08:00 - 12:00")).toBeInTheDocument();
  });
});

// ===========================================================================
// HoleCell
// ===========================================================================

describe("HoleCell", () => {
  it("renders dashed placeholder with shift type", () => {
    render(<HoleCell holes={[mockHole]} />, { wrapper: Wrapper });

    expect(screen.getByText("RECEPTION")).toBeInTheDocument();

    // The hole container has border-dashed class
    const holeDiv = screen.getByText("RECEPTION").closest("div[class*='border-dashed']");
    expect(holeDiv).not.toBeNull();
  });
});

// ===========================================================================
// AbsenceCell
// ===========================================================================

describe("AbsenceCell", () => {
  it("renders VACATION absence with emerald styling", () => {
    const { container } = render(
      <AbsenceCell type="VACATION" reason="Summer holiday" />,
      { wrapper: Wrapper },
    );

    // The mock t() returns the key: "vacation"
    expect(screen.getByText("vacation")).toBeInTheDocument();

    // Contains emerald bg class
    const styledDiv = container.querySelector(".bg-emerald-50");
    expect(styledDiv).not.toBeNull();
  });

  it("renders SICK absence with rose styling", () => {
    const { container } = render(<AbsenceCell type="SICK" />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText("sick")).toBeInTheDocument();

    const styledDiv = container.querySelector(".bg-rose-50");
    expect(styledDiv).not.toBeNull();
  });

  it("renders SCHOOL absence with purple styling", () => {
    const { container } = render(
      <AbsenceCell type="SCHOOL" reason="Apprentice school day" />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText("school")).toBeInTheDocument();

    // SCHOOL type uses bg-purple-50 styling
    const styledDiv = container.querySelector(".bg-purple-50");
    expect(styledDiv).not.toBeNull();

    // Border class for SCHOOL type
    const borderDiv = container.querySelector(".border-purple-100");
    expect(borderDiv).not.toBeNull();
  });

  it("renders OTHER absence with neutral-50 styling", () => {
    const { container } = render(
      <AbsenceCell type="OTHER" reason="Personal" />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText("other")).toBeInTheDocument();

    // OTHER type uses bg-muted styling
    const styledDiv = container.querySelector(".bg-muted");
    expect(styledDiv).not.toBeNull();

    // Border and text classes for OTHER type
    const borderDiv = container.querySelector(".border-border");
    expect(borderDiv).not.toBeNull();
  });
});

// ===========================================================================
// ClosedDayColumn
// ===========================================================================

describe("ClosedDayColumn", () => {
  it("renders closed day with aria-disabled", () => {
    render(
      <ClosedDayColumn
        date="2026-03-08"
        isClosed={true}
        rowIndex={0}
        colIndex={0}
      />,
      { wrapper: Wrapper },
    );

    const cell = screen.getByRole("gridcell");
    expect(cell).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("closedDay")).toBeInTheDocument();
  });
});

// ===========================================================================
// WeekNavigator
// ===========================================================================

describe("WeekNavigator", () => {
  const week1: ScheduleDayInfo[] = [
    { date: "2026-03-02", dayOfWeek: 1, isWorkDay: true, isClosed: false, isSpecialDay: false },
    { date: "2026-03-03", dayOfWeek: 2, isWorkDay: true, isClosed: false, isSpecialDay: false },
  ];
  const week2: ScheduleDayInfo[] = [
    { date: "2026-03-09", dayOfWeek: 1, isWorkDay: true, isClosed: false, isSpecialDay: false },
    { date: "2026-03-10", dayOfWeek: 2, isWorkDay: true, isClosed: false, isSpecialDay: false },
  ];

  it("returns null when only 1 week", () => {
    const { container } = render(
      <WeekNavigator weeks={[week1]} currentWeekIndex={0} onWeekChange={vi.fn()} />,
      { wrapper: Wrapper },
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders navigation buttons for multiple weeks", () => {
    render(
      <WeekNavigator weeks={[week1, week2]} currentWeekIndex={0} onWeekChange={vi.fn()} />,
      { wrapper: Wrapper },
    );

    // Previous and next buttons by aria-label
    expect(screen.getByLabelText("previous")).toBeInTheDocument();
    expect(screen.getByLabelText("next")).toBeInTheDocument();

    // Week index buttons: "1" and "2"
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("highlights current week index", () => {
    render(
      <WeekNavigator weeks={[week1, week2]} currentWeekIndex={1} onWeekChange={vi.fn()} />,
      { wrapper: Wrapper },
    );

    // The second week button should have aria-current="true"
    const weekButtons = screen.getAllByRole("button").filter(
      (btn) => btn.textContent === "1" || btn.textContent === "2",
    );

    const week2Button = weekButtons.find((btn) => btn.textContent === "2");
    expect(week2Button).toHaveAttribute("aria-current", "true");

    const week1Button = weekButtons.find((btn) => btn.textContent === "1");
    expect(week1Button).not.toHaveAttribute("aria-current");
  });
});

// ===========================================================================
// ConflictIndicator
// ===========================================================================

describe("ConflictIndicator", () => {
  it("returns null for empty conflicts array", () => {
    const { container } = render(<ConflictIndicator conflicts={[]} />, {
      wrapper: Wrapper,
    });

    expect(container.firstChild).toBeNull();
  });

  it("renders conflict button with count", () => {
    const conflicts = [
      { message: "Only 1 vet eligible", severity: "blocking" as const },
      { message: "Overtime exceeded", severity: "blocking" as const },
    ];

    render(<ConflictIndicator conflicts={conflicts} />, { wrapper: Wrapper });

    // The button uses aria-label with t("hardCount", { count: 2 }) -> "hardCount"
    const button = screen.getByLabelText("hardCount");
    expect(button).toBeInTheDocument();
  });

  it("opens popover with conflict messages on click", () => {
    const conflicts = [
      { message: "Only 1 vet eligible for SURGERY", severity: "blocking" as const },
      { message: "Overtime limit exceeded", severity: "blocking" as const },
    ];

    render(<ConflictIndicator conflicts={conflicts} />, { wrapper: Wrapper });

    // Before click, conflict messages should not be visible
    expect(screen.queryByText("Only 1 vet eligible for SURGERY")).not.toBeInTheDocument();
    expect(screen.queryByText("Overtime limit exceeded")).not.toBeInTheDocument();

    // Click the trigger button
    const button = screen.getByLabelText("hardCount");
    fireEvent.click(button);

    // After click, popover should show all conflict messages
    expect(screen.getByText("Only 1 vet eligible for SURGERY")).toBeInTheDocument();
    expect(screen.getByText("Overtime limit exceeded")).toBeInTheDocument();

    // Popover header with title and count (text is split across nodes, use substring match)
    expect(screen.getByText((content, element) =>
      element?.tagName === "P" && content.includes("hardTitle"),
    )).toBeInTheDocument();
  });

  it("renders trigger button with Vital Orange background color", () => {
    const conflicts = [
      { message: "Blocking conflict", severity: "blocking" as const },
    ];

    render(<ConflictIndicator conflicts={conflicts} />, { wrapper: Wrapper });

    const button = screen.getByLabelText("hardCount");
    expect(button).toHaveClass("bg-orange-500");
  });

  it("displays all messages when multiple conflicts are present", () => {
    const conflicts = [
      { message: "Conflict A: min staff not met", severity: "blocking" as const },
      { message: "Conflict B: overtime exceeded", severity: "blocking" as const },
      { message: "Conflict C: skill requirement missing", severity: "blocking" as const },
      { message: "Conflict D: rest time violated", severity: "blocking" as const },
    ];

    render(<ConflictIndicator conflicts={conflicts} />, { wrapper: Wrapper });

    // Open the popover
    const button = screen.getByLabelText("hardCount");
    fireEvent.click(button);

    // All 4 conflict messages should be visible
    expect(screen.getByText("Conflict A: min staff not met")).toBeInTheDocument();
    expect(screen.getByText("Conflict B: overtime exceeded")).toBeInTheDocument();
    expect(screen.getByText("Conflict C: skill requirement missing")).toBeInTheDocument();
    expect(screen.getByText("Conflict D: rest time violated")).toBeInTheDocument();
  });
});

// ===========================================================================
// WarningBadge
// ===========================================================================

describe("WarningBadge", () => {
  it("returns null for empty warnings array", () => {
    const { container } = render(<WarningBadge warnings={[]} />, {
      wrapper: Wrapper,
    });

    expect(container.firstChild).toBeNull();
  });

  it("renders badge button with orange styling when warnings are present", () => {
    const warnings = [
      { message: "Overtime risk", severity: "warning" as const },
    ];

    render(<WarningBadge warnings={warnings} />, { wrapper: Wrapper });

    // The button uses aria-label with t("softCount", { count: 1 }) -> "softCount"
    const button = screen.getByLabelText("softCount");
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("bg-orange-400");
  });

  it("opens popover with warning messages on click", () => {
    const warnings = [
      { message: "Employee has 3 Saturday shifts", severity: "warning" as const },
      { message: "Approaching overtime threshold", severity: "warning" as const },
    ];

    render(<WarningBadge warnings={warnings} />, { wrapper: Wrapper });

    // Before click, warning messages should not be visible
    expect(screen.queryByText("Employee has 3 Saturday shifts")).not.toBeInTheDocument();
    expect(screen.queryByText("Approaching overtime threshold")).not.toBeInTheDocument();

    // Click the trigger button
    const button = screen.getByLabelText("softCount");
    fireEvent.click(button);

    // After click, popover should show all warning messages
    expect(screen.getByText("Employee has 3 Saturday shifts")).toBeInTheDocument();
    expect(screen.getByText("Approaching overtime threshold")).toBeInTheDocument();

    // Popover header with title and count (text is split across nodes, use substring match)
    expect(screen.getByText((content, element) =>
      element?.tagName === "P" && content.includes("softTitle"),
    )).toBeInTheDocument();
  });

  it("displays all messages when multiple warnings are present", () => {
    const warnings = [
      { message: "Warning A: equity imbalance", severity: "warning" as const },
      { message: "Warning B: weekend saturation", severity: "warning" as const },
      { message: "Warning C: rotation suboptimal", severity: "warning" as const },
    ];

    render(<WarningBadge warnings={warnings} />, { wrapper: Wrapper });

    // Open the popover
    const button = screen.getByLabelText("softCount");
    fireEvent.click(button);

    // All 3 warning messages should be visible
    expect(screen.getByText("Warning A: equity imbalance")).toBeInTheDocument();
    expect(screen.getByText("Warning B: weekend saturation")).toBeInTheDocument();
    expect(screen.getByText("Warning C: rotation suboptimal")).toBeInTheDocument();
  });
});

// ===========================================================================
// useGridKeyboard
// ===========================================================================

describe("useGridKeyboard", () => {
  it("initializes with activeRow=0, activeCol=0", () => {
    const { result } = renderHook(() =>
      useGridKeyboard({ rowCount: 3, colCount: 5 }),
    );

    expect(result.current.activeRow).toBe(0);
    expect(result.current.activeCol).toBe(0);
  });

  it("getCellTabIndex returns 0 for active cell, -1 for others", () => {
    const { result } = renderHook(() =>
      useGridKeyboard({ rowCount: 3, colCount: 5 }),
    );

    // Active cell (0, 0) should have tabIndex 0
    expect(result.current.getCellTabIndex(0, 0)).toBe(0);

    // Other cells should have tabIndex -1
    expect(result.current.getCellTabIndex(0, 1)).toBe(-1);
    expect(result.current.getCellTabIndex(1, 0)).toBe(-1);
    expect(result.current.getCellTabIndex(2, 4)).toBe(-1);
  });

  it("returns a gridRef ref object", () => {
    const { result } = renderHook(() =>
      useGridKeyboard({ rowCount: 3, colCount: 5 }),
    );

    expect(result.current.gridRef).toBeDefined();
    expect(result.current.gridRef.current).toBeNull();
  });
});

// ===========================================================================
// DraggableShiftCell
// ===========================================================================

describe("DraggableShiftCell", () => {
  const draggableShift: ScheduleShift = {
    id: "00000000-0000-0000-0000-dddddddddddd",
    date: "2026-03-03",
    startTime: "08:00",
    endTime: "12:00",
    shiftTypeCode: "SURGERY",
    breakMinutes: 0,
    source: "MANUAL",
    employeeId: "00000000-0000-0000-0000-000000000001",
    isConfirmed: false,
    shiftTypeColor: "#4f46e5",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default non-dragging state
    vi.mocked(useDraggable).mockReturnValue({
      attributes: { "aria-roledescription": "sortable" } as any,
      listeners: {} as any,
      setNodeRef: vi.fn(),
      isDragging: false,
      transform: null,
      node: { current: null } as any,
      activatorEvent: null,
      active: null,
      over: null,
      activeNodeRect: null,
    } as any);
  });

  it("renders with drag handle aria-label", () => {
    render(<DraggableShiftCell shift={draggableShift} />, { wrapper: Wrapper });
    expect(screen.getByLabelText("dragHandle")).toBeInTheDocument();
  });

  it("renders shift cell content", () => {
    render(<DraggableShiftCell shift={draggableShift} />, { wrapper: Wrapper });
    expect(screen.getByText("SURGERY")).toBeInTheDocument();
  });

  it("applies cursor-grab class when not dragging", () => {
    render(<DraggableShiftCell shift={draggableShift} />, { wrapper: Wrapper });
    const el = screen.getByLabelText("dragHandle");
    expect(el.className).toContain("cursor-grab");
    expect(el.className).not.toContain("cursor-grabbing");
  });

  it("applies opacity-30 and cursor-grabbing when dragging", () => {
    vi.mocked(useDraggable).mockReturnValue({
      attributes: {} as any,
      listeners: {} as any,
      setNodeRef: vi.fn(),
      isDragging: true,
      transform: null,
      node: { current: null } as any,
      activatorEvent: null,
      active: null,
      over: null,
      activeNodeRect: null,
    } as any);

    render(<DraggableShiftCell shift={draggableShift} />, { wrapper: Wrapper });
    const el = screen.getByLabelText("dragHandle");
    expect(el.className).toContain("opacity-30");
    expect(el.className).toContain("cursor-grabbing");
  });

  it("passes shift id as draggable id", () => {
    render(<DraggableShiftCell shift={draggableShift} />, { wrapper: Wrapper });
    expect(useDraggable).toHaveBeenCalledWith(
      expect.objectContaining({ id: draggableShift.id }),
    );
  });

  it("passes shift data to useDraggable", () => {
    render(<DraggableShiftCell shift={draggableShift} />, { wrapper: Wrapper });
    expect(useDraggable).toHaveBeenCalledWith(
      expect.objectContaining({ data: { shift: draggableShift } }),
    );
  });

  it("renders time range from ShiftCell", () => {
    render(<DraggableShiftCell shift={draggableShift} />, { wrapper: Wrapper });
    expect(screen.getByText("08:00 - 12:00")).toBeInTheDocument();
  });
});

// ===========================================================================
// DroppableGridCell
// ===========================================================================

describe("DroppableGridCell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDroppable).mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: false,
      active: null,
      over: null,
      node: { current: null } as any,
      rect: { current: null } as any,
    });
  });

  it("renders children inside a gridcell", () => {
    render(
      <DroppableGridCell
        employeeId="emp-1"
        date="2026-03-03"
        isDragging={false}
        dropFeedback={null}
      >
        <span>Content</span>
      </DroppableGridCell>,
      { wrapper: Wrapper },
    );
    expect(screen.getByRole("gridcell")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("sets droppable id to employeeId|date", () => {
    render(
      <DroppableGridCell
        employeeId="emp-1"
        date="2026-03-03"
        isDragging={false}
        dropFeedback={null}
      >
        <span>Content</span>
      </DroppableGridCell>,
      { wrapper: Wrapper },
    );
    expect(useDroppable).toHaveBeenCalledWith(
      expect.objectContaining({ id: "emp-1|2026-03-03" }),
    );
  });

  it("passes employeeId and date as droppable data", () => {
    render(
      <DroppableGridCell
        employeeId="emp-1"
        date="2026-03-03"
        isDragging={false}
        dropFeedback={null}
      >
        <span>Content</span>
      </DroppableGridCell>,
      { wrapper: Wrapper },
    );
    expect(useDroppable).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { employeeId: "emp-1", date: "2026-03-03" },
      }),
    );
  });

  it("applies no feedback styles when not dragging", () => {
    render(
      <DroppableGridCell
        employeeId="emp-1"
        date="2026-03-03"
        isDragging={false}
        dropFeedback="valid"
      >
        <span>Content</span>
      </DroppableGridCell>,
      { wrapper: Wrapper },
    );
    const cell = screen.getByRole("gridcell");
    expect(cell.className).not.toContain("ring-emerald-400");
  });

  it("applies valid feedback styles when dragging and isOver", () => {
    vi.mocked(useDroppable).mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: true,
      active: null,
      over: null,
      node: { current: null } as any,
      rect: { current: null } as any,
    });

    render(
      <DroppableGridCell
        employeeId="emp-1"
        date="2026-03-03"
        isDragging={true}
        dropFeedback="valid"
      >
        <span>Content</span>
      </DroppableGridCell>,
      { wrapper: Wrapper },
    );
    const cell = screen.getByRole("gridcell");
    expect(cell.className).toContain("ring-emerald-400");
    expect(cell.className).toContain("bg-emerald-50/50");
  });

  it("applies blocked feedback styles when dragging and isOver", () => {
    vi.mocked(useDroppable).mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: true,
      active: null,
      over: null,
      node: { current: null } as any,
      rect: { current: null } as any,
    });

    render(
      <DroppableGridCell
        employeeId="emp-1"
        date="2026-03-03"
        isDragging={true}
        dropFeedback="blocked"
      >
        <span>Content</span>
      </DroppableGridCell>,
      { wrapper: Wrapper },
    );
    const cell = screen.getByRole("gridcell");
    expect(cell.className).toContain("ring-rose-400");
    expect(cell.className).toContain("bg-rose-50/50");
  });

  it("applies warning feedback styles when dragging and isOver", () => {
    vi.mocked(useDroppable).mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: true,
      active: null,
      over: null,
      node: { current: null } as any,
      rect: { current: null } as any,
    });

    render(
      <DroppableGridCell
        employeeId="emp-1"
        date="2026-03-03"
        isDragging={true}
        dropFeedback="warning"
      >
        <span>Content</span>
      </DroppableGridCell>,
      { wrapper: Wrapper },
    );
    const cell = screen.getByRole("gridcell");
    expect(cell.className).toContain("ring-orange-400");
    expect(cell.className).toContain("bg-orange-50/50");
  });

  it("does not apply feedback styles when isOver is false even if dragging", () => {
    render(
      <DroppableGridCell
        employeeId="emp-1"
        date="2026-03-03"
        isDragging={true}
        dropFeedback="valid"
      >
        <span>Content</span>
      </DroppableGridCell>,
      { wrapper: Wrapper },
    );
    const cell = screen.getByRole("gridcell");
    expect(cell.className).not.toContain("ring-emerald-400");
  });

  it("sets tabIndex and data attributes from props", () => {
    render(
      <DroppableGridCell
        employeeId="emp-1"
        date="2026-03-03"
        isDragging={false}
        dropFeedback={null}
        tabIndex={0}
        rowIndex={1}
        colIndex={2}
      >
        <span>Content</span>
      </DroppableGridCell>,
      { wrapper: Wrapper },
    );
    const cell = screen.getByRole("gridcell");
    expect(cell).toHaveAttribute("tabindex", "0");
    expect(cell).toHaveAttribute("data-row", "1");
    expect(cell).toHaveAttribute("data-col", "2");
  });
});

// ===========================================================================
// DragGhost
// ===========================================================================

describe("DragGhost", () => {
  const ghostShift: ScheduleShift = {
    id: "00000000-0000-0000-0000-eeeeeeeeeeee",
    date: "2026-03-03",
    startTime: "08:00",
    endTime: "12:00",
    shiftTypeCode: "SURGERY",
    breakMinutes: 0,
    source: "MANUAL",
    employeeId: "00000000-0000-0000-0000-000000000001",
    isConfirmed: false,
    shiftTypeColor: "#4f46e5",
  };

  it("renders ShiftCell when activeShift is provided", () => {
    render(<DragGhost activeShift={ghostShift} />, { wrapper: Wrapper });
    expect(screen.getByText("SURGERY")).toBeInTheDocument();
    expect(screen.getByText("08:00 - 12:00")).toBeInTheDocument();
  });

  it("renders empty overlay when no active shift", () => {
    const { container } = render(<DragGhost activeShift={null} />, {
      wrapper: Wrapper,
    });
    expect(
      container.querySelector('[data-testid="drag-overlay"]'),
    ).toBeInTheDocument();
    // No shift content inside
    expect(screen.queryByText("SURGERY")).not.toBeInTheDocument();
  });

  it("wraps ShiftCell in a styled container for the overlay", () => {
    const { container } = render(<DragGhost activeShift={ghostShift} />, {
      wrapper: Wrapper,
    });
    const overlay = container.querySelector('[data-testid="drag-overlay"]');
    expect(overlay).toBeInTheDocument();
    // The styled wrapper should be inside the overlay
    expect(overlay?.querySelector(".shadow-lg")).not.toBeNull();
  });
});

// ===========================================================================
// AssignShiftModal
// ===========================================================================

describe("AssignShiftModal", () => {
  const modalHole: ScheduleHole = {
    date: "2026-03-03",
    shiftTypeCode: "RECEPTION",
    requiredStaff: 2,
    assignedStaff: 1,
    reason: "Not enough eligible employees",
  };

  const modalEmployees: ScheduleEmployee[] = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      firstName: "Alice",
      lastName: "Martin",
      jobType: "VET",
      contractHours: 35,
      color: "#6366f1",
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      firstName: "Bob",
      lastName: "Dupont",
      jobType: "ASV",
      contractHours: 28,
      color: null,
    },
  ];

  const defaultModalProps = {
    open: true,
    onClose: vi.fn(),
    hole: modalHole,
    employees: modalEmployees,
    onAssign: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders modal with title when open", () => {
    render(<AssignShiftModal {...defaultModalProps} />, { wrapper: Wrapper });
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("renders subtitle description", () => {
    render(<AssignShiftModal {...defaultModalProps} />, { wrapper: Wrapper });
    expect(screen.getByText("subtitle")).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    render(<AssignShiftModal {...defaultModalProps} open={false} />, {
      wrapper: Wrapper,
    });
    expect(screen.queryByText("title")).not.toBeInTheDocument();
  });

  it("lists all employees", () => {
    render(<AssignShiftModal {...defaultModalProps} />, { wrapper: Wrapper });
    expect(screen.getByText("Alice Martin")).toBeInTheDocument();
    expect(screen.getByText("Bob Dupont")).toBeInTheDocument();
  });

  it("shows employee job types", () => {
    render(<AssignShiftModal {...defaultModalProps} />, { wrapper: Wrapper });
    expect(screen.getByText("VET")).toBeInTheDocument();
    expect(screen.getByText("ASV")).toBeInTheDocument();
  });

  it("shows blocked status for employees with unavailability", () => {
    const unavailabilityIndex = new Map<string, ScheduleUnavailability[]>([
      [
        "00000000-0000-0000-0000-000000000001|2026-03-03",
        [
          {
            employeeId: "00000000-0000-0000-0000-000000000001",
            date: "2026-03-03",
            type: "VACATION",
            reason: "Holidays",
          },
        ],
      ],
    ]);

    render(
      <AssignShiftModal
        {...defaultModalProps}
        unavailabilityIndex={unavailabilityIndex}
      />,
      { wrapper: Wrapper },
    );

    // emp-1 (Alice) should be blocked — find her button and check disabled
    const buttons = screen.getAllByRole("button");
    const aliceButton = buttons.find((b) =>
      b.textContent?.includes("Alice"),
    );
    expect(aliceButton).toBeDefined();
    expect(aliceButton).toBeDisabled();
  });

  it("shows blocked status for employees with overlapping shift type", () => {
    const shiftIndex = new Map<string, ScheduleShift[]>([
      [
        "00000000-0000-0000-0000-000000000002|2026-03-03",
        [
          {
            id: "existing-shift",
            date: "2026-03-03",
            startTime: "08:00",
            endTime: "12:00",
            shiftTypeCode: "RECEPTION", // Same as hole shiftTypeCode
            breakMinutes: 0,
            source: "GENERATED",
            employeeId: "00000000-0000-0000-0000-000000000002",
            isConfirmed: false,
            shiftTypeColor: null,
          },
        ],
      ],
    ]);

    render(
      <AssignShiftModal {...defaultModalProps} shiftIndex={shiftIndex} />,
      { wrapper: Wrapper },
    );

    const buttons = screen.getAllByRole("button");
    const bobButton = buttons.find((b) => b.textContent?.includes("Bob"));
    expect(bobButton).toBeDefined();
    expect(bobButton).toBeDisabled();
  });

  it("calls onAssign with correct payload when clicking eligible employee", () => {
    const onAssign = vi.fn();
    render(
      <AssignShiftModal {...defaultModalProps} onAssign={onAssign} />,
      { wrapper: Wrapper },
    );

    const buttons = screen.getAllByRole("button");
    const aliceButton = buttons.find((b) =>
      b.textContent?.includes("Alice"),
    );
    expect(aliceButton).toBeDefined();

    fireEvent.click(aliceButton!);

    expect(onAssign).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: "00000000-0000-0000-0000-000000000001",
        date: "2026-03-03",
        shiftTypeCode: "RECEPTION",
      }),
    );
  });

  it("calls onClose after assigning a shift", () => {
    const onClose = vi.fn();
    const onAssign = vi.fn();
    render(
      <AssignShiftModal
        {...defaultModalProps}
        onClose={onClose}
        onAssign={onAssign}
      />,
      { wrapper: Wrapper },
    );

    const buttons = screen.getAllByRole("button");
    const aliceButton = buttons.find((b) =>
      b.textContent?.includes("Alice"),
    );
    fireEvent.click(aliceButton!);

    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <AssignShiftModal {...defaultModalProps} onClose={onClose} />,
      { wrapper: Wrapper },
    );

    const cancelButton = screen.getByText("cancel");
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
  });

  it("returns null when hole is null", () => {
    const { container } = render(
      <AssignShiftModal {...defaultModalProps} hole={null} />,
      { wrapper: Wrapper },
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows noEligible message when employees array is empty", () => {
    render(
      <AssignShiftModal {...defaultModalProps} employees={[]} />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText("noEligible")).toBeInTheDocument();
  });

  it("displays date and shiftType info from hole", () => {
    render(<AssignShiftModal {...defaultModalProps} />, { wrapper: Wrapper });
    // The t() mock returns the key, so we look for the translated key strings
    expect(screen.getByText("date")).toBeInTheDocument();
    expect(screen.getByText("shiftType")).toBeInTheDocument();
  });
});
