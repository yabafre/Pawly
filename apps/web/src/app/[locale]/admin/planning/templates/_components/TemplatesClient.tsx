"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { useTemplates } from "../_hooks/useTemplates";
import { useClinicShiftTypes } from "@/app/[locale]/admin/settings/_hooks/useClinicShiftTypes";
import { useClinicOperationalConfig } from "@/app/[locale]/admin/settings/_hooks/useClinicOperationalConfig";
import { TemplateList } from "./TemplateList";
import { TemplateEditor } from "./TemplateEditor";

type TemplateSlot = {
  shiftTypeCode: string;
  requiredStaff: number;
  requiredJobTypes?: string[];
};

type TemplateDay = {
  dayOfWeek: number;
  slots: TemplateSlot[];
};

type TemplateData = {
  days: TemplateDay[];
};

type TemplateRecord = {
  id: string;
  name: string;
  data: unknown;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type EditableTemplate = {
  id: string;
  name: string;
  data: TemplateData;
};

function parseTemplateData(data: unknown): TemplateData {
  if (data && typeof data === "object" && "days" in data && Array.isArray((data as TemplateData).days)) {
    return data as TemplateData;
  }
  return { days: [] };
}

export function TemplatesClient() {
  const t = useTranslations("admin.planningTemplates");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EditableTemplate | null>(null);

  const {
    templates,
    isPending,
    createTemplate,
    isCreating,
    updateTemplate,
    isUpdating,
    deleteTemplate,
    duplicateTemplate,
  } = useTemplates();

  const { shiftTypes, isPending: isLoadingShiftTypes } = useClinicShiftTypes();
  const { config } = useClinicOperationalConfig();

  const workDays = config?.workDays as number[] | undefined;

  const handleCreate = () => {
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  const handleEdit = (tmpl: TemplateRecord) => {
    setEditingTemplate({
      id: tmpl.id,
      name: tmpl.name,
      data: parseTemplateData(tmpl.data),
    });
    setEditorOpen(true);
  };

  const handleSave = (name: string, data: TemplateData) => {
    if (editingTemplate) {
      updateTemplate({
        id: editingTemplate.id,
        name,
        data,
      });
    } else {
      createTemplate({ name, data });
    }
    setEditorOpen(false);
    setEditingTemplate(null);
  };

  const handleDuplicate = (id: string) => {
    duplicateTemplate({ id });
  };

  const handleDelete = (id: string) => {
    deleteTemplate({ id });
  };

  if (isPending || isLoadingShiftTypes) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        <span className="ml-2 text-sm text-neutral-500">{t("loading")}</span>
      </div>
    );
  }

  return (
    <>
      <TemplateList
        templates={templates as TemplateRecord[]}
        shiftTypes={shiftTypes}
        workDays={workDays}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onCreate={handleCreate}
      />

      <TemplateEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editingTemplate}
        shiftTypes={shiftTypes}
        workDays={workDays}
        onSave={handleSave}
        isSaving={isCreating || isUpdating}
      />
    </>
  );
}
