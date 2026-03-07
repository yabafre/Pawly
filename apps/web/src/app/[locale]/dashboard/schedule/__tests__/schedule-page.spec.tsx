import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────

// next-intl is already mocked globally in vitest.setup.ts

// Mock date-fns — provide real implementations for functions used by components
import * as dateFns from "date-fns";

vi.mock("date-fns", () => ({
  format: vi.fn(() => "2026-03"),
  parseISO: vi.fn((s: string) => new Date(s)),
  isToday: vi.fn(() => false),
  isPast: vi.fn(() => false),
  getISOWeek: vi.fn(() => 10),
  getISOWeekYear: vi.fn(() => 2026),
}));

vi.mock("date-fns/locale", () => ({
  fr: {},
  enUS: {},
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  ChevronLeft: (props: any) => <span data-testid="icon-chevron-left" {...props} />,
  ChevronRight: (props: any) => <span data-testid="icon-chevron-right" {...props} />,
  Briefcase: (props: any) => <span data-testid="icon-briefcase" {...props} />,
  CheckCircle: (props: any) => <span data-testid="icon-check-circle" {...props} />,
  AlertCircle: (props: any) => <span data-testid="icon-alert-circle" {...props} />,
  CalendarDays: (props: any) => <span data-testid="icon-calendar-days" {...props} />,
  WifiOff: (props: any) => <span data-testid="icon-wifi-off" {...props} />,
  Plane: (props: any) => <span data-testid="icon-plane" {...props} />,
  Thermometer: (props: any) => <span data-testid="icon-thermometer" {...props} />,
  GraduationCap: (props: any) => <span data-testid="icon-graduation" {...props} />,
  CalendarOff: (props: any) => <span data-testid="icon-calendar-off" {...props} />,
  Check: (props: any) => <span data-testid="icon-check" {...props} />,
  Loader2: (props: any) => <span data-testid="icon-loader" {...props} />,
  ArrowRight: (props: any) => <span data-testid="icon-arrow-right" {...props} />,
}));

