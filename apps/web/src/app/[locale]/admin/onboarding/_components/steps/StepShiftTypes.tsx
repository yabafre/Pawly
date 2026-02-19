"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Layers, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { OnboardingForm } from "../OnboardingWizard";

interface StepShiftTypesProps {
  form: OnboardingForm;
}

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

export function StepShiftTypes({ form }: StepShiftTypesProps) {
  const t = useTranslations("onboarding.steps.shiftTypes");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-[#009588]/10 flex items-center justify-center">
          <Layers className="w-5 h-5 text-[#009588]" />
        </div>
        <p className="text-sm text-neutral-500">{t("help")}</p>
      </div>

      <form.Field
        name="shiftTypes"
        validators={{
          onChange: ({ value }: { value: any[] }) => {
            if (!value || value.length === 0) return t("minRequired");
            return undefined;
          },
        }}
      >
        {(field: any) => (
          <div className="space-y-4">
            {field.state.value.map((_: unknown, index: number) => (
              <div
                key={index}
                className="p-4 rounded-xl border border-neutral-200 bg-white space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: field.state.value[index].color,
                    }}
                  />
                  {field.state.value.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = field.state.value.filter(
                          (_: unknown, i: number) => i !== index,
                        );
                        field.handleChange(next);
                      }}
                      className="text-neutral-400 hover:text-red-500 transition-colors p-1"
                      title={t("removeShiftType")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-neutral-500">
                      {t("name")}
                    </Label>
                    <Input
                      placeholder={t("namePlaceholder")}
                      value={field.state.value[index].name}
                      onChange={(e) => {
                        const next = [...field.state.value];
                        next[index] = {
                          ...next[index],
                          name: e.target.value,
                          code: e.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, "")
                            .slice(0, 10),
                        };
                        field.handleChange(next);
                      }}
                      className="bg-neutral-50 border-neutral-200 h-10 rounded-lg focus-visible:border-[#009588] focus-visible:ring-[#009588]/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-neutral-500">
                      {t("code")}
                    </Label>
                    <Input
                      placeholder={t("codePlaceholder")}
                      value={field.state.value[index].code}
                      onChange={(e) => {
                        const next = [...field.state.value];
                        next[index] = {
                          ...next[index],
                          code: e.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, "")
                            .slice(0, 10),
                        };
                        field.handleChange(next);
                      }}
                      className="bg-neutral-50 border-neutral-200 h-10 rounded-lg focus-visible:border-[#009588] focus-visible:ring-[#009588]/20 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-neutral-500">
                      {t("startTime")}
                    </Label>
                    <Input
                      type="time"
                      value={field.state.value[index].startTime}
                      onChange={(e) => {
                        const next = [...field.state.value];
                        next[index] = {
                          ...next[index],
                          startTime: e.target.value,
                        };
                        field.handleChange(next);
                      }}
                      className="bg-neutral-50 border-neutral-200 h-10 rounded-lg focus-visible:border-[#009588] focus-visible:ring-[#009588]/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-neutral-500">
                      {t("endTime")}
                    </Label>
                    <Input
                      type="time"
                      value={field.state.value[index].endTime}
                      onChange={(e) => {
                        const next = [...field.state.value];
                        next[index] = {
                          ...next[index],
                          endTime: e.target.value,
                        };
                        field.handleChange(next);
                      }}
                      className="bg-neutral-50 border-neutral-200 h-10 rounded-lg focus-visible:border-[#009588] focus-visible:ring-[#009588]/20"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-neutral-500">
                    {t("breakMinutes")}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={300}
                    value={field.state.value[index].breakMinutes ?? 0}
                    onChange={(e) => {
                      const next = [...field.state.value];
                      next[index] = {
                        ...next[index],
                        breakMinutes: Math.max(
                          0,
                          Math.min(300, parseInt(e.target.value) || 0),
                        ),
                      };
                      field.handleChange(next);
                    }}
                    className="bg-neutral-50 border-neutral-200 h-10 rounded-lg focus-visible:border-[#009588] focus-visible:ring-[#009588]/20"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-neutral-500">
                    {t("color")}
                  </Label>
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_PALETTE.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => {
                          const next = [...field.state.value];
                          next[index] = { ...next[index], color: color.value };
                          field.handleChange(next);
                        }}
                        className={`
                          w-8 h-8 rounded-lg transition-all
                          ${
                            field.state.value[index].color === color.value
                              ? "ring-2 ring-offset-2 ring-neutral-900 scale-110"
                              : "hover:scale-105"
                          }
                        `}
                        style={{ backgroundColor: color.value }}
                        title={color.label}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                field.handleChange([
                  ...field.state.value,
                  {
                    name: "",
                    code: "",
                    startTime: "08:30",
                    endTime: "18:30",
                    breakMinutes: 0,
                    color: COLOR_PALETTE[field.state.value.length % COLOR_PALETTE.length].value,
                  },
                ]);
              }}
              className="w-full border-dashed border-neutral-300 text-neutral-500 hover:border-[#009588] hover:text-[#009588] h-12 rounded-xl"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("addShiftType")}
            </Button>

            {field.state.meta.errors.length > 0 && (
              <p className="text-[11px] text-orange-600" role="alert">
                {field.state.meta.errors[0]}
              </p>
            )}
          </div>
        )}
      </form.Field>
    </div>
  );
}
