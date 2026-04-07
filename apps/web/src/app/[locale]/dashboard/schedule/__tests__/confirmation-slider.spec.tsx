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

  it("renders confirmed text with primary color in confirmed state", () => {
    const { container } = render(
      <ConfirmationSlider isConfirmed={true} isPending={false} onConfirm={vi.fn()} />,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("text-primary");
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

  it("renders muted text in pending state", () => {
    const { container } = render(
      <ConfirmationSlider isConfirmed={false} isPending={true} onConfirm={vi.fn()} />,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("text-muted-foreground");
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

    const button = screen.getByRole("button");
    expect(button.tagName).toBe("BUTTON");
  });

  it("renders slideToConfirm text in idle state", () => {
    render(
      <ConfirmationSlider isConfirmed={false} isPending={false} onConfirm={vi.fn()} />,
    );

    expect(screen.getByText("slideToConfirm")).toBeDefined();
  });

  it("renders as a Button component in idle state", () => {
    render(
      <ConfirmationSlider isConfirmed={false} isPending={false} onConfirm={vi.fn()} />,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDefined();
  });

  it("calls onConfirm when clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmationSlider isConfirmed={false} isPending={false} onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("has aria-label with slideToConfirm text", () => {
    render(
      <ConfirmationSlider isConfirmed={false} isPending={false} onConfirm={vi.fn()} />,
    );

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toBe("slideToConfirm");
  });

  it("renders full-width button", () => {
    render(
      <ConfirmationSlider isConfirmed={false} isPending={false} onConfirm={vi.fn()} />,
    );

    const button = screen.getByRole("button");
    expect(button.className).toContain("w-full");
  });
});
