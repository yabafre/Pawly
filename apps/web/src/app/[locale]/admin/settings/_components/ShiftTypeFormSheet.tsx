"use client";

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
      name: editingShiftType?.name ?? "",
      code: editingShiftType?.code ?? "",
      startTime: editingShiftType?.startTime ?? "08:30",
      endTime: editingShiftType?.endTime ?? "18:30",
      breakMinutes: editingShiftType?.breakMinutes ?? 0,
      color: editingShiftType?.color ?? COLOR_PALETTE[0].value,
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

  const isBusy = isCreating || isUpdating;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-hidden p-0 gap-0 sm:max-w-lg">
        <form
          key={editingShiftType?.id ?? "new"}
          action={() => {
            form.handleSubmit();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Header */}
          <div className="shrink-0 border-b border-border px-6 pb-5 pt-6 pr-12">
            <SheetTitle className="text-lg font-bold text-foreground">
              {editingShiftType ? t("form.editTitle") : t("form.createTitle")}
            </SheetTitle>
            <SheetDescription className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
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
                  <Label className="text-sm font-medium text-foreground">
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
                    className="rounded-xl border-border bg-muted transition-all focus:border-primary focus:bg-card focus:ring-1 focus:ring-primary/20"
                  />
                </div>
              )}
            </form.Field>

            {/* Code */}
            <form.Field name="code">
              {(field: FieldApi) => (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-foreground">
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
                    className="rounded-xl border-border bg-muted font-mono transition-all focus:border-primary focus:bg-card focus:ring-1 focus:ring-primary/20"
                  />
                </div>
              )}
            </form.Field>

            {/* Times */}
            <div className="grid grid-cols-2 gap-4">
              <form.Field name="startTime">
                {(field: FieldApi) => (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-foreground">
                      {t("fields.startTime")}
                    </Label>
                    <Input
                      type="time"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="rounded-xl border-border bg-muted transition-all focus:border-primary focus:bg-card focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="endTime">
                {(field: FieldApi) => (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-foreground">
                      {t("fields.endTime")}
                    </Label>
                    <Input
                      type="time"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      className="rounded-xl border-border bg-muted transition-all focus:border-primary focus:bg-card focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                )}
              </form.Field>
            </div>

            {/* Break Minutes */}
            <form.Field name="breakMinutes">
              {(field: FieldApi) => (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-foreground">
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
                    className="rounded-xl border-border bg-muted transition-all focus:border-primary focus:bg-card focus:ring-1 focus:ring-primary/20"
                  />
                </div>
              )}
            </form.Field>

            {/* Color */}
            <form.Field name="color">
              {(field: FieldApi) => (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">
                    {t("fields.color")}
                  </Label>
                  <div className="flex gap-2.5 flex-wrap">
                    {COLOR_PALETTE.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => field.handleChange(color.value)}
                        className={`w-9 h-9 rounded-xl transition-all ${field.state.value === color.value
                          ? "ring-2 ring-offset-2 ring-foreground scale-110"
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
          <div className="shrink-0 border-t border-border bg-muted/30 px-6 py-4">
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
                className="rounded-xl bg-primary font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:opacity-60"
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
