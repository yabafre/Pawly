import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GenerationResultView } from "../_components/GenerationResultView";
import { ConfirmRegenerateDialog } from "../_components/ConfirmRegenerateDialog";
import { GenerationPanel } from "../_components/GenerationPanel";
import type { GenerationResult } from "@pawly/validators";

vi.mock("../_hooks/useGeneration", () => ({
  useGeneration: vi.fn(() => ({
    shifts: [],
    isLoadingShifts: false,
    isFetchingShifts: false,
    refetchShifts: vi.fn(),
    generatePlan: vi.fn(),
    isGenerating: false,
    deleteGenerated: vi.fn(),
    isDeleting: false,
    invalidateAll: vi.fn(),
  })),
}));

vi.mock("../templates/_hooks/useTemplates", () => ({
  useTemplates: vi.fn(() => ({
    templates: [
      { id: "tpl-1", name: "Template A" },
      { id: "tpl-2", name: "Template B" },
    ],
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: vi.fn(),
    isCreating: false,
    updateTemplate: vi.fn(),
    isUpdating: false,
    deleteTemplate: vi.fn(),
    isDeleting: false,
    duplicateTemplate: vi.fn(),
    isDuplicating: false,
    invalidateTemplates: vi.fn(),
  })),
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("GenerationPanel", () => {
  it("renders title and subtitle", () => {
    render(<GenerationPanel />, { wrapper: Wrapper });
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("subtitle")).toBeInTheDocument();
  });

  it("renders month label and template label", () => {
    render(<GenerationPanel />, { wrapper: Wrapper });
    expect(screen.getByText("monthLabel")).toBeInTheDocument();
    expect(screen.getByText("templateLabel")).toBeInTheDocument();
  });

  it("renders generate button with correct text", () => {
    render(<GenerationPanel />, { wrapper: Wrapper });
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByText("generateButton")).toBeInTheDocument();
  });

  it("shows loading state when generating", async () => {
    const { useGeneration } = await import("../_hooks/useGeneration");
    vi.mocked(useGeneration).mockReturnValue({
      shifts: [],
      isLoadingShifts: false,
      isFetchingShifts: false,
      refetchShifts: vi.fn(),
      generatePlan: vi.fn(),
      isGenerating: true,
      deleteGenerated: vi.fn(),
      isDeleting: false,
      invalidateAll: vi.fn(),
    } as any);

    render(<GenerationPanel />, { wrapper: Wrapper });
    expect(screen.getByText("generating")).toBeInTheDocument();
  });
});

describe("GenerationResultView", () => {
  const fullResult: GenerationResult = {
    assignments: [
      {
        id: "s1",
        date: "2026-03-02",
        startTime: "08:00",
        endTime: "12:00",
        shiftTypeCode: "SURGERY",
        employeeId: "e1",
        employeeName: "Alice Martin",
      },
    ],
    holes: [
      {
        date: "2026-03-03",
        shiftTypeCode: "RECEPTION",
        requiredStaff: 2,
        assignedStaff: 1,
        reason: "Not enough eligible employees",
      },
    ],
    violations: {
      hard: [
        {
          ruleId: "r1",
          ruleName: "Min 2 vets",
          category: "STAFFING_MINIMUM",
          message: "Only 1 eligible for SURGERY on 2026-03-03",
          severity: "blocking",
        },
      ],
      soft: [
        {
          ruleId: "r2",
          ruleName: "Max Saturdays",
          category: "ROTATION_EQUITY",
          message: "Employee has 3 Saturday shifts",
          severity: "warning",
        },
      ],
    },
    stats: {
      totalSlots: 10,
      filledSlots: 8,
      holeCount: 1,
      hardViolationCount: 1,
      softWarningCount: 1,
    },
  };

  it("renders assignment summary stats", () => {
    render(<GenerationResultView result={fullResult} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("renders holes list with reasons", () => {
    render(<GenerationResultView result={fullResult} />, {
      wrapper: Wrapper,
    });

    expect(
      screen.getByText(/2026-03-03.*RECEPTION/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Not enough eligible employees"),
    ).toBeInTheDocument();
  });

  it("renders hard violation warnings", () => {
    render(<GenerationResultView result={fullResult} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText("Min 2 vets")).toBeInTheDocument();
    expect(
      screen.getByText(/Only 1 eligible/),
    ).toBeInTheDocument();
  });

  it("renders soft violation warnings", () => {
    render(<GenerationResultView result={fullResult} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText("Max Saturdays")).toBeInTheDocument();
    expect(
      screen.getByText(/3 Saturday shifts/),
    ).toBeInTheDocument();
  });

  it("shows success state when no issues", () => {
    const cleanResult: GenerationResult = {
      assignments: fullResult.assignments,
      holes: [],
      violations: { hard: [], soft: [] },
      stats: {
        totalSlots: 1,
        filledSlots: 1,
        holeCount: 0,
        hardViolationCount: 0,
        softWarningCount: 0,
      },
    };

    render(<GenerationResultView result={cleanResult} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText("result.allGood")).toBeInTheDocument();
  });

  it("renders translated stat labels", () => {
    render(<GenerationResultView result={fullResult} />, {
      wrapper: Wrapper,
    });

    // useTranslations mock returns the key
    expect(
      screen.getByText("stats.totalSlots"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("stats.filledSlots"),
    ).toBeInTheDocument();
    expect(screen.getByText("stats.holes")).toBeInTheDocument();
  });
});

describe("ConfirmRegenerateDialog", () => {
  it("renders dialog content when open", () => {
    render(
      <ConfirmRegenerateDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        existingCount={5}
      />,
      { wrapper: Wrapper },
    );

    // useTranslations mock returns the key
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <ConfirmRegenerateDialog
        open={false}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        existingCount={5}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.queryByText("title")).not.toBeInTheDocument();
  });

  it("renders confirm and cancel buttons", () => {
    render(
      <ConfirmRegenerateDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        existingCount={5}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText("confirm")).toBeInTheDocument();
    expect(screen.getByText("cancel")).toBeInTheDocument();
  });
});
