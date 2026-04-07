import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockCreateTemplate = vi.fn();
const mockUpdateTemplate = vi.fn();
const mockDeleteTemplate = vi.fn();
const mockDuplicateTemplate = vi.fn();

vi.mock("../_hooks/useTemplates", () => ({
  useTemplates: () => ({
    templates: mockTemplates,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: mockCreateTemplate,
    isCreating: false,
    updateTemplate: mockUpdateTemplate,
    isUpdating: false,
    deleteTemplate: mockDeleteTemplate,
    isDeleting: false,
    duplicateTemplate: mockDuplicateTemplate,
    isDuplicating: false,
    invalidateTemplates: vi.fn(),
  }),
}));

vi.mock("@/app/[locale]/admin/settings/_hooks/useClinicShiftTypes", () => ({
  useClinicShiftTypes: () => ({
    shiftTypes: [
      { id: "st-1", code: "SURGERY", name: "Surgery", color: "#ff0000", startTime: "08:00", endTime: "12:00", breakMinutes: 0 },
      { id: "st-2", code: "RECEPTION", name: "Reception", color: "#00ff00", startTime: "09:00", endTime: "17:00", breakMinutes: 0 },
    ],
    isPending: false,
  }),
}));

vi.mock("@/app/[locale]/admin/settings/_hooks/useClinicOperationalConfig", () => ({
  useClinicOperationalConfig: () => ({
    config: { workDays: [1, 2, 3, 4, 5] },
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockTemplates: Array<{
  id: string;
  name: string;
  data: { days: Array<{ dayOfWeek: number; slots: Array<{ shiftTypeCode: string; requiredStaff: number }> }> };
  createdAt: string;
  updatedAt: string;
}> = [];

import { TemplateList } from "../_components/TemplateList";
import { TemplateWeekPreview } from "../_components/TemplateWeekPreview";
import { TemplateSlotForm } from "../_components/TemplateSlotForm";
import { TemplateEditor } from "../_components/TemplateEditor";

// NOTE: useTranslations mock returns translation keys (e.g. t("emptyState.title") → "emptyState.title")

describe("TemplateList", () => {
  const shiftTypes = [
    { id: "st-1", code: "SURGERY", name: "Surgery", color: "#ff0000", startTime: "08:00", endTime: "12:00", breakMinutes: 0 },
    { id: "st-2", code: "RECEPTION", name: "Reception", color: "#00ff00", startTime: "09:00", endTime: "17:00", breakMinutes: 0 },
  ];

  const mockOnEdit = vi.fn();
  const mockOnDuplicate = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when no templates exist", () => {
    render(
      <TemplateList
        templates={[]}
        shiftTypes={shiftTypes}
        onEdit={mockOnEdit}
        onDuplicate={mockOnDuplicate}
        onDelete={mockOnDelete}
        onCreate={mockOnCreate}
      />,
    );

    expect(screen.getByText("emptyState.title")).toBeInTheDocument();
    expect(screen.getByText("emptyState.description")).toBeInTheDocument();
  });

  it("renders template cards with name and week preview", () => {
    const templates = [
      {
        id: "tmpl-1",
        name: "Standard Week",
        data: {
          days: [
            { dayOfWeek: 1, slots: [{ shiftTypeCode: "SURGERY", requiredStaff: 2 }] },
          ],
        },
        createdAt: "2026-01-01",
        updatedAt: "2026-01-02",
      },
    ];

    render(
      <TemplateList
        templates={templates}
        shiftTypes={shiftTypes}
        onEdit={mockOnEdit}
        onDuplicate={mockOnDuplicate}
        onDelete={mockOnDelete}
        onCreate={mockOnCreate}
      />,
    );

    expect(screen.getByText("Standard Week")).toBeInTheDocument();
  });

  it("renders create button when templates exist", () => {
    const templates = [
      {
        id: "tmpl-1",
        name: "Test",
        data: { days: [] },
        createdAt: "2026-01-01",
        updatedAt: "2026-01-02",
      },
    ];

    render(
      <TemplateList
        templates={templates}
        shiftTypes={shiftTypes}
        onEdit={mockOnEdit}
        onDuplicate={mockOnDuplicate}
        onDelete={mockOnDelete}
        onCreate={mockOnCreate}
      />,
    );

    // Both empty-state CTA and list header use t("emptyState.cta")
    expect(screen.getByText("emptyState.cta")).toBeInTheDocument();
  });

  it("calls onCreate when create button is clicked in empty state", () => {
    render(
      <TemplateList
        templates={[]}
        shiftTypes={shiftTypes}
        onEdit={mockOnEdit}
        onDuplicate={mockOnDuplicate}
        onDelete={mockOnDelete}
        onCreate={mockOnCreate}
      />,
    );

    fireEvent.click(screen.getByText("emptyState.cta"));
    expect(mockOnCreate).toHaveBeenCalledOnce();
  });
});

describe("TemplateWeekPreview", () => {
  const shiftTypes = [
    { id: "st-1", code: "SURGERY", name: "Surgery", color: "#ff0000", startTime: "08:00", endTime: "12:00", breakMinutes: 0 },
  ];

  it("renders 7 day columns", () => {
    const { container } = render(
      <TemplateWeekPreview
        data={{ days: [] }}
        shiftTypes={shiftTypes}
      />,
    );

    expect(container.querySelectorAll("[class*='grid-cols-7'] > div")).toHaveLength(7);
  });

  it("renders shift type color chips for configured days", () => {
    const data = {
      days: [
        { dayOfWeek: 1, slots: [{ shiftTypeCode: "SURGERY", requiredStaff: 2 }] },
      ],
    };

    render(
      <TemplateWeekPreview data={data} shiftTypes={shiftTypes} />
    );

    // Title uses shift type name + translated staff count (mock returns key)
    const colorDots = screen.getAllByTitle(/Surgery: slot\.staffCount/);
    expect(colorDots.length).toBeGreaterThan(0);
  });

  it("marks non-work days with dimmed style", () => {
    const { container } = render(
      <TemplateWeekPreview
        data={{ days: [] }}
        shiftTypes={shiftTypes}
        workDays={[1, 2, 3, 4, 5]}
      />,
    );

    // Saturday and Sunday get bg-muted/80 styling
    const dayColumns = container.querySelectorAll("[class*='grid-cols-7'] > div");
    const nonWorkDays = Array.from(dayColumns).filter(
      (col) => col.className.includes("bg-muted/80"),
    );
    expect(nonWorkDays).toHaveLength(2);
  });
});

describe("TemplateSlotForm", () => {
  const shiftTypes = [
    { id: "st-1", code: "SURGERY", name: "Surgery", color: "#ff0000", startTime: "08:00", endTime: "12:00", breakMinutes: 0 },
    { id: "st-2", code: "RECEPTION", name: "Reception", color: "#00ff00", startTime: "09:00", endTime: "17:00", breakMinutes: 0 },
  ];

  it("renders shift type dropdown and staff count input", () => {
    const slot = { shiftTypeCode: "SURGERY", requiredStaff: 2 };

    render(
      <TemplateSlotForm
        slot={slot}
        shiftTypes={shiftTypes}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    // t("shiftType") → "shiftType", t("requiredStaff") → "requiredStaff"
    expect(screen.getByText("shiftType")).toBeInTheDocument();
    expect(screen.getByText("requiredStaff")).toBeInTheDocument();
  });

  it("renders job type toggle buttons", () => {
    const slot = { shiftTypeCode: "SURGERY", requiredStaff: 1 };

    render(
      <TemplateSlotForm
        slot={slot}
        shiftTypes={shiftTypes}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText("VET")).toBeInTheDocument();
    expect(screen.getByText("ASV")).toBeInTheDocument();
    expect(screen.getByText("APPRENTICE")).toBeInTheDocument();
  });

  it("calls onRemove when remove button is clicked", () => {
    const onRemove = vi.fn();
    const slot = { shiftTypeCode: "SURGERY", requiredStaff: 1 };

    render(
      <TemplateSlotForm
        slot={slot}
        shiftTypes={shiftTypes}
        onUpdate={vi.fn()}
        onRemove={onRemove}
      />,
    );

    // Find the remove button (ghost icon button with X svg)
    const allButtons = screen.getAllByRole("button");
    const removeBtn = allButtons.find((b) => b.querySelector("svg"));
    if (removeBtn) {
      fireEvent.click(removeBtn);
      expect(onRemove).toHaveBeenCalledOnce();
    }
  });
});

describe("TemplateEditor", () => {
  const shiftTypes = [
    { id: "st-1", code: "SURGERY", name: "Surgery", color: "#ff0000", startTime: "08:00", endTime: "12:00", breakMinutes: 0 },
    { id: "st-2", code: "RECEPTION", name: "Reception", color: "#00ff00", startTime: "09:00", endTime: "17:00", breakMinutes: 0 },
  ];

  const mockOnSave = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders create title when no template provided", () => {
    render(
      <TemplateEditor
        open={true}
        onOpenChange={mockOnOpenChange}
        template={null}
        shiftTypes={shiftTypes}
        onSave={mockOnSave}
        isSaving={false}
      />,
    );

    expect(screen.getByText("form.createTitle")).toBeInTheDocument();
  });

  it("renders edit title when template provided", () => {
    const template = {
      id: "tmpl-1",
      name: "Standard Week",
      data: { days: [] },
    };

    render(
      <TemplateEditor
        open={true}
        onOpenChange={mockOnOpenChange}
        template={template}
        shiftTypes={shiftTypes}
        onSave={mockOnSave}
        isSaving={false}
      />,
    );

    expect(screen.getByText("form.editTitle")).toBeInTheDocument();
  });

  it("renders 7 day rows", () => {
    render(
      <TemplateEditor
        open={true}
        onOpenChange={mockOnOpenChange}
        template={null}
        shiftTypes={shiftTypes}
        onSave={mockOnSave}
        isSaving={false}
      />,
    );

    expect(screen.getByText("days.monday")).toBeInTheDocument();
    expect(screen.getByText("days.tuesday")).toBeInTheDocument();
    expect(screen.getByText("days.wednesday")).toBeInTheDocument();
    expect(screen.getByText("days.thursday")).toBeInTheDocument();
    expect(screen.getByText("days.friday")).toBeInTheDocument();
    expect(screen.getByText("days.saturday")).toBeInTheDocument();
    expect(screen.getByText("days.sunday")).toBeInTheDocument();
  });

  it("pre-fills name input when editing existing template", () => {
    const template = {
      id: "tmpl-1",
      name: "Standard Week",
      data: { days: [] },
    };

    render(
      <TemplateEditor
        open={true}
        onOpenChange={mockOnOpenChange}
        template={template}
        shiftTypes={shiftTypes}
        onSave={mockOnSave}
        isSaving={false}
      />,
    );

    const nameInput = screen.getByDisplayValue("Standard Week");
    expect(nameInput).toBeInTheDocument();
  });

  it("disables save button when name is empty", () => {
    render(
      <TemplateEditor
        open={true}
        onOpenChange={mockOnOpenChange}
        template={null}
        shiftTypes={shiftTypes}
        onSave={mockOnSave}
        isSaving={false}
      />,
    );

    const saveButton = screen.getByText("form.save").closest("button");
    expect(saveButton).toBeDisabled();
  });

  it("disables save button when saving is in progress", () => {
    const template = {
      id: "tmpl-1",
      name: "Standard Week",
      data: { days: [] },
    };

    render(
      <TemplateEditor
        open={true}
        onOpenChange={mockOnOpenChange}
        template={template}
        shiftTypes={shiftTypes}
        onSave={mockOnSave}
        isSaving={true}
      />,
    );

    const saveButton = screen.getByText("form.save").closest("button");
    expect(saveButton).toBeDisabled();
  });

  it("calls onSave with name and data when save button clicked", () => {
    const template = {
      id: "tmpl-1",
      name: "Standard Week",
      data: {
        days: [
          { dayOfWeek: 1, slots: [{ shiftTypeCode: "SURGERY", requiredStaff: 2 }] },
        ],
      },
    };

    render(
      <TemplateEditor
        open={true}
        onOpenChange={mockOnOpenChange}
        template={template}
        shiftTypes={shiftTypes}
        onSave={mockOnSave}
        isSaving={false}
      />,
    );

    const saveButton = screen.getByText("form.save").closest("button")!;
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledWith("Standard Week", {
      days: [
        { dayOfWeek: 1, slots: [{ shiftTypeCode: "SURGERY", requiredStaff: 2 }] },
      ],
    });
  });

  it("calls onOpenChange when cancel button clicked", () => {
    render(
      <TemplateEditor
        open={true}
        onOpenChange={mockOnOpenChange}
        template={null}
        shiftTypes={shiftTypes}
        onSave={mockOnSave}
        isSaving={false}
      />,
    );

    const cancelButtons = screen.getAllByText("form.cancel");
    fireEvent.click(cancelButtons[0]);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("marks non-work-day columns when workDays provided", () => {
    render(
      <TemplateEditor
        open={true}
        onOpenChange={mockOnOpenChange}
        template={null}
        shiftTypes={shiftTypes}
        workDays={[1, 2, 3, 4, 5]}
        onSave={mockOnSave}
        isSaving={false}
      />,
    );

    // Saturday and Sunday should be marked as non-work days
    expect(screen.getAllByText("nonWorkDay")).toHaveLength(2);
  });

  it("adds slot when add slot button is clicked", () => {
    render(
      <TemplateEditor
        open={true}
        onOpenChange={mockOnOpenChange}
        template={null}
        shiftTypes={shiftTypes}
        onSave={mockOnSave}
        isSaving={false}
      />,
    );

    // Click the first "Add slot" button (Monday)
    const addButtons = screen.getAllByText("slot.addSlot");
    fireEvent.click(addButtons[0]);

    // Should now have a slot form rendered with shift type label
    expect(screen.getByText("shiftType")).toBeInTheDocument();
  });
});

describe("FR/EN rendering", () => {
  it("renders translation keys for day labels", () => {
    const shiftTypes = [
      { id: "st-1", code: "SURGERY", name: "Surgery", color: "#ff0000", startTime: "08:00", endTime: "12:00", breakMinutes: 0 },
    ];

    render(
      <TemplateWeekPreview
        data={{ days: [] }}
        shiftTypes={shiftTypes}
      />,
    );

    // Mock returns translation keys: t("days.mon") → "days.mon"
    expect(screen.getByText("days.mon")).toBeInTheDocument();
    expect(screen.getByText("days.tue")).toBeInTheDocument();
    expect(screen.getByText("days.sun")).toBeInTheDocument();
  });
});
