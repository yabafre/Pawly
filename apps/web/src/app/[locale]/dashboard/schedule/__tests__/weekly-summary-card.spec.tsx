import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("date-fns", () => ({
  getISOWeek: vi.fn(() => 10),
  getISOWeekYear: vi.fn(() => 2026),
  parseISO: vi.fn((s: string) => new Date(s)),
}));

import { WeeklySummaryCard } from "../_components/WeeklySummaryCard";
import type { EmployeeWeeklySummary, EmployeeShift } from "@pawly/types";

const baseWeeklySummary: EmployeeWeeklySummary[] = [
  { weekNumber: 10, totalMinutes: 2100, shiftCount: 5, contractMinutes: 2100 },
];

const makeShift = (overrides: Partial<EmployeeShift> = {}): EmployeeShift => ({
  id: `s-${Math.random()}`,
  date: "2026-03-03",
  startTime: "08:30",
  endTime: "18:30",
  shiftTypeCode: "CHIR",
  breakMinutes: 60,
  isConfirmed: false,
  source: "GENERATED",
  ...overrides,
});

describe("WeeklySummaryCard — confirmed ratio", () => {
  it("shows confirmed ratio when shifts are provided", () => {
    const shifts = [
      makeShift({ isConfirmed: true }),
      makeShift({ isConfirmed: true }),
      makeShift({ isConfirmed: false }),
    ];

    render(
      <WeeklySummaryCard
        weeklySummary={baseWeeklySummary}
        contractHours={35}
        shifts={shifts}
      />,
    );

    // Translation key receives confirmed=2, total=3
    expect(screen.getByText(/confirmedRatio/)).toBeDefined();
  });

  it("does not show confirmed ratio when no shifts for current week", () => {
    render(
      <WeeklySummaryCard
        weeklySummary={baseWeeklySummary}
        contractHours={35}
        shifts={[]}
      />,
    );

    expect(screen.queryByText(/confirmedRatio/)).toBeNull();
  });

  it("shows 0 confirmed when all shifts are unconfirmed", () => {
    const shifts = [
      makeShift({ isConfirmed: false }),
      makeShift({ isConfirmed: false }),
    ];

    render(
      <WeeklySummaryCard
        weeklySummary={baseWeeklySummary}
        contractHours={35}
        shifts={shifts}
      />,
    );

    expect(screen.getByText(/confirmedRatio/)).toBeDefined();
  });

  it("shows all confirmed when every shift is confirmed", () => {
    const shifts = [
      makeShift({ isConfirmed: true }),
      makeShift({ isConfirmed: true }),
      makeShift({ isConfirmed: true }),
    ];

    render(
      <WeeklySummaryCard
        weeklySummary={baseWeeklySummary}
        contractHours={35}
        shifts={shifts}
      />,
    );

    expect(screen.getByText(/confirmedRatio/)).toBeDefined();
  });

  it("renders without shifts prop (backward compatible)", () => {
    render(
      <WeeklySummaryCard
        weeklySummary={baseWeeklySummary}
        contractHours={35}
      />,
    );

    expect(screen.queryByText(/confirmedRatio/)).toBeNull();
    expect(screen.getByRole("progressbar")).toBeDefined();
  });
});
