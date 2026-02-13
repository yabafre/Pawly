"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Copy, Edit2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
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
      <Card className="flex flex-col items-center justify-center border-dashed border-neutral-200 bg-neutral-50/50 py-16 px-8 shadow-none">
        <div className="text-center space-y-3">
          <h3 className="text-lg font-bold text-neutral-600">{t("emptyState.title")}</h3>
          <p className="text-sm text-neutral-400 max-w-md">{t("emptyState.description")}</p>
          <Button
            onClick={onCreate}
            className="mt-4 bg-[#009588] hover:bg-[#00796B] text-white rounded-full px-6"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("emptyState.cta")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button
          onClick={onCreate}
          className="bg-[#009588] hover:bg-[#00796B] text-white rounded-full px-6 shadow-md shadow-[#009588]/20"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("emptyState.cta")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((tmpl) => {
          const data = parseTemplateData(tmpl.data);
          const totalSlots = countSlots(data);

          return (
            <Card
              key={tmpl.id}
              className="group relative border-neutral-100 transition-all hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:-translate-y-1"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-neutral-900 text-sm leading-tight">{tmpl.name}</h3>
                    <p className="text-[10px] font-medium text-neutral-400 mt-1 uppercase tracking-wide">
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
                        className="h-8 w-8 text-neutral-400 hover:text-neutral-900 -mr-2 -mt-2"
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
              </CardContent>
            </Card>
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
              className="bg-red-600 hover:bg-red-700 rounded-xl"
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
