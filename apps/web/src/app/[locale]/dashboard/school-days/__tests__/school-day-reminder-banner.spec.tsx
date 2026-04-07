import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SchoolDayReminderBanner } from "../_components/SchoolDayReminderBanner";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      if (params) return `${key}:${JSON.stringify(params)}`;
      return key;
    };
    return t;
  },
}));

describe("SchoolDayReminderBanner", () => {
  it("renders the reminder title", () => {
    render(<SchoolDayReminderBanner month="avril 2026" />);

    expect(screen.getByText("title")).toBeDefined();
  });

  it("displays the month in the message", () => {
    render(<SchoolDayReminderBanner month="avril 2026" />);

    expect(
      screen.getByText(/avril 2026/),
    ).toBeDefined();
  });

  it("renders with card styling", () => {
    const { container } = render(
      <SchoolDayReminderBanner month="avril 2026" />,
    );

    const banner = container.firstElementChild;
    expect(banner?.classList.contains("bg-card")).toBe(true);
    expect(banner?.classList.contains("border")).toBe(true);
  });
});
