import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn().mockResolvedValue(
    Object.assign((key: string) => key, { raw: (key: string) => key }),
  ),
}));

vi.mock("../_components/VariancePageClient", () => ({
  VariancePageClient: () => <div data-testid="variance-page-client">Client</div>,
}));

import VariancePage from "../page";

describe("VariancePage (RSC)", () => {
  it("renders VariancePageClient", async () => {
    const el = await VariancePage({
      params: Promise.resolve({ locale: "en" }),
    });
    render(el);

    expect(screen.getByTestId("variance-page-client")).toBeInTheDocument();
  });
});
