"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import {
  AlertCircle,
  AlertTriangle,
  Pencil,
  Plus,
  RefreshCw,
  Scale,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  usePlanningRules,
  type PlanningRuleRecord,
} from "../../planning/rules/_hooks/usePlanningRules";
import { PlanningRuleFormSheet } from "./PlanningRuleFormSheet";
import type { PlanningRuleCategory } from "@pawly/validators";

const CATEGORIES: PlanningRuleCategory[] = [
  "STAFFING_MINIMUM",
  "ROTATION_EQUITY",
  "SKILL_REQUIREMENT",
  "CONTRACT_COMPLIANCE",
];

export function PlanningRulesPanel() {
  const t = useTranslations("admin.planningRules");
  const { rules, isPending, error, refetch, deleteRule, isDeleting, toggleRule } =
    usePlanningRules();

  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PlanningRuleRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleEdit = (rule: PlanningRuleRecord) => {
    setEditingRule(rule);
    setFormOpen(true);
  };

  const handleCreate = () => {
    setEditingRule(null);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingRule(null);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteRule({ id: deleteTarget });
      setDeleteTarget(null);
    }
  };

  if (isPending) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-2xl border border-border bg-muted"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-border bg-card p-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
            <AlertCircle className="h-5 w-5 text-destructive" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-destructive">
            {t("errors.loadFailed")}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="mt-1 rounded-xl"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            {t("errors.retry")}
          </Button>
        </div>
      </section>
    );
  }

  const rulesByCategory = CATEGORIES.reduce(
    (acc, cat) => {
      acc[cat] = (rules as PlanningRuleRecord[]).filter((r) => r.category === cat);
      return acc;
    },
    {} as Record<PlanningRuleCategory, PlanningRuleRecord[]>,
  );

  const hasRules = (rules as PlanningRuleRecord[]).length > 0;

  return (
    <SubscriptionGate requiredTier="professional">
      {/* Add button */}
      <div className="flex justify-end mb-6">
        <Button
          onClick={handleCreate}
          className="rounded-xl"
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("actions.add")}
        </Button>
      </div>

      {!hasRules ? (
        <section className="rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center">
          <div className="flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Scale className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">
              {t("empty.title")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("empty.description")}
            </p>
            <Button
              onClick={handleCreate}
              className="mt-6 rounded-xl"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("empty.cta")}
            </Button>
          </div>
        </section>
      ) : (
        <div className="space-y-8">
          {CATEGORIES.map((category) => {
            const categoryRules = rulesByCategory[category];
            if (categoryRules.length === 0) return null;

            return (
              <div key={category}>
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t(`categories.${category}`)}
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  {categoryRules.map((rule) => (
                    <section
                      key={rule.id}
                      className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md md:p-6"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                              {rule.ruleType === "HARD" ? (
                                <AlertCircle
                                  className="h-4 w-4 text-muted-foreground"
                                  strokeWidth={1.5}
                                />
                              ) : (
                                <AlertTriangle
                                  className="h-4 w-4 text-muted-foreground"
                                  strokeWidth={1.5}
                                />
                              )}
                            </div>
                            <h3 className="truncate text-sm font-bold text-foreground">
                              {rule.name}
                            </h3>
                            <span
                              className={cn(
                                "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                rule.ruleType === "HARD"
                                  ? "border-destructive/20 bg-destructive/5 text-destructive"
                                  : "border-amber-200/60 bg-amber-50/50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-400",
                              )}
                            >
                              {t(`ruleTypes.${rule.ruleType}`)}
                            </span>
                          </div>
                          {rule.description && (
                            <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                              {rule.description}
                            </p>
                          )}
                          <p className="mt-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                            {t(`categoryDescriptions.${rule.category}`)}
                          </p>
                        </div>
                        <Switch
                          checked={rule.isActive}
                          onCheckedChange={(checked) =>
                            toggleRule({ id: rule.id, isActive: checked })
                          }
                          aria-label={t("actions.toggle")}
                        />
                      </div>

                      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(rule)}
                          className="h-7 rounded-lg px-2.5 text-xs font-medium"
                        >
                          <Pencil className="mr-1.5 h-3 w-3" />
                          {t("actions.edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(rule.id)}
                          className="h-7 rounded-lg px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="mr-1.5 h-3 w-3" />
                          {t("actions.delete")}
                        </Button>
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PlanningRuleFormSheet
        key={editingRule?.id ?? "new"}
        open={formOpen}
        onClose={handleFormClose}
        editingRule={editingRule}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirm.deleteMessage")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">
              {t("confirm.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
            >
              {t("confirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SubscriptionGate>
  );
}
