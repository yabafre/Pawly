import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next-intl/server
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockImplementation(() => {
    const t = (key: string) => key;
    t.raw = (key: string) => key;
    return Promise.resolve(t);
  }),
  setRequestLocale: vi.fn(),
}));

// Mock the SchoolDayCalendar client component
vi.mock("../_components/SchoolDayCalendar", () => ({
  SchoolDayCalendar: () => (
    <div data-testid="school-day-calendar">SchoolDayCalendar Mock</div>
  ),
}));

describe("SchoolDaysPage", () => {
  it("renders the SchoolDayCalendar component", async () => {
    const { default: SchoolDaysPage } = await import("../page");
    const el = await SchoolDaysPage({
      params: Promise.resolve({ locale: "en" }),
    });
    render(el);

    expect(screen.getByTestId("school-day-calendar")).toBeDefined();
  });

  it("calls setRequestLocale with the locale", async () => {
    const { setRequestLocale } = await import("next-intl/server");
    const { default: SchoolDaysPage } = await import("../page");
    await SchoolDaysPage({
      params: Promise.resolve({ locale: "fr" }),
    });

    expect(setRequestLocale).toHaveBeenCalledWith("fr");
  });
});
