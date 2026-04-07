import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EquitySummaryCards } from "../_components/EquitySummaryCards";

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
}) {
  return {
    id: overrides.id ?? `counter-${Math.random()}`,
    counterType: overrides.counterType,
    count: overrides.count,
    employeeId: overrides.employeeId,
    employee: {
      id: overrides.employeeId,
      firstName: overrides.firstName,
      lastName: overrides.lastName,
      jobType: overrides.jobType ?? "VET",
    },
  };
}

describe("EquitySummaryCards", () => {
  describe("loading state", () => {
    it("renders 4 skeleton cards when isPending is true", () => {
      const { container } = render(
        <EquitySummaryCards counters={[]} isPending={true} />,
      );

      const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBe(4);
    });

    it("does not render card labels when loading", () => {
      render(<EquitySummaryCards counters={[]} isPending={true} />);

      expect(screen.queryByText("avgSaturdays")).toBeNull();
      expect(screen.queryByText("fairnessIndex")).toBeNull();
    });
  });

  describe("empty counters", () => {
    it("renders 0 average when no counters", () => {
      render(<EquitySummaryCards counters={[]} isPending={false} />);

      expect(screen.getByText("avgSaturdays")).toBeDefined();
      expect(screen.getByText("0")).toBeDefined();
    });

    it("renders 0% fairness when no counters (max is 0)", () => {
      render(<EquitySummaryCards counters={[]} isPending={false} />);

      expect(screen.getByText("fairnessIndex")).toBeDefined();
      // When max === 0, fairnessIndex = 100, fairnessScore = 100 - 100 = 0
      expect(screen.getByText("0%")).toBeDefined();
    });

    it("renders noEmployees for most and least loaded", () => {
      render(<EquitySummaryCards counters={[]} isPending={false} />);

      expect(screen.getByText("mostLoaded")).toBeDefined();
      expect(screen.getByText("leastLoaded")).toBeDefined();
      // Both should show "noEmployees" (the translation key)
      const noEmpTexts = screen.getAllByText("noEmployees");
      expect(noEmpTexts.length).toBe(2);
    });
  });

  describe("average calculation", () => {
    it("computes correct average saturdays across employees", () => {
      const counters = [
        makeCounter({
          id: "c1",
          counterType: "SATURDAY_WORKED",
          count: 4,
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
        }),
        makeCounter({
          id: "c2",
          counterType: "SATURDAY_WORKED",
          count: 2,
          employeeId: "emp-2",
          firstName: "Bob",
          lastName: "Dupont",
        }),
      ];

      render(<EquitySummaryCards counters={counters} isPending={false} />);

      // Average: (4 + 2) / 2 = 3.0
      expect(screen.getByText("3.0")).toBeDefined();
    });

    it("aggregates multiple SATURDAY_WORKED entries for same employee", () => {
      const counters = [
        makeCounter({
          id: "c1",
          counterType: "SATURDAY_WORKED",
          count: 2,
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
        }),
        makeCounter({
          id: "c2",
          counterType: "SATURDAY_WORKED",
          count: 3,
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
        }),
      ];

      render(<EquitySummaryCards counters={counters} isPending={false} />);

      // Single employee with total 5, average = 5.0
      expect(screen.getByText("5.0")).toBeDefined();
    });

    it("ignores non-SATURDAY_WORKED counter types in average", () => {
      const counters = [
        makeCounter({
          id: "c1",
          counterType: "SATURDAY_WORKED",
          count: 4,
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
        }),
        makeCounter({
          id: "c2",
          counterType: "WEEKEND_TOTAL",
          count: 10,
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
        }),
        makeCounter({
          id: "c3",
          counterType: "HOLIDAY_WORKED",
          count: 8,
          employeeId: "emp-2",
          firstName: "Bob",
          lastName: "Dupont",
        }),
      ];

      render(<EquitySummaryCards counters={counters} isPending={false} />);

      // Only Alice has SATURDAY_WORKED, avg = 4.0 / 1 = 4.0
      expect(screen.getByText("4.0")).toBeDefined();
    });
  });

  describe("fairness index", () => {
    it("shows 100% fairness when all employees have equal saturdays", () => {
      const counters = [
        makeCounter({
          id: "c1",
          counterType: "SATURDAY_WORKED",
          count: 3,
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
        }),
        makeCounter({
          id: "c2",
          counterType: "SATURDAY_WORKED",
          count: 3,
          employeeId: "emp-2",
          firstName: "Bob",
          lastName: "Dupont",
        }),
      ];

      render(<EquitySummaryCards counters={counters} isPending={false} />);

      // max=3, min=3, fairnessIndex = ((3-3)/3)*100 = 0, score = 100
      expect(screen.getByText("100%")).toBeDefined();
    });

    it("computes correct fairness score for unequal distribution", () => {
      const counters = [
        makeCounter({
          id: "c1",
          counterType: "SATURDAY_WORKED",
          count: 10,
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
        }),
        makeCounter({
          id: "c2",
          counterType: "SATURDAY_WORKED",
          count: 5,
          employeeId: "emp-2",
          firstName: "Bob",
          lastName: "Dupont",
        }),
      ];

      render(<EquitySummaryCards counters={counters} isPending={false} />);

      // max=10, min=5, fairnessIndex = ((10-5)/10)*100 = 50, score = 50
      expect(screen.getByText("50%")).toBeDefined();
    });

    it("renders fairness score with foreground styling when fairness >= 80%", () => {
      const counters = [
        makeCounter({
          id: "c1",
          counterType: "SATURDAY_WORKED",
          count: 10,
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
        }),
        makeCounter({
          id: "c2",
          counterType: "SATURDAY_WORKED",
          count: 9,
          employeeId: "emp-2",
          firstName: "Bob",
          lastName: "Dupont",
        }),
      ];

      render(<EquitySummaryCards counters={counters} isPending={false} />);

      // max=10, min=9, score = 100 - round(((10-9)/10)*100) = 100 - 10 = 90
      const scoreElement = screen.getByText("90%");
      expect(scoreElement.className).toContain("text-foreground");
    });

    it("renders fairness score with foreground styling when fairness < 50%", () => {
      const counters = [
        makeCounter({
          id: "c1",
          counterType: "SATURDAY_WORKED",
          count: 10,
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
        }),
        makeCounter({
          id: "c2",
          counterType: "SATURDAY_WORKED",
          count: 1,
          employeeId: "emp-2",
          firstName: "Bob",
          lastName: "Dupont",
        }),
      ];

      render(<EquitySummaryCards counters={counters} isPending={false} />);

      // max=10, min=1, score = 100 - round(((10-1)/10)*100) = 100 - 90 = 10
      const scoreElement = screen.getByText("10%");
      expect(scoreElement.className).toContain("text-foreground");
    });
  });

  describe("most / least loaded employee", () => {
    it("identifies the most loaded employee", () => {
      const counters = [
        makeCounter({
          id: "c1",
          counterType: "SATURDAY_WORKED",
          count: 6,
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
        }),
        makeCounter({
          id: "c2",
          counterType: "SATURDAY_WORKED",
          count: 2,
          employeeId: "emp-2",
          firstName: "Bob",
          lastName: "Dupont",
        }),
      ];

      render(<EquitySummaryCards counters={counters} isPending={false} />);

      // Most loaded: Alice Martin (6 saturdays)
      expect(screen.getByText("Alice Martin")).toBeDefined();
    });

    it("identifies the least loaded employee", () => {
      const counters = [
        makeCounter({
          id: "c1",
          counterType: "SATURDAY_WORKED",
          count: 6,
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
        }),
        makeCounter({
          id: "c2",
          counterType: "SATURDAY_WORKED",
          count: 2,
          employeeId: "emp-2",
          firstName: "Bob",
          lastName: "Dupont",
        }),
      ];

      render(<EquitySummaryCards counters={counters} isPending={false} />);

      // Least loaded: Bob Dupont (2 saturdays)
      expect(screen.getByText("Bob Dupont")).toBeDefined();
    });

    it("shows same employee for both when only one employee exists", () => {
      const counters = [
        makeCounter({
          id: "c1",
          counterType: "SATURDAY_WORKED",
          count: 3,
          employeeId: "emp-1",
          firstName: "Alice",
          lastName: "Martin",
        }),
      ];

      render(<EquitySummaryCards counters={counters} isPending={false} />);

      // Same person for both most and least loaded
      const aliceTexts = screen.getAllByText("Alice Martin");
      expect(aliceTexts.length).toBe(2);
    });
  });

  describe("card labels", () => {
    it("renders all four card labels", () => {
      render(<EquitySummaryCards counters={[]} isPending={false} />);

      expect(screen.getByText("avgSaturdays")).toBeDefined();
      expect(screen.getByText("fairnessIndex")).toBeDefined();
      expect(screen.getByText("mostLoaded")).toBeDefined();
      expect(screen.getByText("leastLoaded")).toBeDefined();
    });
  });
});
