import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanningRulesPanel } from "../_components/PlanningRulesPanel";
import { PlanningRuleFormSheet } from "../_components/PlanningRuleFormSheet";
import { PlanningRuleConfigEditor } from "../_components/PlanningRuleConfigEditor";
import { PlanningHealthBar } from "../../planning/_components/PlanningHealthBar";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    return t;
  },
  useLocale: () => "fr",
}));

// Mock motion/react
vi.mock("motion/react", () => ({
  motion: {
    section: ({ children, ...props }: Record<string, unknown>) => <section {...props}>{children as React.ReactNode}</section>,
    div: ({ children, animate, initial, exit, style, ...props }: Record<string, unknown>) => (
      <div style={{ ...(style as object), ...(animate as object) }} {...props}>{children as React.ReactNode}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock UI components used by PlanningHealthBar
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock usePlanningRules hook
const mockRules: any[] = [];
const mockUsePlanningRules = {
  rules: mockRules,
  isPending: false,
  error: null as Error | null,
  refetch: vi.fn(),
  createRule: vi.fn(),
  isCreating: false,
  updateRule: vi.fn(),
  isUpdating: false,
  deleteRule: vi.fn(),
  isDeleting: false,
  toggleRule: vi.fn(),
};

vi.mock("../../planning/rules/_hooks/usePlanningRules", () => ({
  usePlanningRules: () => mockUsePlanningRules,
}));

// Mock useClinicShiftTypes hook (used by PlanningRuleFormSheet)
vi.mock("../_hooks/useClinicShiftTypes", () => ({
  useClinicShiftTypes: () => ({
    shiftTypes: [],
    isPending: false,
    error: null,
    refetch: vi.fn(),
    createShiftType: vi.fn(),
    isCreating: false,
    updateShiftType: vi.fn(),
    isUpdating: false,
    deleteShiftType: vi.fn(),
    isDeleting: false,
  }),
}));

// Mock @tanstack/react-form
vi.mock("@tanstack/react-form", () => ({
  useForm: vi.fn().mockImplementation(({ defaultValues }) => ({
    Field: ({ name, children }: any) =>
      children({
        state: {
          value: defaultValues?.[name] ?? "",
          meta: { errors: [] },
        },
        handleChange: vi.fn(),
        handleBlur: vi.fn(),
      }),
    Subscribe: ({ children }: any) => children([true, false]),
    handleSubmit: vi.fn(),
    reset: vi.fn(),
    setFieldValue: vi.fn(),
    getFieldValue: vi.fn().mockReturnValue("STAFFING_MINIMUM"),
  })),
}));

// Mock validators
vi.mock("@pawly/validators", () => ({
  PLANNING_RULE_TYPES: ["HARD", "SOFT"],
  PLANNING_RULE_CATEGORIES: [
    "STAFFING_MINIMUM",
    "ROTATION_EQUITY",
    "SKILL_REQUIREMENT",
    "CONTRACT_COMPLIANCE",
  ],
  DAYS_OF_WEEK: [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ],
  TRACKING_PERIODS: ["monthly", "quarterly"],
}));

// Mock UI components
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: any) => <button>{children}</button>,
  SelectValue: () => <span>value</span>,
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
    >
      switch
    </button>
  ),
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: any) =>
    open ? <div>{children}</div> : null,
  AlertDialogAction: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  AlertDialogCancel: ({ children }: any) => <button>{children}</button>,
  AlertDialogContent: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <h3>{children}</h3>,
}));

// ── PlanningRulesPanel ────────────────────────────────────────────────────

