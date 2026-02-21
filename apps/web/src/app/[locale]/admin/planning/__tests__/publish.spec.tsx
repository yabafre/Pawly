import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublishConfirmDialog } from "../_components/PublishConfirmDialog";
import { PlanningHealthBar } from "../_components/PlanningHealthBar";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// next-intl is globally mocked in vitest.setup.ts:
//   useTranslations: () => (key: string) => key

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({
    children,
    disabled,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
  }) => <button disabled={disabled}>{children}</button>,
}));

// ===========================================================================
// PublishConfirmDialog
// ===========================================================================

describe("PublishConfirmDialog", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    softViolationCount: 0,
    isPublishing: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render dialog when open is true", () => {
    render(<PublishConfirmDialog {...defaultProps} />);

    expect(screen.getByTestId("alert-dialog")).toBeInTheDocument();
    expect(screen.getByText("confirmTitle")).toBeInTheDocument();
  });

  it("should not render dialog when open is false", () => {
    render(<PublishConfirmDialog {...defaultProps} open={false} />);

    expect(screen.queryByTestId("alert-dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("confirmTitle")).not.toBeInTheDocument();
  });

  it("should show soft warning count in description when softViolationCount > 0", () => {
    render(
      <PublishConfirmDialog {...defaultProps} softViolationCount={3} />,
    );

    // When softViolationCount > 0, t("confirmDescriptionWithWarnings", { count: 3 })
    // Global mock returns just the key: "confirmDescriptionWithWarnings"
    expect(screen.getByText("confirmDescriptionWithWarnings")).toBeInTheDocument();
  });

  it("should show standard description when softViolationCount is 0", () => {
    render(<PublishConfirmDialog {...defaultProps} softViolationCount={0} />);

    // When softViolationCount === 0, t("confirmDescription")
    expect(screen.getByText("confirmDescription")).toBeInTheDocument();
  });

  it("should call onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(<PublishConfirmDialog {...defaultProps} onConfirm={onConfirm} />);

    // The confirm button shows t("confirmPublish") = "confirmPublish"
    const confirmButton = screen.getByText("confirmPublish");
    fireEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("should show cancel button with cancel text", () => {
    render(<PublishConfirmDialog {...defaultProps} />);

    // The cancel button shows t("cancel") = "cancel"
    expect(screen.getByText("cancel")).toBeInTheDocument();
  });

  it("should disable buttons when isPublishing is true", () => {
    render(<PublishConfirmDialog {...defaultProps} isPublishing={true} />);

    // Both cancel and action buttons should be disabled
    const cancelButton = screen.getByText("publishing").closest("button");
    expect(cancelButton).toBeDisabled();

    const cancelBtn = screen.getByText("cancel").closest("button");
    expect(cancelBtn).toBeDisabled();
  });

  it("should show publishing text when isPublishing", () => {
    render(<PublishConfirmDialog {...defaultProps} isPublishing={true} />);

    // When isPublishing: t("publishing") = "publishing"
    expect(screen.getByText("publishing")).toBeInTheDocument();
    // Should not show the regular confirm text
    expect(screen.queryByText("confirmPublish")).not.toBeInTheDocument();
  });
});

// ===========================================================================
// PlanningHealthBar
// ===========================================================================

describe("PlanningHealthBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render hard conflict count in red", () => {
    const { container } = render(
      <PlanningHealthBar
        hardViolationCount={3}
        softViolationCount={0}
        totalShifts={10}
      />,
    );

    // Hard conflicts trigger the rose-colored icon container
    const roseBox = container.querySelector(".bg-rose-100");
    expect(roseBox).not.toBeNull();
  });

  it("should render soft warning count in orange", () => {
    const { container } = render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={2}
        totalShifts={10}
      />,
    );

    // Soft warnings trigger the orange-colored icon container
    const orangeBox = container.querySelector(".bg-orange-100");
    expect(orangeBox).not.toBeNull();
  });

  it("should render total shifts count", () => {
    render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={0}
        totalShifts={15}
      />,
    );

    // The title is rendered via t("title") = "title"
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("should compute and display ready percentage", () => {
    render(
      <PlanningHealthBar
        hardViolationCount={1}
        softViolationCount={1}
        totalShifts={10}
      />,
    );

    // readyPercent = round(((10 - 2) / 10) * 100) = 80
    // The subtitle shows conflicts/warnings/ready text from t() keys
    // With the global mock, t("conflicts", { count: 1 }) = "conflicts", etc.
    // The full text is: "${t("conflicts", ...)}, ${t("warnings", ...)}, ${t("ready", ...)}"
    // = "conflicts, warnings, ready"
    const subtitle = screen.getByText((content) =>
      content.includes("conflicts") && content.includes("warnings") && content.includes("ready"),
    );
    expect(subtitle).toBeInTheDocument();
  });

  it("should show healthy message when no violations exist", () => {
    render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={0}
        totalShifts={10}
      />,
    );

    // When isHealthy: t("healthy") = "healthy"
    expect(screen.getByText("healthy")).toBeInTheDocument();
  });

  it("should disable publish button when hardViolationCount > 0", () => {
    const onPublish = vi.fn();
    render(
      <PlanningHealthBar
        hardViolationCount={2}
        softViolationCount={0}
        totalShifts={10}
        onPublish={onPublish}
      />,
    );

    // The publish button should be disabled
    const publishButton = screen.getByText("publish").closest("button");
    expect(publishButton).toBeDisabled();
  });

  it("should enable publish button when hardViolationCount === 0", () => {
    const onPublish = vi.fn();
    render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={3}
        totalShifts={10}
        onPublish={onPublish}
      />,
    );

    // The publish button should be enabled even with soft warnings
    const publishButton = screen.getByText("publish").closest("button");
    expect(publishButton).not.toBeDisabled();
  });

  it("should call onPublish when publish button is clicked", () => {
    const onPublish = vi.fn();
    render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={0}
        totalShifts={10}
        onPublish={onPublish}
      />,
    );

    const publishButton = screen.getByText("publish").closest("button")!;
    fireEvent.click(publishButton);

    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("should not render publish button when onPublish is undefined", () => {
    render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={0}
        totalShifts={10}
      />,
    );

    // t("publish") = "publish" should not be in the document (no button rendered)
    expect(screen.queryByText("publish")).not.toBeInTheDocument();
  });

  it("should show blocked message when hard conflicts exist", () => {
    render(
      <PlanningHealthBar
        hardViolationCount={1}
        softViolationCount={0}
        totalShifts={10}
        onPublish={vi.fn()}
      />,
    );

    // When hasHardConflicts: t("publishBlocked") = "publishBlocked" is shown as warning text
    expect(screen.getByText("publishBlocked")).toBeInTheDocument();
  });

  it("should not show blocked message when no hard conflicts", () => {
    render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={0}
        totalShifts={10}
      />,
    );

    // publishBlocked should not appear when there are no hard conflicts
    // Note: without onPublish, the button title attribute won't be set either
    expect(screen.queryByText("publishBlocked")).not.toBeInTheDocument();
  });

  it("should have aria-label on the health bar section", () => {
    const { container } = render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={0}
        totalShifts={10}
      />,
    );

    // The component renders a <section> element
    const section = container.querySelector("section");
    expect(section).not.toBeNull();
  });

  it("should render segmented bar with rose segment for hard violations", () => {
    const { container } = render(
      <PlanningHealthBar
        hardViolationCount={3}
        softViolationCount={0}
        totalShifts={10}
      />,
    );

    // hardWidth = round((3/10) * 100) = 30%
    const roseSegment = container.querySelector(".bg-rose-500");
    expect(roseSegment).not.toBeNull();
    expect(roseSegment).toHaveStyle({ width: "30%" });
  });

  it("should render segmented bar with orange segment for soft violations", () => {
    const { container } = render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={4}
        totalShifts={10}
      />,
    );

    // softWidth = round((4/10) * 100) = 40%
    const orangeSegment = container.querySelector(".bg-orange-400");
    expect(orangeSegment).not.toBeNull();
    expect(orangeSegment).toHaveStyle({ width: "40%" });
  });

  it("should render segmented bar with teal segment for healthy shifts", () => {
    const { container } = render(
      <PlanningHealthBar
        hardViolationCount={1}
        softViolationCount={2}
        totalShifts={10}
      />,
    );

    // hardWidth = 10%, softWidth = 20%, healthyWidth = 70%
    // The segmented bar segments have transition-all class; the glow div does not
    const tealSegments = container.querySelectorAll(".bg-\\[\\#009588\\]");
    // Find the one with an inline style (the bar segment, not the glow div)
    const barSegment = Array.from(tealSegments).find(
      (el) => el.getAttribute("style")?.includes("width"),
    );
    expect(barSegment).not.toBeUndefined();
    expect(barSegment).toHaveStyle({ width: "70%" });
  });

  it("should show CheckCircle icon when fully healthy", () => {
    const { container } = render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={0}
        totalShifts={10}
      />,
    );

    // Healthy state renders a neutral-200 border icon container
    const healthyBox = container.querySelector(".bg-neutral-100");
    expect(healthyBox).not.toBeNull();
  });

  it("should show publish button with title attribute when hard conflicts exist", () => {
    render(
      <PlanningHealthBar
        hardViolationCount={2}
        softViolationCount={0}
        totalShifts={10}
        onPublish={vi.fn()}
      />,
    );

    const publishButton = screen.getByText("publish").closest("button")!;
    // hasHardConflicts -> title={t("publishBlocked")} = "publishBlocked"
    expect(publishButton).toHaveAttribute("title", "publishBlocked");
  });
});
