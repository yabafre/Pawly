"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "@tanstack/react-form";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useClinicShiftTypes,
  type ShiftTypeRecord,
} from "../_hooks/useClinicShiftTypes";

type Props = {
  open: boolean;
  onClose: () => void;
  editingShiftType: ShiftTypeRecord | null;
};

type FieldApi = any;

const COLOR_PALETTE = [
  { value: "#4F46E5", label: "Indigo" },
  { value: "#F97316", label: "Orange" },
  { value: "#10B981", label: "Emerald" },
  { value: "#F43F5E", label: "Rose" },
  { value: "#009588", label: "Teal" },
  { value: "#8B5CF6", label: "Violet" },
  { value: "#06B6D4", label: "Cyan" },
  { value: "#EAB308", label: "Yellow" },
];

export function ShiftTypeFormSheet({
  open,
  onClose,
  editingShiftType,
}: Props) {
  const t = useTranslations("settings.shiftTypes");
  const { createShiftType, isCreating, updateShiftType, isUpdating } =
    useClinicShiftTypes();

  const form = useForm({
    defaultValues: {
      name: "",
      code: "",
      startTime: "08:30",
      endTime: "18:30",
      breakMinutes: 0,
      color: COLOR_PALETTE[0].value,
    },
    onSubmit: async ({ value }) => {
      if (editingShiftType) {
        updateShiftType(
          { id: editingShiftType.id, ...value } as any,
          { onSuccess: () => onClose() },
        );
      } else {
        createShiftType(value as any, { onSuccess: () => onClose() });
      }
    },
  });

  useEffect(() => {
    if (open && editingShiftType) {
      form.reset();
      form.setFieldValue("name", editingShiftType.name);
      form.setFieldValue("code", editingShiftType.code);
      form.setFieldValue("startTime", editingShiftType.startTime);
      form.setFieldValue("endTime", editingShiftType.endTime);
      form.setFieldValue("breakMinutes", editingShiftType.breakMinutes ?? 0);
      form.setFieldValue("color", editingShiftType.color);
    } else if (open && !editingShiftType) {
      form.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form instance is stable
  }, [open, editingShiftType]);

  const isBusy = isCreating || isUpdating;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-hidden p-0 gap-0 sm:max-w-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Header */}
          <div className="shrink-0 border-b border-neutral-100 px-6 pb-5 pt-6 pr-12">
            <SheetTitle className="text-lg font-bold text-neutral-900">
              {editingShiftType ? t("form.editTitle") : t("form.createTitle")}
            </SheetTitle>
            <SheetDescription className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">
              {editingShiftType
                ? t("form.editSubtitle")
                : t("form.createSubtitle")}
            </SheetDescription>
          </div>

          {/* Body */}
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            {/* Name */}
            <form.Field name="name">
              {(field: FieldApi) => (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-neutral-700">
                    {t("fields.name")}
                  </Label>
                  <Input
                    value={field.state.value}
                    onChange={(e) => {
                      field.handleChange(e.target.value);
                      if (!editingShiftType) {
                        form.setFieldValue(
                          "code",
                          e.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, "")
                            .slice(0, 10),
                        );
                      }
                    }}
                    onBlur={field.handleBlur}
                    placeholder={t("fields.namePlaceholder")}
                    className="rounded-xl border-neutral-200 bg-neutral-50 transition-all focus:border-[#009588] focus:bg-white focus:ring-1 focus:ring-[#009588]/20"
                  />
                </div>
              )}
            </form.Field>

            {/* Code */}
            <form.Field name="code">
              {(field: FieldApi) => (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-neutral-700">
                    {t("fields.code")}
                  </Label>
                  <Input
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(
                        e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, "")
                          .slice(0, 10),
                      )
                    }
                    onBlur={field.handleBlur}
                    placeholder={t("fields.codePlaceholder")}
                    className="rounded-xl border-neutral-200 bg-neutral-50 font-mono transition-all focus:border-[#009588] focus:bg-white focus:ring-1 focus:ring-[#009588]/20"
                  />
                </div>
              )}
            </form.Field>

            {/* Times */}
            <div className="grid grid-cols-2 gap-4">
              <form.Field name="startTime">
                {(field: FieldApi) => (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-neutral-700">
                      {t("fields.startTime")}
                    </Label>
                    <Input
                      type="time"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="rounded-xl border-neutral-200 bg-neutral-50 transition-all focus:border-[#009588] focus:bg-white focus:ring-1 focus:ring-[#009588]/20"
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="endTime">
                {(field: FieldApi) => (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-neutral-700">
                      {t("fields.endTime")}
                    </Label>
                    <Input
                      type="time"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="rounded-xl border-neutral-200 bg-neutral-50 transition-all focus:border-[#009588] focus:bg-white focus:ring-1 focus:ring-[#009588]/20"
                    />
                  </div>
                )}
              </form.Field>
            </div>

            {/* Break Minutes */}
            <form.Field name="breakMinutes">
              {(field: FieldApi) => (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-neutral-700">
                    {t("fields.breakMinutes")}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={300}
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(
                        Math.max(0, Math.min(300, parseInt(e.target.value) || 0)),
                      )
                    }
                    onBlur={field.handleBlur}
                    placeholder={t("fields.breakMinutesPlaceholder")}
                    className="rounded-xl border-neutral-200 bg-neutral-50 transition-all focus:border-[#009588] focus:bg-white focus:ring-1 focus:ring-[#009588]/20"
                  />
                </div>
              )}
            </form.Field>

            {/* Color */}
            <form.Field name="color">
              {(field: FieldApi) => (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-neutral-700">
                    {t("fields.color")}
                  </Label>
                  <div className="flex gap-2.5 flex-wrap">
                    {COLOR_PALETTE.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => field.handleChange(color.value)}
                        className={`w-9 h-9 rounded-xl transition-all ${
                          field.state.value === color.value
                            ? "ring-2 ring-offset-2 ring-neutral-900 scale-110"
                            : "hover:scale-105"
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={color.label}
                      />
                    ))}
                  </div>
                </div>
              )}
            </form.Field>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-neutral-100 bg-neutral-50/50 px-6 py-4">
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="rounded-xl"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isBusy}
                className="rounded-xl bg-[#009588] font-semibold text-white shadow-lg shadow-[#009588]/20 hover:bg-[#00796B] disabled:opacity-60"
              >
                {editingShiftType ? t("actions.save") : t("actions.add")}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
