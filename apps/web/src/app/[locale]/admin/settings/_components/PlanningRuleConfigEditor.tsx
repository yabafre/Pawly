"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DAYS_OF_WEEK,
  TRACKING_PERIODS,
  type PlanningRuleCategory,
} from "@pawly/validators";
import type { ShiftTypeRecord } from "../_hooks/useClinicShiftTypes";

type Props = {
  category: PlanningRuleCategory;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  shiftTypes?: ShiftTypeRecord[];
};

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-neutral-500">{label}</Label>
      {children}
    </div>
  );
}

export function PlanningRuleConfigEditor({
  category,
  config,
  onChange,
  shiftTypes = [],
}: Props) {
  const t = useTranslations("admin.planningRules.form");

  const updateField = (key: string, value: unknown) => {
    onChange({ ...config, [key]: value });
  };

  const inputClass =
    "rounded-xl border-neutral-200 bg-white transition-all focus:border-[#009588] focus:bg-white focus:ring-1 focus:ring-[#009588]/20";
  const selectTriggerClass = "rounded-xl border-neutral-200 bg-white";

  switch (category) {
    case "STAFFING_MINIMUM":
      return (
        <div className="space-y-4 rounded-2xl border border-neutral-100 bg-neutral-50/50 p-4">
          <FieldGroup label={t("config.shiftTypeCode")}>
            {shiftTypes.length > 0 ? (
              <Select
                value={(config.shiftTypeCode as string) ?? ""}
                onValueChange={(v) => updateField("shiftTypeCode", v)}
              >
                <SelectTrigger className={selectTriggerClass}>
                  <SelectValue placeholder={t("config.selectShiftType")} />
                </SelectTrigger>
                <SelectContent>
                  {shiftTypes.map((st) => (
                    <SelectItem key={st.code} value={st.code}>
                      {st.name} ({st.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={(config.shiftTypeCode as string) ?? ""}
                onChange={(e) => updateField("shiftTypeCode", e.target.value)}
                placeholder="SURGERY"
                className={inputClass}
              />
            )}
          </FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            <FieldGroup label={t("config.minStaff")}>
              <Input
                type="number"
                min={1}
                value={(config.minStaff as number) ?? 1}
                onChange={(e) =>
                  updateField("minStaff", Number(e.target.value))
                }
                className={inputClass}
              />
            </FieldGroup>
            <FieldGroup label={t("config.jobTypes")}>
              <Input
                value={
                  Array.isArray(config.jobTypes)
                    ? (config.jobTypes as string[]).join(", ")
                    : ""
                }
                onChange={(e) =>
                  updateField(
                    "jobTypes",
                    e.target.value
                      ? e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                      : undefined,
                  )
                }
                placeholder="ASV, VET"
                className={inputClass}
              />
            </FieldGroup>
          </div>
        </div>
      );

    case "ROTATION_EQUITY":
      return (
        <div className="space-y-4 rounded-2xl border border-neutral-100 bg-neutral-50/50 p-4">
          <FieldGroup label={t("config.targetDay")}>
            <Select
              value={(config.targetDay as string) ?? "saturday"}
              onValueChange={(v) => updateField("targetDay", v)}
            >
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OF_WEEK.map((day) => (
                  <SelectItem key={day} value={day}>
                    {t(`config.days.${day}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            <FieldGroup label={t("config.maxPerPeriod")}>
              <Input
                type="number"
                min={1}
                value={(config.maxPerPeriod as number) ?? 2}
                onChange={(e) =>
                  updateField("maxPerPeriod", Number(e.target.value))
                }
                className={inputClass}
              />
            </FieldGroup>
            <FieldGroup label={t("config.trackingPeriod")}>
              <Select
                value={(config.trackingPeriod as string) ?? "monthly"}
                onValueChange={(v) => updateField("trackingPeriod", v)}
              >
                <SelectTrigger className={selectTriggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRACKING_PERIODS.map((period) => (
                    <SelectItem key={period} value={period}>
                      {t(`trackingPeriods.${period}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldGroup>
          </div>
        </div>
      );

    case "SKILL_REQUIREMENT":
      return (
        <div className="space-y-4 rounded-2xl border border-neutral-100 bg-neutral-50/50 p-4">
          <FieldGroup label={t("config.shiftTypeCode")}>
            {shiftTypes.length > 0 ? (
              <Select
                value={(config.shiftTypeCode as string) ?? ""}
                onValueChange={(v) => updateField("shiftTypeCode", v)}
              >
                <SelectTrigger className={selectTriggerClass}>
                  <SelectValue placeholder={t("config.selectShiftType")} />
                </SelectTrigger>
                <SelectContent>
                  {shiftTypes.map((st) => (
                    <SelectItem key={st.code} value={st.code}>
                      {st.name} ({st.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={(config.shiftTypeCode as string) ?? ""}
                onChange={(e) => updateField("shiftTypeCode", e.target.value)}
                placeholder="SURGERY"
                className={inputClass}
              />
            )}
          </FieldGroup>
          <FieldGroup label={t("config.requiredJobTypes")}>
            <Input
              value={
                Array.isArray(config.requiredJobTypes)
                  ? (config.requiredJobTypes as string[]).join(", ")
                  : ""
              }
              onChange={(e) =>
                updateField(
                  "requiredJobTypes",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              placeholder="VET, ASV"
              className={inputClass}
            />
          </FieldGroup>
        </div>
      );

    case "CONTRACT_COMPLIANCE":
      return (
        <div className="space-y-4 rounded-2xl border border-neutral-100 bg-neutral-50/50 p-4">
          <div className="grid grid-cols-2 gap-4">
            <FieldGroup label={t("config.maxWeeklyHours")}>
              <Input
                type="number"
                min={1}
                value={(config.maxWeeklyHours as number) ?? ""}
                onChange={(e) =>
                  updateField(
                    "maxWeeklyHours",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
                placeholder="35"
                className={inputClass}
              />
            </FieldGroup>
            <FieldGroup label={t("config.maxMonthlyHours")}>
              <Input
                type="number"
                min={1}
                value={(config.maxMonthlyHours as number) ?? ""}
                onChange={(e) =>
                  updateField(
                    "maxMonthlyHours",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
                placeholder="151"
                className={inputClass}
              />
            </FieldGroup>
          </div>
          <FieldGroup label={t("config.overtimeThresholdPercent")}>
            <Input
              type="number"
              min={0}
              max={100}
              value={(config.overtimeThresholdPercent as number) ?? ""}
              onChange={(e) =>
                updateField(
                  "overtimeThresholdPercent",
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
              placeholder="10"
              className={inputClass}
            />
          </FieldGroup>
        </div>
      );

    default:
      return null;
  }
}
