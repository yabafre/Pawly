"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { CalendarDays, Copy, Edit2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { TemplateWeekPreview } from "./TemplateWeekPreview";
import type { ShiftTypeRecord } from "@/app/[locale]/admin/settings/_hooks/useClinicShiftTypes";

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

export function TemplateList({
  templates,
  shiftTypes,
  workDays,
  onEdit,
  onDuplicate,
  onDelete,
  onCreate,
}: Props) {
  const t = useTranslations("admin.planningTemplates");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const countSlots = (data: TemplateData) =>
    data.days.reduce((acc, d) => acc + d.slots.length, 0);

  if (templates.length === 0) {
    return (
      <section className="group relative overflow-hidden rounded-3xl border-2 border-dashed border-neutral-200 bg-white p-12 text-center shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        {/* Teal glow on hover */}
        <div className="pointer-events-none absolute -left-16 -top-16 h-[200px] w-[200px] rounded-full bg-[#009588] opacity-0 blur-[60px] transition-opacity duration-700 group-hover:opacity-[0.06]" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-100">
            <CalendarDays className="h-6 w-6 text-neutral-400" strokeWidth={1.5} />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-neutral-700">{t("emptyState.title")}</h3>
          <p className="mt-1 text-sm text-neutral-500 max-w-md">{t("emptyState.description")}</p>
          <Button
            onClick={onCreate}
            className="mt-6 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-neutral-900/10 hover:bg-black"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("emptyState.cta")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button
          onClick={onCreate}
          className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-neutral-900/10 hover:bg-black"
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("emptyState.cta")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((tmpl) => {
          const data = parseTemplateData(tmpl.data);
          const totalSlots = countSlots(data);

          return (
            <div
              key={tmpl.id}
              className="group relative overflow-hidden rounded-3xl border border-neutral-100 bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
            >
              {/* Teal glow on hover */}
              <div className="pointer-events-none absolute -left-16 -top-16 h-[200px] w-[200px] rounded-full bg-[#009588] opacity-0 blur-[60px] transition-opacity duration-700 group-hover:opacity-[0.06]" />

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-neutral-900 text-sm leading-tight">{tmpl.name}</h3>
                    <p className="text-[10px] font-bold text-neutral-400 mt-1 uppercase tracking-widest">
                      {t("card.daysConfigured", { count: data.days.length })}
                      <span className="mx-1.5 opacity-50">|</span>
                      {t("card.slotsCount", { count: totalSlots })}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full text-neutral-400 hover:text-neutral-900 -mr-1 -mt-1"
                        aria-label={t("actions.menu")}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl border-neutral-100 shadow-xl">
                      <DropdownMenuItem onClick={() => onEdit(tmpl)} className="rounded-lg focus:bg-neutral-50 cursor-pointer">
                        <Edit2 className="h-3.5 w-3.5 mr-2" />
                        {t("actions.edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(tmpl.id)} className="rounded-lg focus:bg-neutral-50 cursor-pointer">
                        <Copy className="h-3.5 w-3.5 mr-2" />
                        {t("actions.duplicate")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600 focus:bg-red-50 focus:text-red-700 rounded-lg cursor-pointer"
                        onClick={() => setDeleteId(tmpl.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        {t("actions.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <TemplateWeekPreview
                  data={data}
                  shiftTypes={shiftTypes}
                  workDays={workDays}
                  compact
                />
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirm.deleteMessage")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">{t("confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-600 text-white hover:bg-red-700"
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
