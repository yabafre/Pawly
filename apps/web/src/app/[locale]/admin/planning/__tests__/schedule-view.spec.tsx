import { render, screen, fireEvent } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { useGridKeyboard } from "../_hooks/useGridKeyboard";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
    resetWeek: vi.fn(),
  })),
}));

vi.mock("../_hooks/useGridKeyboard", async () => {
  const actual = await vi.importActual("../_hooks/useGridKeyboard");
  return {
    ...actual,
    useGridKeyboard: vi.fn((actual as any).useGridKeyboard),
  };
});

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
  source: "GENERATED",
  employeeId: "00000000-0000-0000-0000-000000000001",
  isConfirmed: false,
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
      resetWeek: vi.fn(),
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
      resetWeek: vi.fn(),
    } as any);

    render(<ScheduleViewWrapper month="2026-03" />, { wrapper: Wrapper });

    expect(screen.getByText("emptyState.title")).toBeInTheDocument();
    expect(screen.getByText("emptyState.description")).toBeInTheDocument();
  });

  it("renders conflict summary with hard and soft counts", async () => {
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
      resetWeek: vi.fn(),
    } as any);

    render(<ScheduleViewWrapper month="2026-03" />, { wrapper: Wrapper });

    // Conflict summary is rendered with aria-live
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();

    // The mock t() returns the key, so we look for "conflict.hardCount" and "conflict.softCount"
    expect(screen.getByText("conflict.hardCount")).toBeInTheDocument();
    expect(screen.getByText("conflict.softCount")).toBeInTheDocument();
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
      resetWeek: vi.fn(),
    } as any);

    render(<ScheduleViewWrapper month="2026-03" />, { wrapper: Wrapper });

    // Title and subtitle
    expect(screen.getByText("title")).toBeInTheDocument();
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
      source: "GENERATED",
      employeeId: mockEmployee.id,
      isConfirmed: false,
    };
    const shiftTue: ScheduleShift = {
      id: "s2",
      date: "2026-03-03",
      startTime: "08:00",
      endTime: "18:00",
      shiftTypeCode: "RECEPTION",
      source: "GENERATED",
      employeeId: mockEmployee.id,
      isConfirmed: false,
    };

    render(
      <StaffGrid
        employees={[mockEmployee]}
        days={[mockDay, mockDay2]}
        shifts={[shiftMon, shiftTue]}
        unavailabilities={[]}
        holes={[]}
        conflictMap={emptyConflictMap}
      />,
      { wrapper: Wrapper },
    );

    // 4h (Mon) + 10h (Tue) = 14h total
    expect(screen.getByText("14h")).toBeInTheDocument();
    // Contract hours shown
    expect(screen.getByText("/ 35h")).toBeInTheDocument();
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
