import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EquitySummaryEntry } from "@pawly/validators";
import { EmployeeEquityBadge } from "../_components/EmployeeEquityBadge";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// next-intl is globally mocked in vitest.setup.ts:
//   useTranslations: () => (key: string) => key

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const mockEntryAbove: EquitySummaryEntry = {
  employeeId: "00000000-0000-0000-0000-000000000001",
  counters: [
    { counterType: "SATURDAY_WORKED", count: 3, clinicAverage: 1.5, maxPerPeriod: 2 },
    { counterType: "OVERTIME_HOURS", count: 120, clinicAverage: 60, maxPerPeriod: null },
  ],
};

const mockEntryBelow: EquitySummaryEntry = {
  employeeId: "00000000-0000-0000-0000-000000000002",
  counters: [
    { counterType: "SATURDAY_WORKED", count: 1, clinicAverage: 3, maxPerPeriod: 5 },
    { counterType: "OVERTIME_HOURS", count: 20, clinicAverage: 60, maxPerPeriod: null },
  ],
};

const mockEntryAverage: EquitySummaryEntry = {
  employeeId: "00000000-0000-0000-0000-000000000003",
  counters: [
    { counterType: "SATURDAY_WORKED", count: 2, clinicAverage: 2, maxPerPeriod: 4 },
    { counterType: "OVERTIME_HOURS", count: 60, clinicAverage: 60, maxPerPeriod: null },
  ],
};

const mockEntryEmpty: EquitySummaryEntry = {
  employeeId: "00000000-0000-0000-0000-000000000004",
  counters: [],
};

// ===========================================================================
// EmployeeEquityBadge
// ===========================================================================

describe("EmployeeEquityBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render nothing when counters array is empty", () => {
    const { container } = render(<EmployeeEquityBadge entry={mockEntryEmpty} />);
    expect(container.firstChild).toBeNull();
  });

  it("should render trend-up icon with orange color when any counter is above average", () => {
    const { container } = render(<EmployeeEquityBadge entry={mockEntryAbove} />);

    // The button should have the orange text color class
    const button = screen.getByRole("button");
    expect(button).toHaveClass("text-orange-500");

    // lucide-react TrendingUp renders an svg - verify it's present inside the button
    const svg = button.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("should render trend-down icon with teal color when all counters are below average", () => {
    const { container } = render(<EmployeeEquityBadge entry={mockEntryBelow} />);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("text-teal-500");

    const svg = button.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("should render minus icon with neutral color when counters are at average", () => {
    const { container } = render(<EmployeeEquityBadge entry={mockEntryAverage} />);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("text-muted-foreground");

    const svg = button.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("should show popover on click with counter breakdown", () => {
    render(<EmployeeEquityBadge entry={mockEntryAbove} />);

    // Before click, popover content should not be visible
    expect(screen.queryByText("popoverTitle")).not.toBeInTheDocument();

    // Click the trigger button
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // After click, popover should show title and hint
    expect(screen.getByText("popoverTitle")).toBeInTheDocument();
    expect(screen.getByText("popoverHint")).toBeInTheDocument();
  });

  it("should close popover on Escape key via Radix", () => {
    render(<EmployeeEquityBadge entry={mockEntryAbove} />);

    // Show the popover via click
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(screen.getByText("popoverTitle")).toBeInTheDocument();

    // Radix Popover handles Escape automatically on the content
    const popoverContent = screen.getByText("popoverTitle").closest("[data-radix-popper-content-wrapper]")
      ?? screen.getByText("popoverTitle").parentElement!;
    fireEvent.keyDown(popoverContent, { key: "Escape" });
    expect(screen.queryByText("popoverTitle")).not.toBeInTheDocument();
  });

  it("should have aria-label on trigger button", () => {
    render(<EmployeeEquityBadge entry={mockEntryAbove} />);

    // The component uses t("badgeLabel") as aria-label, which returns "badgeLabel" from global mock
    const button = screen.getByLabelText("badgeLabel");
    expect(button).toBeInTheDocument();
  });

  it("should display count and displayMax for each counter in popover", () => {
    render(<EmployeeEquityBadge entry={mockEntryAbove} />);

    // Open the popover
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Each counter shows "count / displayMax" where displayMax = maxPerPeriod ?? clinicAverage
    // SATURDAY_WORKED: count=3, maxPerPeriod=2, so displayMax=2 -> "3 / 2"
    expect(screen.getByText("3 / 2")).toBeInTheDocument();
    // OVERTIME_HOURS: count=120, maxPerPeriod=null, clinicAverage=60, so displayMax=60 -> "120 / 60"
    expect(screen.getByText("120 / 60")).toBeInTheDocument();

    // Counter type labels: t(`counterType.${c.counterType}`) -> "counterType.SATURDAY_WORKED"
    expect(screen.getByText("counterType.SATURDAY_WORKED")).toBeInTheDocument();
    expect(screen.getByText("counterType.OVERTIME_HOURS")).toBeInTheDocument();
  });

  it("should show counter above threshold with bold orange styling", () => {
    render(<EmployeeEquityBadge entry={mockEntryAbove} />);

    // Open the popover
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // SATURDAY_WORKED: count=3 > displayMax=2 (maxPerPeriod=2) -> bold orange
    const aboveAvgSpan = screen.getByText("3 / 2");
    expect(aboveAvgSpan).toHaveClass("font-bold");
    expect(aboveAvgSpan).toHaveClass("text-orange-600");
  });

  it("should show counter at or below threshold with neutral styling", () => {
    render(<EmployeeEquityBadge entry={mockEntryAverage} />);

    // Open the popover
    const button = screen.getByRole("button");
    fireEvent.click(button);

    // SATURDAY_WORKED: count=2, maxPerPeriod=4, displayMax=4 -> "2 / 4" (2 <= 4, neutral)
    const atAvgSpan = screen.getByText("2 / 4");
    expect(atAvgSpan).toHaveClass("text-muted-foreground");
    expect(atAvgSpan).not.toHaveClass("font-bold");
  });
});
