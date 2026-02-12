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
import { Switch } from "@/components/ui/switch";
import {
  ShieldAlert,
  AlertTriangle,
  Users,
  RotateCw,
  BadgeCheck,
  ScrollText,
  Minus,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  usePlanningRules,
  type PlanningRuleRecord,
} from "../../planning/rules/_hooks/usePlanningRules";
import { PlanningRuleConfigEditor } from "./PlanningRuleConfigEditor";
import {
  PLANNING_RULE_TYPES,
  PLANNING_RULE_CATEGORIES,
  type PlanningRuleCategory,
  type PlanningRuleType,
} from "@pawly/validators";

type Props = {
  open: boolean;
  onClose: () => void;
  editingRule: PlanningRuleRecord | null;
};

type FieldApi = any;

const DEFAULT_CONFIGS: Record<PlanningRuleCategory, unknown> = {
  STAFFING_MINIMUM: { shiftTypeCode: "", minStaff: 1 },
  ROTATION_EQUITY: {
    targetDay: "saturday",
    maxPerPeriod: 2,
    trackingPeriod: "monthly",
  },
  SKILL_REQUIREMENT: { shiftTypeCode: "", requiredJobTypes: [] },
  CONTRACT_COMPLIANCE: { maxWeeklyHours: 35 },
};

const CATEGORY_ICONS: Record<
  PlanningRuleCategory,
  React.ComponentType<{ className?: string }>
> = {
  STAFFING_MINIMUM: Users,
  ROTATION_EQUITY: RotateCw,
  SKILL_REQUIREMENT: BadgeCheck,
  CONTRACT_COMPLIANCE: ScrollText,
};

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
        {label}
      </span>
      <div className="h-px flex-1 bg-neutral-200/80" />
    </div>
  );
}

