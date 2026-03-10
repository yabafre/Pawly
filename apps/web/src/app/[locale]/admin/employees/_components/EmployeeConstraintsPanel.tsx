"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { useEmployeeConstraints } from "../_hooks/useEmployeeConstraints";
import { EmployeeConstraintForm } from "./EmployeeConstraintForm";

type EmployeeSummary = {
  id: string;
  firstName: string;
  lastName: string;
};

type ConstraintRecord = {
  id: string;
  type: "SCHOOL" | "VACATION" | "SICK" | "OTHER";
  startDate: string | Date;
  endDate: string | Date;
  reason: string | null;
  daysOfWeek: number[];
};

type EmployeeConstraintsPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeSummary | null;
};

const toDateLabel = (value: string | Date, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));

export function EmployeeConstraintsPanel({
  open,
  onOpenChange,
  employee,
}: EmployeeConstraintsPanelProps) {
  const t = useTranslations("employees");
  const locale = useLocale();
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingConstraint, setEditingConstraint] = useState<ConstraintRecord | null>(null);
  const [deletingConstraintId, setDeletingConstraintId] = useState<string | null>(null);

  const resetLocalFormState = useCallback(() => {
    setIsFormVisible(false);
    setEditingConstraint(null);
    setFormMode("create");
    setDeletingConstraintId(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetLocalFormState();
    }
  }, [open, resetLocalFormState]);

  const {
    constraints,
    isPending,
    createConstraint,
    updateConstraint,
    deleteConstraint,
    isCreating,
    isUpdating,
    isDeleting,
  } = useEmployeeConstraints(employee?.id ?? "");

  const orderedConstraints = useMemo(
    () =>
      [...constraints].sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
      ),
    [constraints],
  );

  const openCreateForm = () => {
    setFormMode("create");
    setEditingConstraint(null);
    setIsFormVisible(true);
  };

  const openEditForm = (constraint: ConstraintRecord) => {
    setFormMode("edit");
    setEditingConstraint(constraint);
    setIsFormVisible(true);
  };

  const closeForm = () => {
    resetLocalFormState();
  };

  const handleDeleteConfirm = () => {
    if (!deletingConstraintId) return;
    deleteConstraint({ id: deletingConstraintId });
    setDeletingConstraintId(null);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetLocalFormState();
    }
    onOpenChange(nextOpen);
  };

  if (!employee) return null;

  return (
    <Dialog key={employee?.id ?? "none"} open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[760px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-neutral-900">
            {t("constraints.title", {
              name: `${employee.firstName} ${employee.lastName}`,
            })}
          </DialogTitle>
          <DialogDescription>{t("constraints.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-neutral-100 bg-neutral-50/70 p-3">
            <p className="text-sm text-neutral-600">{t("constraints.subtitle")}</p>
            <Button
              onClick={openCreateForm}
              className="h-9 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t("constraints.actions.add")}
            </Button>
          </div>

          {isFormVisible && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-neutral-800">
                {formMode === "create"
                  ? t("constraints.form.createTitle")
                  : t("constraints.form.editTitle")}
              </h3>
              <EmployeeConstraintForm
                employeeId={employee.id}
                mode={formMode}
                defaultValues={
                  editingConstraint
                    ? {
                      id: editingConstraint.id,
                      type: editingConstraint.type,
                      startDate: new Date(editingConstraint.startDate).toISOString(),
                      endDate: new Date(editingConstraint.endDate).toISOString(),
                      reason: editingConstraint.reason ?? "",
                      daysOfWeek: editingConstraint.daysOfWeek,
                    }
                    : undefined
                }
                isPending={isCreating || isUpdating}
                onCancel={closeForm}
                onSubmit={(payload) => {
                  if (formMode === "edit" && editingConstraint) {
                    updateConstraint(payload);
                    closeForm();
                    return;
                  }
                  createConstraint(payload);
                  closeForm();
                }}
              />
            </div>
          )}

          {isPending ? (
            <div className="py-8 text-center text-sm text-neutral-500">
              {t("constraints.loading")}
            </div>
          ) : orderedConstraints.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-white py-10 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100">
                <CalendarClock className="h-5 w-5 text-neutral-500" />
              </div>
              <p className="text-sm font-medium text-neutral-800">
                {t("constraints.empty.title")}
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">
                {t("constraints.empty.description")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {orderedConstraints.map((constraint) => (
                <div
                  key={constraint.id}
                  className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-neutral-700">
                          {t(`constraints.types.${constraint.type}` as Parameters<typeof t>[0])}
                        </Badge>
                        <Badge variant="outline" className="text-neutral-500">
                          {constraint.daysOfWeek.length > 0
                            ? t("constraints.labels.recurring")
                            : t("constraints.labels.oneTime")}
                        </Badge>
                      </div>
                      <p className="text-sm text-neutral-700">
                        {toDateLabel(constraint.startDate, locale)} -{" "}
                        {toDateLabel(constraint.endDate, locale)}
                      </p>
                      {constraint.daysOfWeek.length > 0 && (
                        <p className="text-sm text-neutral-500">
                          {constraint.daysOfWeek
                            .map((weekday) =>
                              t(
                                `constraints.days.${weekday}` as Parameters<typeof t>[0],
                              ),
                            )
                            .join(", ")}
                        </p>
                      )}
                      {constraint.reason && (
                        <p className="text-sm text-neutral-600">{constraint.reason}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditForm(constraint)}
                        aria-label={t("constraints.actions.edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:text-red-700"
                        onClick={() => setDeletingConstraintId(constraint.id)}
                        disabled={isDeleting}
                        aria-label={t("constraints.actions.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>

      <AlertDialog
        open={!!deletingConstraintId}
        onOpenChange={(open) => { if (!open) setDeletingConstraintId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("constraints.confirm.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("constraints.confirm.deleteMessage")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("constraints.confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirm}>
              {t("constraints.confirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
