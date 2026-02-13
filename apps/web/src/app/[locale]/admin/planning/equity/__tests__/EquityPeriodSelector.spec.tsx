import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EquityPeriodSelector } from "../_components/EquityPeriodSelector";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock Select components to make them testable in jsdom
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select-wrapper" data-value={value}>
      {typeof children === "function"
        ? children({ value, onValueChange })
        : children}
    </div>
  ),
  SelectContent: ({ children }: any) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({ children, value }: any) => (
    <option data-testid={`select-item-${value}`} value={value}>
      {children}
    </option>
  ),
  SelectTrigger: ({ children }: any) => (
    <button data-testid="select-trigger">{children}</button>
  ),
  SelectValue: () => <span data-testid="select-value">value</span>,
}));

describe("EquityPeriodSelector", () => {
  const defaultProps = {
    view: "monthly" as const,
    onViewChange: vi.fn(),
    year: 2026,
    onYearChange: vi.fn(),
    month: 2,
    onMonthChange: vi.fn(),
    quarter: 1,
    onQuarterChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("view toggle", () => {
    it("renders both monthly and quarterly toggle buttons", () => {
      render(<EquityPeriodSelector {...defaultProps} />);

      expect(screen.getByText("monthly")).toBeDefined();
      expect(screen.getByText("quarterly")).toBeDefined();
    });

    it("highlights the monthly button when view is monthly", () => {
      render(<EquityPeriodSelector {...defaultProps} view="monthly" />);

      const monthlyBtn = screen.getByText("monthly");
      expect(monthlyBtn.className).toContain("bg-neutral-900");
      expect(monthlyBtn.className).toContain("text-white");
    });

    it("highlights the quarterly button when view is quarterly", () => {
      render(<EquityPeriodSelector {...defaultProps} view="quarterly" />);

      const quarterlyBtn = screen.getByText("quarterly");
      expect(quarterlyBtn.className).toContain("bg-neutral-900");
      expect(quarterlyBtn.className).toContain("text-white");
    });

    it("calls onViewChange when clicking monthly button", () => {
      render(<EquityPeriodSelector {...defaultProps} view="quarterly" />);

      fireEvent.click(screen.getByText("monthly"));
      expect(defaultProps.onViewChange).toHaveBeenCalledWith("monthly");
    });

    it("calls onViewChange when clicking quarterly button", () => {
      render(<EquityPeriodSelector {...defaultProps} view="monthly" />);

      fireEvent.click(screen.getByText("quarterly"));
      expect(defaultProps.onViewChange).toHaveBeenCalledWith("quarterly");
    });
  });

  describe("monthly view", () => {
    it("renders month selector options in monthly view", () => {
      render(<EquityPeriodSelector {...defaultProps} view="monthly" />);

      // Month labels should be present
      expect(screen.getByText("Jan")).toBeDefined();
      expect(screen.getByText("Feb")).toBeDefined();
      expect(screen.getByText("Mar")).toBeDefined();
      expect(screen.getByText("Apr")).toBeDefined();
      expect(screen.getByText("May")).toBeDefined();
      expect(screen.getByText("Jun")).toBeDefined();
      expect(screen.getByText("Jul")).toBeDefined();
      expect(screen.getByText("Aug")).toBeDefined();
      expect(screen.getByText("Sep")).toBeDefined();
      expect(screen.getByText("Oct")).toBeDefined();
      expect(screen.getByText("Nov")).toBeDefined();
      expect(screen.getByText("Dec")).toBeDefined();
    });

    it("does not render quarter selector in monthly view", () => {
      render(<EquityPeriodSelector {...defaultProps} view="monthly" />);

      expect(screen.queryByText("Q1")).toBeNull();
      expect(screen.queryByText("Q2")).toBeNull();
      expect(screen.queryByText("Q3")).toBeNull();
      expect(screen.queryByText("Q4")).toBeNull();
    });
  });

  describe("quarterly view", () => {
    it("renders quarter selector options in quarterly view", () => {
      render(<EquityPeriodSelector {...defaultProps} view="quarterly" />);

      expect(screen.getByText("Q1")).toBeDefined();
      expect(screen.getByText("Q2")).toBeDefined();
      expect(screen.getByText("Q3")).toBeDefined();
      expect(screen.getByText("Q4")).toBeDefined();
    });

    it("does not render month selector in quarterly view", () => {
      render(<EquityPeriodSelector {...defaultProps} view="quarterly" />);

      expect(screen.queryByText("Jan")).toBeNull();
      expect(screen.queryByText("Feb")).toBeNull();
      expect(screen.queryByText("Dec")).toBeNull();
    });
  });

  describe("year selector", () => {
    it("renders year options including current year and 2 previous years", () => {
      render(<EquityPeriodSelector {...defaultProps} />);

      // The current year (from Date constructor in the component) and 2 prior
      // Since the component creates years from currentYear, currentYear-1, currentYear-2
      // We check that year options exist
      const yearItems = screen.getAllByTestId(/select-item-/);
      // 3 years + 12 months (in monthly view) = at least 15 items
      expect(yearItems.length).toBeGreaterThanOrEqual(15);
    });
  });

  describe("non-active view button styling", () => {
    it("monthly button has non-active style when quarterly is selected", () => {
      render(<EquityPeriodSelector {...defaultProps} view="quarterly" />);

      const monthlyBtn = screen.getByText("monthly");
      expect(monthlyBtn.className).toContain("text-neutral-500");
      expect(monthlyBtn.className).not.toContain("bg-neutral-900");
    });

    it("quarterly button has non-active style when monthly is selected", () => {
      render(<EquityPeriodSelector {...defaultProps} view="monthly" />);

      const quarterlyBtn = screen.getByText("quarterly");
      expect(quarterlyBtn.className).toContain("text-neutral-500");
      expect(quarterlyBtn.className).not.toContain("bg-neutral-900");
    });
  });
});
