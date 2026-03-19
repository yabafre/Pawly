"use client";

import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar, ChevronRight, Copy, Edit2, Layout, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ShiftTypeRecord } from "@/app/[locale]/admin/settings/_hooks/useClinicShiftTypes";
import type { TemplateSlot, TemplateDay, TemplateData, TemplateRecord } from "@pawly/types";

type Props = {
  templates: TemplateRecord[];
  shiftTypes: ShiftTypeRecord[];
  workDays?: number[];
  onEdit: (template: TemplateRecord) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
};

function parseTemplateData(data: unknown): TemplateData {
  if (data && typeof data === "object" && "days" in data && Array.isArray((data as TemplateData).days)) {
    return data as TemplateData;
  }
  return { days: [] };
}

type TemplateCardProps = {
  template: TemplateRecord;
  data: TemplateData;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

function TemplateCard({ template, data, onEdit, onDuplicate, onDelete }: TemplateCardProps) {
  const t = useTranslations("admin.planningTemplates");

  const daysConfigured = data.days.length;
  const totalShifts = data.days.reduce((acc, day) => acc + day.slots.length, 0);
  const preview = Array.from({ length: 7 }, (_, idx) => {
    const dayData = data.days.find((d) => d.dayOfWeek === idx + 1);
    return dayData && dayData.slots.length > 0 ? 1 : 0;
  });

  return (
    <div
      className="group relative bg-white px-6 pt-6 pb-3 rounded-3xl border border-neutral-100 shadow-sm hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:border-[#009588]/30 transition-all cursor-pointer overflow-hidden"
      onClick={onEdit}
    >
      <div className="absolute top-4 right-4 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("actions.menu")}
              onClick={(event) => event.stopPropagation()}
              className="p-2 text-neutral-300 hover:text-neutral-900 rounded-full hover:bg-neutral-100 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Layout size={16} className="rotate-90" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl border-neutral-100 shadow-xl p-1 w-40">
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
              className="rounded-lg focus:bg-neutral-50 cursor-pointer font-medium text-xs p-2"
            >
              <Edit2 className="h-3.5 w-3.5 mr-2 text-neutral-500" />
              {t("actions.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(event) => {
                event.stopPropagation();
                onDuplicate();
              }}
              className="rounded-lg focus:bg-neutral-50 cursor-pointer font-medium text-xs p-2"
            >
              <Copy className="h-3.5 w-3.5 mr-2 text-neutral-500" />
              {t("actions.duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600 focus:bg-red-50 focus:text-red-700 rounded-lg cursor-pointer font-medium text-xs p-2"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              {t("actions.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 bg-neutral-50 rounded-2xl flex items-center justify-center group-hover:bg-[#009588]/5 transition-colors">
          <Layout className="w-6 h-6 text-neutral-400 group-hover:text-[#009588] transition-colors" />
        </div>
        <div>
          <h3 className="font-bold text-neutral-900 leading-tight">{template.name}</h3>
          <span className="text-xs text-neutral-400 font-medium">
            {t("card.daysConfigured", { count: daysConfigured })} • {t("card.slotsCount", { count: totalShifts })}
          </span>
        </div>
      </div>

      <div className="bg-neutral-50 rounded-2xl p-3.5 border border-neutral-100">
        <div className="flex justify-between items-end h-8 gap-1">
          {preview.map((status, dayIndex) => (
            <div key={dayIndex} className="flex-1 flex flex-col items-center gap-2 group/day">
              <div
                className={`w-full rounded-md transition-all duration-500 ${
                  status ? "h-6 bg-[#009588] group-hover:bg-[#00796B]" : "h-1 bg-neutral-200"
                }`}
              />
              <span className="text-[8px] font-bold text-neutral-300 uppercase">
                {["L", "M", "M", "J", "V", "S", "D"][dayIndex]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
        <span className="text-xs font-bold text-[#009588]">{t("actions.edit")}</span>
        <div className="w-8 h-8 rounded-full bg-white border border-neutral-100 flex items-center justify-center shadow-sm">
          <ChevronRight size={14} className="text-neutral-400" />
        </div>
      </div>
    </div>
  );
}

export function TemplateList({
  templates,
  shiftTypes: _shiftTypes,
  workDays: _workDays,
  onEdit,
  onDuplicate,
  onDelete,
  onCreate,
}: Props) {
  const t = useTranslations("admin.planningTemplates");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (templates.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-neutral-200 bg-white p-12 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-50 border border-neutral-100">
          <Calendar className="h-6 w-6 text-neutral-400" />
        </div>
        <h3 className="text-lg font-bold text-neutral-900">{t("emptyState.title")}</h3>
        <p className="mt-2 text-sm text-neutral-500">{t("emptyState.description")}</p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-6 inline-flex h-11 items-center gap-2 px-5 bg-[#171717] text-white rounded-xl font-bold text-sm hover:bg-black shadow-xl shadow-neutral-900/10 cursor-pointer"
        >
          <Plus size={16} />
          {t("emptyState.cta")}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-8">
        <button
          type="button"
          onClick={onCreate}
          className="h-11 px-5 bg-[#171717] text-white rounded-xl font-bold text-sm hover:bg-black shadow-xl shadow-neutral-900/10 flex items-center gap-2 cursor-pointer"
        >
          <Plus size={16} />
          {t("emptyState.cta")}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-start">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            data={parseTemplateData(template.data)}
            onEdit={() => onEdit(template)}
            onDuplicate={() => onDuplicate(template.id)}
            onDelete={() => setDeleteId(template.id)}
          />
        ))}

        <button
          type="button"
          onClick={onCreate}
          className="group flex flex-col items-center justify-center px-6 pt-6 pb-3 rounded-3xl border-2 border-dashed border-neutral-200 hover:border-[#009588] bg-transparent hover:bg-[#009588]/5 min-h-[220px]"
        >
          <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mb-3 group-hover:bg-white">
            <Plus size={20} className="text-neutral-400 group-hover:text-[#009588]" />
          </div>
          <span className="text-sm font-bold text-neutral-400 group-hover:text-[#009588]">{t("form.createTitle")}</span>
        </button>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="rounded-2xl border-neutral-100 shadow-2xl p-6">
          <AlertDialogHeader className="mb-4">
            <AlertDialogTitle className="font-bold text-lg text-neutral-900">{t("confirm.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-neutral-500">{t("confirm.deleteMessage")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3">
            <AlertDialogCancel className="rounded-xl font-bold text-neutral-600 border-neutral-200 hover:bg-neutral-50">
              {t("confirm.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#171717] hover:bg-black text-white rounded-xl font-bold"
              onClick={() => {
                if (deleteId) onDelete(deleteId);
                setDeleteId(null);
              }}
            >
              {t("confirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
