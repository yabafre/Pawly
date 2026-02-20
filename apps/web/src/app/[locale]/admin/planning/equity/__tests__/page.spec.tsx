import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next-intl/server
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockImplementation(() => {
    const t = (key: string) => key;
    t.raw = (key: string) => key;
    t.rich = (key: string) => key;
    t.markup = (key: string) => key;
    t.has = () => true;
    return Promise.resolve(t);
  }),
  setRequestLocale: vi.fn(),
}));

// Mock the EquityCountersClient component (client component mocked in RSC test)
vi.mock("../_components/EquityCountersClient", () => ({
  EquityCountersClient: () => (
    <div data-testid="equity-counters-client">EquityCountersClient Mock</div>
  ),
}));

describe("EquityPage", () => {
  it("renders the page title badge and heading", async () => {
    const { default: EquityPage } = await import("../page");
    const el = await EquityPage({
      params: Promise.resolve({ locale: "en" }),
    });
    render(el);

    // The title appears both in the badge and the h1
    const titles = screen.getAllByText("title");
    expect(titles.length).toBe(2);
  });

  it("renders the subtitle", async () => {
    const { default: EquityPage } = await import("../page");
    const el = await EquityPage({
      params: Promise.resolve({ locale: "en" }),
    });
    render(el);

    expect(screen.getByText("subtitle")).toBeDefined();
  });

  it("renders the EquityCountersClient component", async () => {
    const { default: EquityPage } = await import("../page");
    const el = await EquityPage({
      params: Promise.resolve({ locale: "en" }),
    });
    render(el);

    expect(screen.getByTestId("equity-counters-client")).toBeDefined();
  });

  it("calls setRequestLocale with the locale", async () => {
    const { setRequestLocale } = await import("next-intl/server");
    const { default: EquityPage } = await import("../page");
    await EquityPage({
      params: Promise.resolve({ locale: "fr" }),
    });

    expect(setRequestLocale).toHaveBeenCalledWith("fr");
  });

  it("renders the Scale icon in the badge", async () => {
    const { default: EquityPage } = await import("../page");
    const el = await EquityPage({
      params: Promise.resolve({ locale: "en" }),
    });
    const { container } = render(el);

    // lucide-react Scale icon renders as an SVG
    const svgElements = container.querySelectorAll("svg");
    expect(svgElements.length).toBeGreaterThan(0);
  });
});
