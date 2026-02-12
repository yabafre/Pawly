"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useQueryState, parseAsString, parseAsBoolean } from "nuqs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, Users } from "lucide-react";
import { JOB_TYPES } from "@pawly/validators";
import {
  useEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useToggleEmployeeActive,
  useResendInvitation,
} from "../_hooks/useEmployees";
import { EmployeeCard } from "./EmployeeCard";
import { EmployeeDialog } from "./EmployeeDialog";
import { EmployeeConstraintsPanel } from "./EmployeeConstraintsPanel";
import { EmployeeListSkeleton } from "./EmployeeListSkeleton";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobType: string;
  contractType: string;
  contractHours: number;
  color: string;
  isActive: boolean;
  hireDate: string | null;
  endDate: string | null;
};

export function EmployeeList() {
  const t = useTranslations("employees");

  // URL-synced filters via nuqs — no focus loss on keystroke
  const [search, setSearch] = useQueryState(
    "search",
    parseAsString.withDefault("").withOptions({
      shallow: true,       // don't trigger SSR
      history: "replace",  // don't pollute browser history
    }),
  );
  const [jobTypeFilter, setJobTypeFilter] = useQueryState(
    "jobType",
    parseAsString.withDefault("ALL").withOptions({
      shallow: true,
      history: "replace",
    }),
  );
  const [showInactive, setShowInactive] = useQueryState(
    "inactive",
    parseAsBoolean.withDefault(false).withOptions({
      shallow: true,
      history: "replace",
    }),
  );

  // Local UI state (not URL-worthy)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<Employee | null>(null);
  const [constraintsEmployee, setConstraintsEmployee] = useState<Employee | null>(null);

  const { employees, isPending } = useEmployees({
    includeInactive: showInactive,
    jobType: jobTypeFilter !== "ALL" ? (jobTypeFilter as "VET" | "ASV" | "APPRENTICE") : undefined,
    search: search || undefined,
  });

  const { createEmployee, isPending: isCreating } = useCreateEmployee();
  const { updateEmployee, isPending: isUpdating } = useUpdateEmployee();
  const { toggleActive, isPending: isToggling } = useToggleEmployeeActive();
  const { resendInvitation, isPending: isResending } = useResendInvitation();

  const handleCreate = useCallback(
    (data: Record<string, unknown>) => {
      createEmployee(
        data,
        { onSuccess: () => { setDialogOpen(false); setEditingEmployee(null); } },
      );
    },
    [createEmployee],
  );

  const handleUpdate = useCallback(
    (data: Record<string, unknown>) => {
      updateEmployee(
        data,
        { onSuccess: () => { setDialogOpen(false); setEditingEmployee(null); } },
      );
    },
    [updateEmployee],
  );

  const handleEdit = useCallback((employee: Employee) => {
    setEditingEmployee(employee);
    setDialogOpen(true);
  }, []);

  const handleToggleActive = useCallback((employee: Employee) => {
    setConfirmDialog(employee);
  }, []);

  const handleManageConstraints = useCallback((employee: Employee) => {
    setConstraintsEmployee(employee);
  }, []);

  const handleResendInvitation = useCallback(
    (employee: Employee) => {
      resendInvitation({ id: employee.id });
    },
    [resendInvitation],
  );

  const confirmToggle = useCallback(() => {
    if (confirmDialog) {
      toggleActive({ id: confirmDialog.id });
      setConfirmDialog(null);
    }
  }, [confirmDialog, toggleActive]);

  const handleOpenCreate = useCallback(() => {
    setEditingEmployee(null);
    setDialogOpen(true);
  }, []);

  if (isPending) {
    return <EmployeeListSkeleton />;
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            className="h-10 pl-9 focus-visible:ring-[#009588]/20"
            placeholder={t("filters.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value || null)}
          />
        </div>

        <Select value={jobTypeFilter} onValueChange={(v) => setJobTypeFilter(v === "ALL" ? null : v)}>
          <SelectTrigger className="w-[180px] h-10">
            <SelectValue placeholder={t("filters.allJobTypes")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("filters.allJobTypes")}</SelectItem>
            {JOB_TYPES.map((jt) => (
              <SelectItem key={jt} value={jt}>
                {t(`jobTypes.${jt}` as Parameters<typeof t>[0])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked || null)}
            className="rounded border-neutral-300"
          />
          {t("filters.showInactive")}
        </label>

        <Button
          onClick={handleOpenCreate}
          className="bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 h-10"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("actions.add")}
        </Button>
      </div>

      {/* Employee Grid or Empty State */}
      {employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-neutral-100 p-4 mb-4">
            <Users className="h-8 w-8 text-neutral-400" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900">{t("empty.title")}</h2>
          <p className="text-sm text-neutral-500 mt-1 max-w-sm">
            {t("empty.description")}
          </p>
          <Button
            onClick={handleOpenCreate}
            className="mt-4 bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("empty.cta")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(employees as Employee[]).map((employee) => (
            <EmployeeCard
              key={employee.id}
              employee={employee}
              onEdit={handleEdit}
              onToggleActive={handleToggleActive}
              onManageConstraints={handleManageConstraints}
              onResendInvitation={handleResendInvitation}
              isResendingInvitation={isResending}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <EmployeeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employee={editingEmployee}
        onSubmit={editingEmployee ? handleUpdate : handleCreate}
        isPending={isCreating || isUpdating}
      />

      {/* Confirmation Dialog for Toggle Active */}
      {confirmDialog && (
        <Dialog open onOpenChange={() => setConfirmDialog(null)}>
          <DialogContent className="sm:max-w-[400px] rounded-3xl">
            <DialogHeader>
              <DialogTitle>
                {confirmDialog.isActive
                  ? t("confirm.deactivateTitle")
                  : t("confirm.activateTitle")}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-neutral-600">
              {confirmDialog.isActive
                ? t("confirm.deactivateMessage")
                : t("confirm.activateMessage")}
            </p>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setConfirmDialog(null)}
                className="rounded-xl"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                onClick={confirmToggle}
                disabled={isToggling}
                className="bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800"
              >
                {confirmDialog.isActive
                  ? t("actions.deactivate")
                  : t("actions.activate")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <EmployeeConstraintsPanel
        open={!!constraintsEmployee}
        onOpenChange={(open) => {
          if (!open) setConstraintsEmployee(null);
        }}
        employee={
          constraintsEmployee
            ? {
                id: constraintsEmployee.id,
                firstName: constraintsEmployee.firstName,
                lastName: constraintsEmployee.lastName,
              }
            : null
        }
      />
    </>
  );
}