export function PlanningRuleFormSheet({ open, onClose, editingRule }: Props) {
  const t = useTranslations("admin.planningRules");
  const { createRule, isCreating, updateRule, isUpdating } =
    usePlanningRules();

  const form = useForm({
    defaultValues: {
      name: "",
      description: "",
      ruleType: "HARD" as PlanningRuleType,
      category: "STAFFING_MINIMUM" as PlanningRuleCategory,
      isActive: true,
      priority: 0,
      config: DEFAULT_CONFIGS.STAFFING_MINIMUM as Record<string, unknown>,
    },
    onSubmit: async ({ value }) => {
      const payload = {
        name: value.name,
        description: value.description || undefined,
        ruleType: value.ruleType,
        category: value.category,
        isActive: value.isActive,
        priority: value.priority,
        config: value.config,
      };

      if (editingRule) {
        updateRule({ ...payload, id: editingRule.id } as any, {
          onSuccess: () => onClose(),
        });
      } else {
        createRule(payload as any, {
          onSuccess: () => onClose(),
        });
      }
    },
  });

  useEffect(() => {
    if (open && editingRule) {
      form.reset();
      form.setFieldValue("name", editingRule.name);
      form.setFieldValue("description", editingRule.description ?? "");
      form.setFieldValue("ruleType", editingRule.ruleType);
      form.setFieldValue("category", editingRule.category);
      form.setFieldValue("isActive", editingRule.isActive);
      form.setFieldValue("priority", editingRule.priority);
      form.setFieldValue(
        "config",
        editingRule.config as Record<string, unknown>,
      );
    } else if (open && !editingRule) {
      form.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- form instance is stable
  }, [open, editingRule]);

  const isBusy = isCreating || isUpdating;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-hidden p-0 gap-0 sm:max-w-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* ── Header ──────────────────────────────────────────────── */}
          <div className="shrink-0 border-b border-neutral-100 px-6 pb-5 pt-6 pr-12">
            <SheetTitle className="text-lg font-bold text-neutral-900">
              {editingRule ? t("form.editTitle") : t("form.createTitle")}
            </SheetTitle>
            <SheetDescription className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">
              {editingRule
                ? t("form.editSubtitle")
                : t("form.createSubtitle")}
            </SheetDescription>

            {/* Active toggle pill */}
            <form.Field name="isActive">
              {(field: FieldApi) => (
                <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-neutral-50 px-3.5 py-2.5">
                  <Switch
                    checked={field.state.value}
                    onCheckedChange={(v: boolean) => field.handleChange(v)}
                  />
                  <Label className="text-sm font-medium text-neutral-600">
                    {t("form.isActive")}
                  </Label>
                  <span
                    className={cn(
                      "ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      field.state.value
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-neutral-200 text-neutral-500",
                    )}
                  >
                    {field.state.value ? "ON" : "OFF"}
                  </span>
                </div>
              )}
            </form.Field>
          </div>

          {/* ── Scrollable body ─────────────────────────────────────── */}
          <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
            {/* — Name & Description — */}
            <div className="space-y-4">
              <form.Field name="name">
                {(field: FieldApi) => (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="rule-name"
                      className="text-sm font-medium text-neutral-700"
                    >
                      {t("form.name")}
                    </Label>
                    <Input
                      id="rule-name"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder={t("form.namePlaceholder")}
                      className="rounded-xl border-neutral-200 bg-neutral-50 transition-all focus:border-[#009588] focus:bg-white focus:ring-1 focus:ring-[#009588]/20"
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="description">
                {(field: FieldApi) => (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="rule-desc"
                      className="text-sm font-medium text-neutral-700"
                    >
                      {t("form.description")}
                    </Label>
                    <textarea
                      id="rule-desc"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder={t("form.descriptionPlaceholder")}
                      rows={2}
                      className="flex w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm transition-all placeholder:text-neutral-400 focus:border-[#009588] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#009588]/20"
                    />
                  </div>
                )}
              </form.Field>
            </div>

            {/* — Rule Type (card selector) — */}
            <div>
              <SectionDivider label={t("form.ruleType")} />
              <form.Field name="ruleType">
                {(field: FieldApi) => (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {PLANNING_RULE_TYPES.map((rt) => {
                      const isSelected = field.state.value === rt;
                      const isHard = rt === "HARD";
                      return (
                        <button
                          key={rt}
                          type="button"
                          onClick={() => field.handleChange(rt)}
                          className={cn(
                            "flex flex-col items-start gap-1.5 rounded-xl border-2 p-3.5 text-left transition-all",
                            isSelected
                              ? isHard
                                ? "border-rose-200 bg-rose-50/60 shadow-sm"
                                : "border-amber-200 bg-amber-50/60 shadow-sm"
                              : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {isHard ? (
                              <ShieldAlert
                                className={cn(
                                  "h-4 w-4",
                                  isSelected
                                    ? "text-rose-600"
                                    : "text-neutral-400",
                                )}
                              />
                            ) : (
                              <AlertTriangle
                                className={cn(
                                  "h-4 w-4",
                                  isSelected
                                    ? "text-amber-600"
                                    : "text-neutral-400",
                                )}
                              />
                            )}
                            <span className="text-sm font-semibold text-neutral-900">
                              {t(`ruleTypes.${rt}`)}
                            </span>
                          </div>
                          <span className="text-xs text-neutral-500">
                            {t(`form.ruleTypeHint.${rt}`)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </form.Field>
            </div>

            {/* — Category (card selector 2x2) — */}
            <div>
              <SectionDivider label={t("form.category")} />
              <form.Field name="category">
                {(field: FieldApi) => (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {PLANNING_RULE_CATEGORIES.map((cat) => {
                      const isSelected = field.state.value === cat;
                      const Icon = CATEGORY_ICONS[cat];
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            field.handleChange(cat);
                            form.setFieldValue(
                              "config",
                              DEFAULT_CONFIGS[
                                cat as PlanningRuleCategory
                              ] as Record<string, unknown>,
                            );
                          }}
                          className={cn(
                            "flex flex-col items-start gap-1 rounded-xl border-2 p-3.5 text-left transition-all",
                            isSelected
                              ? "border-[#009588]/30 bg-[#E0F2F1]/30 shadow-sm"
                              : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Icon
                              className={cn(
                                "h-4 w-4",
                                isSelected
                                  ? "text-[#009588]"
                                  : "text-neutral-400",
                              )}
                            />
                            <span
                              className={cn(
                                "text-sm font-semibold",
                                isSelected
                                  ? "text-[#009588]"
                                  : "text-neutral-700",
                              )}
                            >
                              {t(`categories.${cat}`)}
                            </span>
                          </div>
                          <span className="line-clamp-2 text-[11px] leading-snug text-neutral-500">
                            {t(`categoryDescriptions.${cat}`)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </form.Field>
            </div>

            {/* — Category-specific configuration — */}
            <div>
              <SectionDivider label={t("form.sections.config")} />
              <form.Field name="config">
                {(field: FieldApi) => (
                  <div className="mt-3">
                    <PlanningRuleConfigEditor
                      category={form.getFieldValue("category")}
                      config={field.state.value}
                      onChange={(cfg) => field.handleChange(cfg)}
                    />
                  </div>
                )}
              </form.Field>
            </div>

            {/* — Priority (stepper) — */}
            <form.Field name="priority">
              {(field: FieldApi) => (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-neutral-700">
                      {t("form.priority")}
                    </Label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          field.handleChange(
                            Math.max(0, (field.state.value as number) - 1),
                          )
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="flex h-8 w-12 items-center justify-center rounded-lg border border-neutral-200 bg-white text-sm font-bold tabular-nums text-neutral-900">
                        {field.state.value}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          field.handleChange(
                            (field.state.value as number) + 1,
                          )
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-neutral-400">
                    {t("form.priorityHelp")}
                  </p>
                </div>
              )}
            </form.Field>
          </div>

          {/* ── Footer ──────────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-neutral-100 bg-neutral-50/50 px-6 py-4">
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="rounded-xl"
              >
                {t("confirm.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isBusy}
                className="rounded-xl bg-[#009588] font-semibold text-white shadow-lg shadow-[#009588]/20 hover:bg-[#00796B] disabled:opacity-60"
              >
                {editingRule ? t("actions.edit") : t("actions.add")}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
