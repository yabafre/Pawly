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

// Mock EmployeeList client component
vi.mock("../_components/EmployeeList", () => ({
  EmployeeList: () => <div data-testid="employee-list">Employee List Mock</div>,
}));

describe("EmployeesPage", () => {
  it("renders the page title and subtitle", async () => {
    const { default: EmployeesPage } = await import("../page");
    const el = await EmployeesPage({ params: Promise.resolve({ locale: "en" }) });
    render(el);

    expect(screen.getByText("page.title")).toBeDefined();
    expect(screen.getByText("page.subtitle")).toBeDefined();
  });

  it("renders the EmployeeList component", async () => {
    const { default: EmployeesPage } = await import("../page");
    const el = await EmployeesPage({ params: Promise.resolve({ locale: "en" }) });
    render(el);

    expect(screen.getByTestId("employee-list")).toBeDefined();
  });

  it("calls setRequestLocale with the locale", async () => {
    const { setRequestLocale } = await import("next-intl/server");
    const { default: EmployeesPage } = await import("../page");
    await EmployeesPage({ params: Promise.resolve({ locale: "fr" }) });

    expect(setRequestLocale).toHaveBeenCalledWith("fr");
  });
});
