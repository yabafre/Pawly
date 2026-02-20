import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShiftTypesPanel } from "../_components/ShiftTypesPanel";
import { ShiftTypeFormSheet } from "../_components/ShiftTypeFormSheet";
import { PlanningRuleConfigEditor } from "../_components/PlanningRuleConfigEditor";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    return t;
  },
}));

// Mock useClinicShiftTypes hook
const mockShiftTypes: any[] = [];
const mockUseClinicShiftTypes = {
  shiftTypes: mockShiftTypes,
  isPending: false,
  error: null as Error | null,
  refetch: vi.fn(),
  createShiftType: vi.fn(),
  isCreating: false,
  updateShiftType: vi.fn(),
  isUpdating: false,
  deleteShiftType: vi.fn(),
  isDeleting: false,
};

vi.mock("../_hooks/useClinicShiftTypes", () => ({
  useClinicShiftTypes: () => mockUseClinicShiftTypes,
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
  SelectValue: ({ placeholder }: any) => <span>{placeholder ?? "value"}</span>,
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
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

// ── ShiftTypesPanel ──────────────────────────────────────────────────────

describe("ShiftTypesPanel", () => {
  it("renders empty state when no shift types", () => {
    mockUseClinicShiftTypes.shiftTypes = [];
    render(<ShiftTypesPanel />);

    expect(screen.getByText("empty.title")).toBeDefined();
    expect(screen.getByText("empty.description")).toBeDefined();
    expect(screen.getByText("empty.cta")).toBeDefined();
  });

  it("renders skeleton loading state", () => {
    mockUseClinicShiftTypes.isPending = true;
    const { container } = render(<ShiftTypesPanel />);

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
    mockUseClinicShiftTypes.isPending = false;
  });

  it("renders error state with retry button", () => {
    mockUseClinicShiftTypes.error = new Error("Network error");
    render(<ShiftTypesPanel />);

    expect(screen.getByText("errors.loadFailed")).toBeDefined();
    expect(screen.getByText("errors.retry")).toBeDefined();
    mockUseClinicShiftTypes.error = null;
  });

  it("renders shift type cards with name, code, and times", () => {
    mockUseClinicShiftTypes.shiftTypes = [
      {
        id: "st-1",
        name: "Morning",
        code: "AM",
        startTime: "08:00",
        endTime: "12:00",
        color: "#4F46E5",
      },
      {
        id: "st-2",
        name: "Afternoon",
        code: "PM",
        startTime: "13:00",
        endTime: "18:00",
        color: "#F97316",
      },
    ];
    render(<ShiftTypesPanel />);

    expect(screen.getByText("Morning")).toBeDefined();
    expect(screen.getByText("AM")).toBeDefined();
    expect(screen.getByText("08:00 — 12:00")).toBeDefined();
    expect(screen.getByText("Afternoon")).toBeDefined();
    expect(screen.getByText("PM")).toBeDefined();
    expect(screen.getByText("13:00 — 18:00")).toBeDefined();
  });

  it("renders add button when shift types exist", () => {
    mockUseClinicShiftTypes.shiftTypes = [
      {
        id: "st-1",
        name: "Morning",
        code: "AM",
        startTime: "08:00",
        endTime: "12:00",
        color: "#4F46E5",
      },
    ];
    render(<ShiftTypesPanel />);

    expect(screen.getByText("actions.add")).toBeDefined();
  });

  it("renders edit and delete buttons for each shift type", () => {
    mockUseClinicShiftTypes.shiftTypes = [
      {
        id: "st-1",
        name: "Morning",
        code: "AM",
        startTime: "08:00",
        endTime: "12:00",
        color: "#4F46E5",
      },
    ];
    render(<ShiftTypesPanel />);

    expect(screen.getByText("actions.edit")).toBeDefined();
    expect(screen.getByText("actions.delete")).toBeDefined();
  });
});

// ── ShiftTypeFormSheet ───────────────────────────────────────────────────

describe("ShiftTypeFormSheet", () => {
  it("renders create form when open with no editing shift type", () => {
    render(
      <ShiftTypeFormSheet
        open={true}
        onClose={vi.fn()}
        editingShiftType={null}
      />,
    );

    expect(screen.getByText("form.createTitle")).toBeDefined();
    expect(screen.getByText("fields.name")).toBeDefined();
    expect(screen.getByText("fields.code")).toBeDefined();
    expect(screen.getByText("fields.startTime")).toBeDefined();
    expect(screen.getByText("fields.endTime")).toBeDefined();
    expect(screen.getByText("fields.color")).toBeDefined();
  });

  it("renders edit form when editing shift type provided", () => {
    const editingShiftType = {
      id: "st-1",
      name: "Morning",
      code: "AM",
      startTime: "08:00",
      endTime: "12:00",
      breakMinutes: 0,
      color: "#4F46E5",
    };

    render(
      <ShiftTypeFormSheet
        open={true}
        onClose={vi.fn()}
        editingShiftType={editingShiftType}
      />,
    );

    expect(screen.getByText("form.editTitle")).toBeDefined();
  });

  it("does not render when closed", () => {
    const { container } = render(
      <ShiftTypeFormSheet
        open={false}
        onClose={vi.fn()}
        editingShiftType={null}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders submit and cancel buttons", () => {
    render(
      <ShiftTypeFormSheet
        open={true}
        onClose={vi.fn()}
        editingShiftType={null}
      />,
    );

    expect(screen.getByText("actions.add")).toBeDefined();
    expect(screen.getByText("actions.cancel")).toBeDefined();
  });

  it("renders save button when editing", () => {
    render(
      <ShiftTypeFormSheet
        open={true}
        onClose={vi.fn()}
        editingShiftType={{
          id: "st-1",
          name: "Morning",
          code: "AM",
          startTime: "08:00",
          endTime: "12:00",
          breakMinutes: 0,
          color: "#4F46E5",
        }}
      />,
    );

    expect(screen.getByText("actions.save")).toBeDefined();
  });
});

// ── PlanningRuleConfigEditor with shiftTypes ────────────────────────────

describe("PlanningRuleConfigEditor with shift types dropdown", () => {
  const shiftTypes = [
    {
      id: "st-1",
      name: "Morning",
      code: "AM",
      startTime: "08:00",
      endTime: "12:00",
      breakMinutes: 0,
      color: "#4F46E5",
    },
    {
      id: "st-2",
      name: "Surgery",
      code: "SURGERY",
      startTime: "09:00",
      endTime: "17:00",
      breakMinutes: 0,
      color: "#F43F5E",
    },
  ];

  it("renders Select dropdown for STAFFING_MINIMUM when shiftTypes provided", () => {
    render(
      <PlanningRuleConfigEditor
        category="STAFFING_MINIMUM"
        config={{ shiftTypeCode: "AM", minStaff: 2 }}
        onChange={vi.fn()}
        shiftTypes={shiftTypes}
      />,
    );

    expect(screen.getByText("Morning (AM)")).toBeDefined();
    expect(screen.getByText("Surgery (SURGERY)")).toBeDefined();
  });

  it("renders Select dropdown for SKILL_REQUIREMENT when shiftTypes provided", () => {
    render(
      <PlanningRuleConfigEditor
        category="SKILL_REQUIREMENT"
        config={{ shiftTypeCode: "SURGERY", requiredJobTypes: ["VET"] }}
        onChange={vi.fn()}
        shiftTypes={shiftTypes}
      />,
    );

    expect(screen.getByText("Morning (AM)")).toBeDefined();
    expect(screen.getByText("Surgery (SURGERY)")).toBeDefined();
  });

  it("renders Input fallback for STAFFING_MINIMUM when no shiftTypes", () => {
    render(
      <PlanningRuleConfigEditor
        category="STAFFING_MINIMUM"
        config={{ shiftTypeCode: "SURGERY", minStaff: 2 }}
        onChange={vi.fn()}
        shiftTypes={[]}
      />,
    );

    // Should have input with placeholder "SURGERY"
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    // The shiftTypeCode input should have SURGERY as value
    expect(inputs.some((input) => input.value === "SURGERY")).toBe(true);
  });

  it("renders ROTATION_EQUITY without shift type dropdown", () => {
    render(
      <PlanningRuleConfigEditor
        category="ROTATION_EQUITY"
        config={{
          targetDay: "saturday",
          maxPerPeriod: 2,
          trackingPeriod: "monthly",
        }}
        onChange={vi.fn()}
        shiftTypes={shiftTypes}
      />,
    );

    // Should not show shift type options for rotation equity
    expect(screen.queryByText("Morning (AM)")).toBeNull();
    expect(screen.getByText("config.targetDay")).toBeDefined();
  });
});
