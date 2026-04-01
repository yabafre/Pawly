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
import { Textarea } from "@/components/ui/textarea";
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
import { useClinicShiftTypes } from "../_hooks/useClinicShiftTypes";
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
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function PlanningRuleFormSheet({ open, onClose, editingRule }: Props) {
  const t = useTranslations("admin.planningRules");
  const { createRule, isCreating, updateRule, isUpdating } =
    usePlanningRules();
  const { shiftTypes } = useClinicShiftTypes();

  const form = useForm({
    defaultValues: {
      name: editingRule?.name ?? "",
      description: editingRule?.description ?? "",
      ruleType: (editingRule?.ruleType ?? "HARD") as PlanningRuleType,
      category: (editingRule?.category ?? "STAFFING_MINIMUM") as PlanningRuleCategory,
      isActive: editingRule?.isActive ?? true,
      priority: editingRule?.priority ?? 0,
      config: (editingRule?.config ?? DEFAULT_CONFIGS.STAFFING_MINIMUM) as Record<string, unknown>,
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

  const isBusy = isCreating || isUpdating;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-hidden p-0 gap-0 sm:max-w-xl">
        <form
          key={editingRule?.id ?? "new"}
          action={() => {
            form.handleSubmit();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* ── Header ──────────────────────────────────────────────── */}
          <div className="shrink-0 border-b border-border px-6 pb-5 pt-6 pr-12">
            <SheetTitle className="text-lg font-bold text-foreground">
              {editingRule ? t("form.editTitle") : t("form.createTitle")}
            </SheetTitle>
            <SheetDescription className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {editingRule
                ? t("form.editSubtitle")
                : t("form.createSubtitle")}
            </SheetDescription>

            {/* Active toggle pill */}
            <form.Field name="isActive">
              {(field: FieldApi) => (
                <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-muted px-3.5 py-2.5">
                  <Switch
                    checked={field.state.value}
                    onCheckedChange={(v: boolean) => field.handleChange(v)}
                  />
                  <Label className="text-sm font-medium text-muted-foreground">
                    {t("form.isActive")}
                  </Label>
                  <span
                    className={cn(
                      "ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      field.state.value
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
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
                      className="text-sm font-medium text-foreground"
                    >
                      {t("form.name")}
                    </Label>
                    <Input
                      id="rule-name"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder={t("form.namePlaceholder")}
                      className="rounded-xl border-border bg-muted transition-all focus:border-primary focus:bg-card focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="description">
                {(field: FieldApi) => (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="rule-desc"
                      className="text-sm font-medium text-foreground"
                    >
                      {t("form.description")}
                    </Label>
                    <Textarea
                      id="rule-desc"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder={t("form.descriptionPlaceholder")}
                      rows={2}
                      className="resize-none rounded-xl"
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
                                ? "border-destructive/30 bg-destructive/5 shadow-sm"
                                : "border-amber-300/40 bg-amber-50/40 shadow-sm"
                              : "border-border bg-card hover:bg-muted",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {isHard ? (
                              <ShieldAlert
                                className={cn(
                                  "h-4 w-4",
                                  isSelected
                                    ? "text-destructive"
                                    : "text-muted-foreground",
                                )}
                              />
                            ) : (
                              <AlertTriangle
                                className={cn(
                                  "h-4 w-4",
                                  isSelected
                                    ? "text-amber-600"
                                    : "text-muted-foreground",
                                )}
                              />
                            )}
                            <span className="text-sm font-semibold text-foreground">
                              {t(`ruleTypes.${rt}`)}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
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
                              ? "border-primary/30 bg-primary/5 shadow-sm"
                              : "border-border bg-card hover:bg-muted",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Icon
                              className={cn(
                                "h-4 w-4",
                                isSelected
                                  ? "text-primary"
                                  : "text-muted-foreground",
                              )}
                            />
                            <span
                              className={cn(
                                "text-sm font-semibold",
                                isSelected
                                  ? "text-primary"
                                  : "text-foreground",
                              )}
                            >
                              {t(`categories.${cat}`)}
                            </span>
                          </div>
                          <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
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
                      shiftTypes={shiftTypes}
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
                    <Label className="text-sm font-medium text-foreground">
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
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="flex h-8 w-12 items-center justify-center rounded-lg border border-border bg-card text-sm font-bold tabular-nums text-foreground">
                        {field.state.value}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          field.handleChange(
                            (field.state.value as number) + 1,
                          )
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("form.priorityHelp")}
                  </p>
                </div>
              )}
            </form.Field>
          </div>

          {/* ── Footer ──────────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-border bg-muted/50 px-6 py-4">
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
                className="rounded-xl font-semibold"
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
