import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EquityCountersTable } from "../_components/EquityCountersTable";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Helper to create mock equity counters
function makeCounter(overrides: {
  id?: string;
  counterType: string;
  count: number;
  employeeId: string;
  firstName: string;
  lastName: string;
  jobType?: string;
  year?: number;
  month?: number;
}) {
  return {
    id: overrides.id ?? `counter-${Math.random()}`,
    counterType: overrides.counterType,
    count: overrides.count,
    year: overrides.year ?? 2026,
    month: overrides.month ?? 2,
    employeeId: overrides.employeeId,
    employee: {
      id: overrides.employeeId,
      firstName: overrides.firstName,
      lastName: overrides.lastName,
      jobType: overrides.jobType ?? "VET",
    },
  };
}

describe("EquityCountersTable", () => {
  const defaultThresholds = [
    { counterType: "SATURDAY_WORKED", max: 4 },
    { counterType: "WEEKEND_TOTAL", max: 6 },
  ];

  describe("loading state", () => {
    it("renders skeleton loaders when isPending is true", () => {
      const { container } = render(
        <EquityCountersTable counters={[]} isPending={true} thresholds={[]} />,
      );

      const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBe(4);
    });

    it("does not render table when loading", () => {
      render(<EquityCountersTable counters={[]} isPending={true} thresholds={[]} />);

      expect(screen.queryByRole("table")).toBeNull();
    });
  });

  describe("empty state", () => {
    it("renders no-data message when counters array is empty", () => {
      render(<EquityCountersTable counters={[]} isPending={false} thresholds={[]} />);

      expect(screen.getByText("table.noData")).toBeDefined();
      expect(screen.getByText("table.noDataDescription")).toBeDefined();
    });

    it("does not render a table element when empty", () => {
      render(<EquityCountersTable counters={[]} isPending={false} thresholds={[]} />);

      expect(screen.queryByRole("table")).toBeNull();
    });
  });

  describe("with counter data", () => {
    const sampleCounters = [
      makeCounter({
        id: "c1",
        counterType: "SATURDAY_WORKED",
        count: 3,
        employeeId: "emp-1",
        firstName: "Alice",
        lastName: "Martin",
        jobType: "VET",
      }),
      makeCounter({
        id: "c2",
        counterType: "WEEKEND_TOTAL",
        count: 5,
        employeeId: "emp-1",
        firstName: "Alice",
        lastName: "Martin",
        jobType: "VET",
      }),
      makeCounter({
        id: "c3",
        counterType: "HOLIDAY_WORKED",
        count: 1,
        employeeId: "emp-1",
        firstName: "Alice",
        lastName: "Martin",
        jobType: "VET",
      }),
      makeCounter({
        id: "c4",
        counterType: "OVERTIME_HOURS",
        count: 0,
        employeeId: "emp-1",
        firstName: "Alice",
        lastName: "Martin",
        jobType: "VET",
      }),
      makeCounter({
        id: "c5",
        counterType: "SATURDAY_WORKED",
        count: 2,
        employeeId: "emp-2",
        firstName: "Bob",
        lastName: "Dupont",
        jobType: "ASV",
      }),
      makeCounter({
        id: "c6",
        counterType: "WEEKEND_TOTAL",
        count: 4,
        employeeId: "emp-2",
        firstName: "Bob",
        lastName: "Dupont",
        jobType: "ASV",
      }),
    ];

    it("renders a table element", () => {
      render(
        <EquityCountersTable counters={sampleCounters} isPending={false} thresholds={defaultThresholds} />,
      );

      expect(screen.getByRole("table")).toBeDefined();
    });

    it("renders table headers for employee, job type, and counter types", () => {
      render(
        <EquityCountersTable counters={sampleCounters} isPending={false} thresholds={defaultThresholds} />,
      );

      expect(screen.getByText("table.employee")).toBeDefined();
      expect(screen.getByText("table.jobType")).toBeDefined();
      expect(screen.getByText("counterTypes.SATURDAY_WORKED")).toBeDefined();
      expect(screen.getByText("counterTypes.WEEKEND_TOTAL")).toBeDefined();
      expect(screen.getByText("counterTypes.HOLIDAY_WORKED")).toBeDefined();
      expect(screen.getByText("counterTypes.OVERTIME_HOURS")).toBeDefined();
    });

    it("aggregates counters by employee and displays employee names", () => {
      render(
        <EquityCountersTable counters={sampleCounters} isPending={false} thresholds={defaultThresholds} />,
      );

      expect(screen.getByText("Alice Martin")).toBeDefined();
      expect(screen.getByText("Bob Dupont")).toBeDefined();
    });

    it("displays current/max format when thresholds are set", () => {
      render(
        <EquityCountersTable counters={sampleCounters} isPending={false} thresholds={defaultThresholds} />,
      );

      // Alice: SATURDAY_WORKED=3, threshold max=4 → "3/4"
      expect(screen.getByText("3/4")).toBeDefined();
      // Alice: WEEKEND_TOTAL=5, threshold max=6 → "5/6"
      expect(screen.getByText("5/6")).toBeDefined();
      // Bob: SATURDAY_WORKED=2, threshold max=4 → "2/4"
      expect(screen.getByText("2/4")).toBeDefined();
      // Bob: WEEKEND_TOTAL=4, threshold max=6 → "4/6"
      expect(screen.getByText("4/6")).toBeDefined();
    });

    it("displays raw value without thresholds", () => {
      render(
        <EquityCountersTable counters={sampleCounters} isPending={false} thresholds={[]} />,
      );

      // Without thresholds, displays raw values
      expect(screen.getByText("3")).toBeDefined();
      expect(screen.getByText("5")).toBeDefined();
    });

    it("formats OVERTIME_HOURS as hours", () => {
      const overtimeCounters = [
        makeCounter({
          id: "c1",
          counterType: "OVERTIME_HOURS",
          count: 150, // 150 minutes = 2.5h
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
        }),
      ];

      render(
        <EquityCountersTable counters={overtimeCounters} isPending={false} thresholds={[]} />,
      );

      expect(screen.getByText("2.5h")).toBeDefined();
    });

    it("sorts employees alphabetically by name", () => {
      render(
        <EquityCountersTable counters={sampleCounters} isPending={false} thresholds={defaultThresholds} />,
      );

      const rows = screen.getAllByRole("row");
      // First row is header, then Alice (A), then Bob (B)
      expect(rows[1].textContent).toContain("Alice Martin");
      expect(rows[2].textContent).toContain("Bob Dupont");
    });

    it("displays job type badges", () => {
      render(
        <EquityCountersTable counters={sampleCounters} isPending={false} thresholds={defaultThresholds} />,
      );

      expect(screen.getByText("VET")).toBeDefined();
      expect(screen.getByText("ASV")).toBeDefined();
    });

    it("applies green color for values under 75% threshold", () => {
      render(
        <EquityCountersTable counters={sampleCounters} isPending={false} thresholds={defaultThresholds} />,
      );

      // Bob: SATURDAY_WORKED=2 / max=4 = 50% → green
      const badge = screen.getByText("2/4");
      expect(badge.className).toContain("bg-emerald-50");
      expect(badge.className).toContain("text-emerald-700");
    });

    it("applies amber color for values between 75% and 100% threshold", () => {
      render(
        <EquityCountersTable counters={sampleCounters} isPending={false} thresholds={defaultThresholds} />,
      );

      // Alice: SATURDAY_WORKED=3 / max=4 = 75% → amber
      const badge = screen.getByText("3/4");
      expect(badge.className).toContain("bg-amber-50");
      expect(badge.className).toContain("text-amber-700");
    });

    it("applies rose color for values at or above 100% threshold", () => {
      const overThresholdCounters = [
        makeCounter({
          id: "c1",
          counterType: "SATURDAY_WORKED",
          count: 5,
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
        }),
      ];

      render(
        <EquityCountersTable
          counters={overThresholdCounters}
          isPending={false}
          thresholds={[{ counterType: "SATURDAY_WORKED", max: 4 }]}
        />,
      );

      const badge = screen.getByText("5/4");
      expect(badge.className).toContain("bg-rose-50");
      expect(badge.className).toContain("text-rose-700");
    });

    it("applies neutral styles for zero counter values", () => {
      render(
        <EquityCountersTable counters={sampleCounters} isPending={false} thresholds={defaultThresholds} />,
      );

      // Find the zero values - they should have neutral color classes
      const zeros = screen.getAllByText("0");
      for (const zero of zeros) {
        expect(zero.className).toContain("bg-neutral-50");
        expect(zero.className).toContain("text-neutral-300");
      }
    });

    it("aggregates multiple months for same employee and counter type", () => {
      const multiMonthCounters = [
        makeCounter({
          id: "c1",
          counterType: "SATURDAY_WORKED",
          count: 2,
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
          month: 1,
        }),
        makeCounter({
          id: "c2",
          counterType: "SATURDAY_WORKED",
          count: 3,
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
          month: 2,
        }),
      ];

      render(
        <EquityCountersTable
          counters={multiMonthCounters}
          isPending={false}
          thresholds={[]}
        />,
      );

      // Should aggregate to 5
      expect(screen.getByText("5")).toBeDefined();
    });
  });
});
