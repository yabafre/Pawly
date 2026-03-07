import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("lucide-react", () => ({
  Check: (props: any) => <span data-testid="icon-check" {...props} />,
  Loader2: (props: any) => <span data-testid="icon-loader" {...props} />,
  ArrowRight: (props: any) => <span data-testid="icon-arrow-right" {...props} />,
}));

import { ConfirmationSlider } from "../_components/ConfirmationSlider";

describe("ConfirmationSlider", () => {
  // ── Confirmed state ──────────────────────────────────────────────────

  it("renders green confirmed badge when isConfirmed is true", () => {
    const { container } = render(
      <ConfirmationSlider isConfirmed={true} isPending={false} onConfirm={vi.fn()} />,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("bg-emerald-100");
    expect(wrapper.className).toContain("text-emerald-700");
  });

  it("renders check icon and confirmed text in confirmed state", () => {
    render(
      <ConfirmationSlider isConfirmed={true} isPending={false} onConfirm={vi.fn()} />,
    );

    expect(screen.getByTestId("icon-check")).toBeDefined();
    expect(screen.getByText("confirmed")).toBeDefined();
  });

  it("has role=status and aria-live=polite in confirmed state", () => {
    render(
      <ConfirmationSlider isConfirmed={true} isPending={false} onConfirm={vi.fn()} />,
    );

    const status = screen.getByRole("status");
    expect(status).toBeDefined();
    expect(status.getAttribute("aria-live")).toBe("polite");
  });

  it("is non-interactive in confirmed state (no button)", () => {
    render(
      <ConfirmationSlider isConfirmed={true} isPending={false} onConfirm={vi.fn()} />,
    );

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  // ── Pending state ────────────────────────────────────────────────────

  it("renders loader spinner in pending state", () => {
    render(
      <ConfirmationSlider isConfirmed={false} isPending={true} onConfirm={vi.fn()} />,
    );

    expect(screen.getByTestId("icon-loader")).toBeDefined();
    expect(screen.getByText("confirming")).toBeDefined();
  });

  it("has role=status and aria-live=polite in pending state", () => {
    render(
      <ConfirmationSlider isConfirmed={false} isPending={true} onConfirm={vi.fn()} />,
    );

    const el = screen.getByRole("status");
    expect(el).toBeDefined();
    expect(el.getAttribute("aria-live")).toBe("polite");
  });

  it("has pulse animation class in pending state", () => {
    const { container } = render(
      <ConfirmationSlider isConfirmed={false} isPending={true} onConfirm={vi.fn()} />,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("motion-safe:animate-pulse");
  });

  it("is non-interactive in pending state (no button)", () => {
    render(
      <ConfirmationSlider isConfirmed={false} isPending={true} onConfirm={vi.fn()} />,
    );

    expect(screen.queryByRole("button")).toBeNull();
  });

  // ── Idle state ───────────────────────────────────────────────────────

  it("renders actionable button in idle state", () => {
    render(
      <ConfirmationSlider isConfirmed={false} isPending={false} onConfirm={vi.fn()} />,
    );

    const button = screen.getByRole("switch");
    expect(button.tagName).toBe("BUTTON");
  });

  it("renders arrow icon and slideToConfirm text in idle state", () => {
    render(
      <ConfirmationSlider isConfirmed={false} isPending={false} onConfirm={vi.fn()} />,
    );

    expect(screen.getByTestId("icon-arrow-right")).toBeDefined();
    expect(screen.getByText("slideToConfirm")).toBeDefined();
  });

  it("has orange styling in idle state", () => {
    render(
      <ConfirmationSlider isConfirmed={false} isPending={false} onConfirm={vi.fn()} />,
    );

    const button = screen.getByRole("switch");
    expect(button.className).toContain("border-orange-300");
    expect(button.className).toContain("bg-orange-50");
    expect(button.className).toContain("text-orange-700");
  });

  it("calls onConfirm when clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmationSlider isConfirmed={false} isPending={false} onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByRole("switch"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm on Enter keypress", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmationSlider isConfirmed={false} isPending={false} onConfirm={onConfirm} />,
    );

    fireEvent.keyDown(screen.getByRole("switch"), { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm on Space keypress", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmationSlider isConfirmed={false} isPending={false} onConfirm={onConfirm} />,
    );

    fireEvent.keyDown(screen.getByRole("switch"), { key: " " });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("has 48px minimum height (h-12)", () => {
    render(
      <ConfirmationSlider isConfirmed={false} isPending={false} onConfirm={vi.fn()} />,
    );

    const button = screen.getByRole("switch");
    expect(button.className).toContain("h-12");
  });

  it("has focus-visible ring styles for accessibility", () => {
    render(
      <ConfirmationSlider isConfirmed={false} isPending={false} onConfirm={vi.fn()} />,
    );

    const button = screen.getByRole("switch");
    expect(button.className).toContain("focus-visible:ring-2");
    expect(button.className).toContain("focus-visible:ring-orange-400");
  });
});