describe("PlanningRulesPanel", () => {
  it("renders empty state when no rules", () => {
    mockUsePlanningRules.rules = [];
    render(<PlanningRulesPanel />);

    expect(screen.getByText("empty.title")).toBeDefined();
    expect(screen.getByText("empty.description")).toBeDefined();
    expect(screen.getByText("empty.cta")).toBeDefined();
  });

  it("renders skeleton loading state", () => {
    mockUsePlanningRules.isPending = true;
    const { container } = render(<PlanningRulesPanel />);

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
    mockUsePlanningRules.isPending = false;
  });

  it("renders error state with retry button", () => {
    mockUsePlanningRules.error = new Error("Network error");
    render(<PlanningRulesPanel />);

    expect(screen.getByText("errors.loadFailed")).toBeDefined();
    expect(screen.getByText("errors.retry")).toBeDefined();
    mockUsePlanningRules.error = null;
  });

  it("renders rules grouped by category", () => {
    mockUsePlanningRules.rules = [
      {
        id: "rule-1",
        name: "Surgery staffing",
        description: "At least 2 vets",
        ruleType: "HARD",
        category: "STAFFING_MINIMUM",
        isActive: true,
        config: { shiftTypeCode: "SURGERY", minStaff: 2 },
        priority: 10,
      },
      {
        id: "rule-2",
        name: "Saturday rotation",
        description: null,
        ruleType: "SOFT",
        category: "ROTATION_EQUITY",
        isActive: false,
        config: {
          targetDay: "saturday",
          maxPerPeriod: 2,
          trackingPeriod: "monthly",
        },
        priority: 5,
      },
    ];
    render(<PlanningRulesPanel />);

    expect(screen.getByText("Surgery staffing")).toBeDefined();
    expect(screen.getByText("Saturday rotation")).toBeDefined();
    expect(screen.getByText("categories.STAFFING_MINIMUM")).toBeDefined();
    expect(screen.getByText("categories.ROTATION_EQUITY")).toBeDefined();
  });

  it("renders HARD badge for hard rules", () => {
    mockUsePlanningRules.rules = [
      {
        id: "rule-1",
        name: "Hard rule",
        description: null,
        ruleType: "HARD",
        category: "STAFFING_MINIMUM",
        isActive: true,
        config: { shiftTypeCode: "SURGERY", minStaff: 1 },
        priority: 0,
      },
    ];
    render(<PlanningRulesPanel />);

    expect(screen.getByText("ruleTypes.HARD")).toBeDefined();
  });

  it("renders add button", () => {
    mockUsePlanningRules.rules = [
      {
        id: "rule-1",
        name: "Test",
        description: null,
        ruleType: "HARD",
        category: "STAFFING_MINIMUM",
        isActive: true,
        config: { shiftTypeCode: "SURGERY", minStaff: 1 },
        priority: 0,
      },
    ];
    render(<PlanningRulesPanel />);

    expect(screen.getByText("actions.add")).toBeDefined();
  });

  it("renders edit and delete buttons for each rule", () => {
    mockUsePlanningRules.rules = [
      {
        id: "rule-1",
        name: "Test",
        description: null,
        ruleType: "HARD",
        category: "STAFFING_MINIMUM",
        isActive: true,
        config: { shiftTypeCode: "SURGERY", minStaff: 1 },
        priority: 0,
      },
    ];
    render(<PlanningRulesPanel />);

    expect(screen.getByText("actions.edit")).toBeDefined();
    expect(screen.getByText("actions.delete")).toBeDefined();
  });
});

// ── PlanningRuleFormSheet ─────────────────────────────────────────────────

