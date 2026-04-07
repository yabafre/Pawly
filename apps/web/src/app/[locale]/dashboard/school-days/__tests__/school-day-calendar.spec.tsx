import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SchoolDayCalendar } from "../_components/SchoolDayCalendar";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      if (params) return `${key}:${JSON.stringify(params)}`;
      return key;
    };
    return t;
  },
  useLocale: () => "fr",
}));

// Mock EmployeeContext
const mockUseEmployeeContext = vi.fn().mockReturnValue({
  employeeId: "emp-1",
  jobType: "APPRENTICE",
});

vi.mock("../../_components/EmployeeContext", () => ({
  useEmployeeContext: () => mockUseEmployeeContext(),
}));

// Mock hooks
const mockDeclareSchoolDays = vi.fn();
const mockUseSchoolDays = vi.fn().mockReturnValue({
  schoolDays: [],
  isPending: false,
  isFetching: false,
  error: null,
});
const mockUseDeclareSchoolDays = vi.fn().mockReturnValue({
  declareSchoolDays: mockDeclareSchoolDays,
  isPending: false,
  error: null,
});

vi.mock("../_hooks/useSchoolDays", () => ({
  useSchoolDays: (...args: any[]) => mockUseSchoolDays(...args),
  useDeclareSchoolDays: (...args: any[]) => mockUseDeclareSchoolDays(...args),
}));

// Mock Calendar component
vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ selected, onSelect, ...props }: any) => (
    <div data-testid="calendar" data-selected-count={selected?.length ?? 0}>
      <button
        data-testid="calendar-select-date"
        onClick={() =>
          onSelect([
            ...(selected ?? []),
            new Date(2026, 3, 7),
          ])
        }
      >
        Select date
      </button>
    </div>
  ),
}));

// Mock SchoolDayReminderBanner
vi.mock("../_components/SchoolDayReminderBanner", () => ({
  SchoolDayReminderBanner: ({ month }: { month: string }) => (
    <div data-testid="reminder-banner">{month}</div>
  ),
}));

describe("SchoolDayCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEmployeeContext.mockReturnValue({
      employeeId: "emp-1",
      jobType: "APPRENTICE",
    });
    mockUseSchoolDays.mockReturnValue({
      schoolDays: [],
      isPending: false,
      isFetching: false,
      error: null,
    });
    mockUseDeclareSchoolDays.mockReturnValue({
      declareSchoolDays: mockDeclareSchoolDays,
      isPending: false,
      error: null,
    });
  });

  it("renders the title and calendar for apprentice employees", () => {
    render(<SchoolDayCalendar />);

    expect(screen.getByText("title")).toBeDefined();
    expect(screen.getByText("subtitle")).toBeDefined();
    expect(screen.getByTestId("calendar")).toBeDefined();
  });

  it("shows not-apprentice message for non-apprentice employees", () => {
    mockUseEmployeeContext.mockReturnValue({
      employeeId: "emp-1",
      jobType: "VET",
    });

    render(<SchoolDayCalendar />);

    expect(screen.getByText("errors.notApprentice")).toBeDefined();
    expect(screen.queryByTestId("calendar")).toBeNull();
  });

  it("shows loading spinner when data is pending", () => {
    mockUseSchoolDays.mockReturnValue({
      schoolDays: [],
      isPending: true,
      isFetching: true,
      error: null,
    });

    const { container } = render(<SchoolDayCalendar />);

    // Loader2 renders as an svg with animate-spin class
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeDefined();
  });

  it("renders submit button that calls declareSchoolDays", async () => {
    render(<SchoolDayCalendar />);

    // Select a date
    fireEvent.click(screen.getByTestId("calendar-select-date"));

    // Submit
    fireEvent.click(screen.getByText("submit"));

    await waitFor(() => {
      expect(mockDeclareSchoolDays).toHaveBeenCalledTimes(1);
      expect(mockDeclareSchoolDays).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: "emp-1",
          dates: expect.any(Array),
        }),
      );
    });
  });

  it("shows success state after submission", async () => {
    render(<SchoolDayCalendar />);

    // Select a date then submit
    fireEvent.click(screen.getByTestId("calendar-select-date"));
    fireEvent.click(screen.getByText("submit"));

    await waitFor(() => {
      expect(screen.getByText(/success\.message/)).toBeDefined();
    });
  });

  it("syncs existing school days from server into selected dates", async () => {
    mockUseSchoolDays.mockReturnValue({
      schoolDays: [
        { startDate: "2026-04-07T00:00:00.000Z" },
        { startDate: "2026-04-14T00:00:00.000Z" },
      ],
      isPending: false,
      isFetching: false,
      error: null,
    });

    render(<SchoolDayCalendar />);

    await waitFor(() => {
      const calendar = screen.getByTestId("calendar");
      expect(calendar.getAttribute("data-selected-count")).toBe("2");
    });
  });

  it("disables submit button while submitting", () => {
    mockUseDeclareSchoolDays.mockReturnValue({
      declareSchoolDays: mockDeclareSchoolDays,
      isPending: true,
      error: null,
    });

    render(<SchoolDayCalendar />);

    const submitButton = screen.getByText("submitting").closest("button");
    expect(submitButton?.disabled).toBe(true);
  });

  it("passes employeeId and month to useSchoolDays hook", () => {
    render(<SchoolDayCalendar />);

    expect(mockUseSchoolDays).toHaveBeenCalledWith(
      "emp-1",
      expect.stringMatching(/^\d{4}-\d{2}$/),
    );
  });
});