// Mock UI components
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: any) => (
    <div data-testid="skeleton" className={`animate-pulse ${className ?? ""}`} />
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, disabled, onClick, ...rest }: any) => (
    <button disabled={disabled} onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

// Mock custom hooks
const mockUseMySchedule = vi.fn();
const mockUseMyShiftTypes = vi.fn();
const mockConfirmShift = vi.fn();

vi.mock("../_hooks/useMySchedule", () => ({
  useMySchedule: (...args: any[]) => mockUseMySchedule(...args),
  useMyShiftTypes: (...args: any[]) => mockUseMyShiftTypes(...args),
}));

vi.mock("../_hooks/useConfirmShift", () => ({
  useConfirmShift: () => ({
    confirmShift: mockConfirmShift,
    isPending: false,
  }),
}));

// ── Test Data ────────────────────────────────────────────────────────────

const mockShiftTypes = [
  { code: "CHIR", label: "Chirurgie", color: "#4f46e5", breakMinutes: 60 },
  { code: "CONS", label: "Consultation", color: "#22c55e", breakMinutes: 30 },
];

const mockScheduleData = {
  month: "2026-03",
  employee: {
    id: "emp-1",
    firstName: "Julie",
    lastName: "Martin",
    jobType: "VET",
    contractHours: 35,
    color: "#3b82f6",
  },
  shifts: [
    {
      id: "s1",
      date: "2026-03-03",
      startTime: "08:30",
      endTime: "18:30",
      shiftTypeCode: "CHIR",
      breakMinutes: 60,
      isConfirmed: true,
      source: "GENERATED" as const,
    },
  ],
  unavailabilities: [] as any[],
  publicationStatus: {
    status: "PUBLISHED" as const,
    publishedAt: "2026-02-28T10:00:00Z",
  },
  weeklySummary: [
    { weekNumber: 10, totalMinutes: 2100, shiftCount: 5, contractMinutes: 2100 },
  ],
  shiftTypes: mockShiftTypes,
};

// ── Imports (after mocks) ────────────────────────────────────────────────

import { SchedulePageClient } from "../_components/SchedulePageClient";
import { MonthSelector } from "../_components/MonthSelector";
import { ShiftDayCard } from "../_components/ShiftDayCard";
import { AbsenceDayCard } from "../_components/AbsenceDayCard";
import { OfflineBanner } from "@/components/OfflineBanner";

// ── SchedulePageClient ──────────────────────────────────────────────────

describe("SchedulePageClient", () => {
  beforeEach(() => {
    mockUseMySchedule.mockReturnValue({
      data: mockScheduleData,
      isPending: false,
    });
    mockUseMyShiftTypes.mockReturnValue({
      data: mockShiftTypes,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading skeletons when isPending is true", () => {
    mockUseMySchedule.mockReturnValue({
      data: undefined,
      isPending: true,
    });

    const { container } = render(<SchedulePageClient />);

    const skeletons = container.querySelectorAll("[data-testid='skeleton']");
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });

  it("renders schedule title when data is loaded", () => {
    render(<SchedulePageClient />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("title");
  });

  it("renders WeeklySummaryCard with correct data", () => {
    render(<SchedulePageClient />);

    // WeeklySummaryCard uses a progressbar
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toBeDefined();
  });

  it("renders PublicationBadge for PUBLISHED status", () => {
    render(<SchedulePageClient />);

    // PublicationBadge for PUBLISHED renders publishedAt or published key
    const badge = screen.getByText(/publishedAt|published/);
    expect(badge).toBeDefined();
    expect(badge.className).toContain("bg-emerald-100");
  });

  it("renders PublicationBadge for DRAFT status", () => {
    mockUseMySchedule.mockReturnValue({
      data: {
        ...mockScheduleData,
        publicationStatus: { status: "DRAFT", publishedAt: null },
      },
      isPending: false,
    });

    render(<SchedulePageClient />);

    const badge = screen.getByText("draft");
    expect(badge).toBeDefined();
    expect(badge.className).toContain("bg-amber-100");
  });

  it("renders EmptyState when no shifts and no unavailabilities", () => {
    mockUseMySchedule.mockReturnValue({
      data: {
        ...mockScheduleData,
        shifts: [],
        unavailabilities: [],
      },
      isPending: false,
    });

    render(<SchedulePageClient />);

    expect(screen.getByText("noShifts")).toBeDefined();
    expect(screen.getByTestId("icon-calendar-days")).toBeDefined();
  });

  it("renders shift cards when shifts exist", () => {
    render(<SchedulePageClient />);

    expect(screen.getByText("Chirurgie")).toBeDefined();
    expect(screen.getByText("08:30 — 18:30")).toBeDefined();
  });

  it("renders absence cards when unavailabilities exist", () => {
    mockUseMySchedule.mockReturnValue({
      data: {
        ...mockScheduleData,
        shifts: [],
        unavailabilities: [
          { date: "2026-03-05", type: "VACATION" as const },
        ],
      },
      isPending: false,
    });

    render(<SchedulePageClient />);

    expect(screen.getByText("vacation")).toBeDefined();
  });
});

// ── MonthSelector ───────────────────────────────────────────────────────

describe("MonthSelector", () => {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  it("renders month label", () => {
    const { container } = render(
      <MonthSelector selectedMonth={currentMonth} onMonthChange={vi.fn()} />,
    );

    const label = container.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(label).not.toBeNull();
    expect(label.textContent).toBeTruthy();
  });

  it("calls onMonthChange when clicking next", () => {
    const onMonthChange = vi.fn();

    render(
      <MonthSelector selectedMonth={currentMonth} onMonthChange={onMonthChange} />,
    );

    const nextButton = screen.getByLabelText("next");
    fireEvent.click(nextButton);

    expect(onMonthChange).toHaveBeenCalledTimes(1);
  });

  it("disables previous button when at start of range", () => {
    // The range starts 2 months before now
    const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`;

    render(
      <MonthSelector selectedMonth={startMonth} onMonthChange={vi.fn()} />,
    );

    const prevButton = screen.getByLabelText("previous");
    expect(prevButton).toHaveProperty("disabled", true);
  });

  it("disables next button when at end of range", () => {
    // The range ends 2 months after now
    const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    const endMonth = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}`;

    render(
      <MonthSelector selectedMonth={endMonth} onMonthChange={vi.fn()} />,
    );

    const nextButton = screen.getByLabelText("next");
    expect(nextButton).toHaveProperty("disabled", true);
  });
});

// ── ShiftDayCard ────────────────────────────────────────────────────────

describe("ShiftDayCard", () => {
  const baseShift = {
    id: "s1",
    date: "2026-03-03",
    startTime: "08:30",
    endTime: "18:30",
    shiftTypeCode: "CHIR",
    breakMinutes: 60,
    isConfirmed: true,
    source: "GENERATED" as const,
  };

  const shiftType = {
    code: "CHIR",
    label: "Chirurgie",
    color: "#4f46e5",
    breakMinutes: 60,
  };

  it("renders shift type label and time range", () => {
    render(<ShiftDayCard shift={baseShift} shiftType={shiftType} />);

    expect(screen.getByText("Chirurgie")).toBeDefined();
    expect(screen.getByText("08:30 — 18:30")).toBeDefined();
  });

  it("falls back to shiftTypeCode when shiftType is undefined", () => {
    render(<ShiftDayCard shift={baseShift} />);

    expect(screen.getByText("CHIR")).toBeDefined();
  });

  it("shows ConfirmationSlider for past shifts when PUBLISHED", () => {
    vi.mocked(dateFns.isPast).mockReturnValue(true);

    render(
      <ShiftDayCard
        shift={{ ...baseShift, isConfirmed: true }}
        shiftType={shiftType}
        publicationStatus="PUBLISHED"
      />,
    );

    // ConfirmationSlider renders confirmed state with role=status
    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.getByText("confirmed")).toBeDefined();
  });

  it("shows ConfirmationSlider with action button for unconfirmed past shifts", () => {
    vi.mocked(dateFns.isPast).mockReturnValue(true);

    render(
      <ShiftDayCard
        shift={{ ...baseShift, isConfirmed: false }}
        shiftType={shiftType}
        publicationStatus="PUBLISHED"
      />,
    );

    // ConfirmationSlider renders idle state with role=switch
    expect(screen.getByRole("switch")).toBeDefined();
    expect(screen.getByText("slideToConfirm")).toBeDefined();
  });

  it("does not show ConfirmationSlider when publicationStatus is DRAFT", () => {
    vi.mocked(dateFns.isPast).mockReturnValue(true);

    render(
      <ShiftDayCard
        shift={{ ...baseShift, isConfirmed: false }}
        shiftType={shiftType}
        publicationStatus="DRAFT"
      />,
    );

    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not show ConfirmationSlider for future shifts", () => {
    vi.mocked(dateFns.isPast).mockReturnValue(false);
    vi.mocked(dateFns.isToday).mockReturnValue(false);

    render(
      <ShiftDayCard
        shift={{ ...baseShift, isConfirmed: false }}
        shiftType={shiftType}
        publicationStatus="PUBLISHED"
      />,
    );

    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("calls confirmShift when slider is clicked", () => {
    vi.mocked(dateFns.isPast).mockReturnValue(true);

    render(
      <ShiftDayCard
        shift={{ ...baseShift, id: "shift-42", isConfirmed: false }}
        shiftType={shiftType}
        publicationStatus="PUBLISHED"
      />,
    );

    fireEvent.click(screen.getByRole("switch"));
    expect(mockConfirmShift).toHaveBeenCalledWith({ shiftId: "shift-42" });
  });

  it("shows break minutes when breakMinutes > 0", () => {
    render(
      <ShiftDayCard
        shift={{ ...baseShift, breakMinutes: 60 }}
        shiftType={shiftType}
      />,
    );

    expect(screen.getByText("timeline.break")).toBeDefined();
  });

  it("does not show break info when breakMinutes is 0", () => {
    render(
      <ShiftDayCard
        shift={{ ...baseShift, breakMinutes: 0 }}
        shiftType={shiftType}
      />,
    );

    expect(screen.queryByText("timeline.break")).toBeNull();
  });
});

// ── AbsenceDayCard ──────────────────────────────────────────────────────

describe("AbsenceDayCard", () => {
  it("renders VACATION with emerald colors", () => {
    const { container } = render(
      <AbsenceDayCard unavailability={{ date: "2026-03-05", type: "VACATION" }} />,
    );

    expect(screen.getByText("vacation")).toBeDefined();
    expect(screen.getByTestId("icon-plane")).toBeDefined();

    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("bg-emerald-50");
    expect(card.className).toContain("border-emerald-100");
  });

  it("renders SICK with rose colors", () => {
    const { container } = render(
      <AbsenceDayCard unavailability={{ date: "2026-03-06", type: "SICK" }} />,
    );

    expect(screen.getByText("sick")).toBeDefined();
    expect(screen.getByTestId("icon-thermometer")).toBeDefined();

    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("bg-rose-50");
    expect(card.className).toContain("border-rose-100");
  });

  it("renders SCHOOL with purple colors", () => {
    const { container } = render(
      <AbsenceDayCard unavailability={{ date: "2026-03-07", type: "SCHOOL" }} />,
    );

    expect(screen.getByText("school")).toBeDefined();
    expect(screen.getByTestId("icon-graduation")).toBeDefined();

    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("bg-purple-50");
  });

  it("renders reason text when provided", () => {
    render(
      <AbsenceDayCard
        unavailability={{ date: "2026-03-05", type: "VACATION", reason: "Family trip" }}
      />,
    );

    expect(screen.getByText("Family trip")).toBeDefined();
  });
});

// ── OfflineBanner ───────────────────────────────────────────────────────

describe("OfflineBanner", () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
  });

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", {
      value: originalOnLine,
      writable: true,
      configurable: true,
    });
  });

  it("does not render when navigator.onLine is true", () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });

    const { container } = render(<OfflineBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("renders banner when navigator.onLine is false", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });

    render(<OfflineBanner />);

    expect(screen.getByText("banner")).toBeDefined();
    expect(screen.getByTestId("icon-wifi-off")).toBeDefined();
  });

  it("disappears when online event fires", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });

    const { container } = render(<OfflineBanner />);

    expect(screen.getByText("banner")).toBeDefined();

    act(() => {
      Object.defineProperty(navigator, "onLine", {
        value: true,
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event("online"));
    });

    expect(container.innerHTML).toBe("");
  });
});