describe("PlanningRuleFormSheet", () => {
  it("renders create form when open with no editing rule", () => {
    render(
      <PlanningRuleFormSheet
        open={true}
        onClose={vi.fn()}
        editingRule={null}
      />,
    );

    expect(screen.getByText("form.createTitle")).toBeDefined();
    expect(screen.getByText("form.name")).toBeDefined();
    expect(screen.getByText("form.description")).toBeDefined();
    expect(screen.getByText("form.ruleType")).toBeDefined();
    expect(screen.getByText("form.category")).toBeDefined();
    expect(screen.getByText("form.priority")).toBeDefined();
    expect(screen.getByText("form.isActive")).toBeDefined();
  });

  it("renders edit form when editing rule provided", () => {
    const editingRule = {
      id: "rule-1",
      name: "Test Rule",
      description: "Desc",
      ruleType: "HARD" as const,
      category: "STAFFING_MINIMUM" as const,
      isActive: true,
      config: { shiftTypeCode: "SURGERY", minStaff: 2 },
      priority: 10,
    };

    render(
      <PlanningRuleFormSheet
        open={true}
        onClose={vi.fn()}
        editingRule={editingRule}
      />,
    );

    expect(screen.getByText("form.editTitle")).toBeDefined();
  });

  it("does not render when closed", () => {
    const { container } = render(
      <PlanningRuleFormSheet
        open={false}
        onClose={vi.fn()}
        editingRule={null}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders submit and cancel buttons", () => {
    render(
      <PlanningRuleFormSheet
        open={true}
        onClose={vi.fn()}
        editingRule={null}
      />,
    );

    expect(screen.getByText("actions.add")).toBeDefined();
    expect(screen.getByText("confirm.cancel")).toBeDefined();
  });
});

// ── PlanningRuleConfigEditor ──────────────────────────────────────────────

describe("PlanningRuleConfigEditor", () => {
  it("renders STAFFING_MINIMUM config fields", () => {
    render(
      <PlanningRuleConfigEditor
        category="STAFFING_MINIMUM"
        config={{ shiftTypeCode: "SURGERY", minStaff: 2 }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("config.shiftTypeCode")).toBeDefined();
    expect(screen.getByText("config.minStaff")).toBeDefined();
    expect(screen.getByText("config.jobTypes")).toBeDefined();
  });

  it("renders ROTATION_EQUITY config fields", () => {
    render(
      <PlanningRuleConfigEditor
        category="ROTATION_EQUITY"
        config={{
          targetDay: "saturday",
          maxPerPeriod: 2,
          trackingPeriod: "monthly",
        }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("config.targetDay")).toBeDefined();
    expect(screen.getByText("config.maxPerPeriod")).toBeDefined();
    expect(screen.getByText("config.trackingPeriod")).toBeDefined();
  });

  it("renders SKILL_REQUIREMENT config fields", () => {
    render(
      <PlanningRuleConfigEditor
        category="SKILL_REQUIREMENT"
        config={{ shiftTypeCode: "SURGERY", requiredJobTypes: ["VET"] }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("config.shiftTypeCode")).toBeDefined();
    expect(screen.getByText("config.requiredJobTypes")).toBeDefined();
  });

  it("renders CONTRACT_COMPLIANCE config fields", () => {
    render(
      <PlanningRuleConfigEditor
        category="CONTRACT_COMPLIANCE"
        config={{ maxWeeklyHours: 35 }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("config.maxWeeklyHours")).toBeDefined();
    expect(screen.getByText("config.maxMonthlyHours")).toBeDefined();
    expect(screen.getByText("config.overtimeThresholdPercent")).toBeDefined();
  });

  it("returns null for unknown category", () => {
    const { container } = render(
      <PlanningRuleConfigEditor
        category={"UNKNOWN" as any}
        config={{}}
        onChange={vi.fn()}
      />,
    );

    expect(container.innerHTML).toBe("");
  });
});

// ── PlanningHealthBar ─────────────────────────────────────────────────────

describe("PlanningHealthBar", () => {
  it("renders healthy state when no violations", () => {
    render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={0}
        holeCount={0}
        totalShifts={10}
      />,
    );

    expect(screen.getByText("title")).toBeDefined();
    expect(screen.getByText("healthy")).toBeDefined();
  });

  it("renders conflict state with hard violations", () => {
    render(
      <PlanningHealthBar
        hardViolationCount={3}
        softViolationCount={1}
        holeCount={0}
        totalShifts={10}
      />,
    );

    expect(screen.getByText("publishBlocked")).toBeDefined();
  });

  it("renders publish button when onPublish provided", () => {
    render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={0}
        holeCount={0}
        totalShifts={10}
        onPublish={vi.fn()}
      />,
    );

    expect(screen.getByText("publish")).toBeDefined();
  });

  it("disables publish button when hard conflicts exist", () => {
    render(
      <PlanningHealthBar
        hardViolationCount={2}
        softViolationCount={0}
        holeCount={0}
        totalShifts={10}
        onPublish={vi.fn()}
      />,
    );

    const publishBtn = screen.getByText("publish");
    expect(publishBtn.closest("button")?.disabled).toBe(true);
  });

  it("does not render publish button when onPublish not provided", () => {
    render(
      <PlanningHealthBar
        hardViolationCount={0}
        softViolationCount={0}
        holeCount={0}
        totalShifts={10}
      />,
    );

    expect(screen.queryByText("publish")).toBeNull();
  });
});
