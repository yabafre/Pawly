"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmployeeForm } from "./EmployeeForm";
import type { Employee } from "@pawly/types";

type EmployeeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee | null;
  onSubmit: (data: Record<string, unknown>) => void;
  isPending: boolean;
};

export function EmployeeDialog({
  open,
  onOpenChange,
  employee,
  onSubmit,
  isPending,
}: EmployeeDialogProps) {
  const t = useTranslations("employees");
  const mode = employee ? "edit" : "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">
            {mode === "create" ? t("form.createTitle") : t("form.editTitle")}
          </DialogTitle>
        </DialogHeader>
        <EmployeeForm
          mode={mode}
          defaultValues={
            employee
              ? {
                  id: employee.id,
                  firstName: employee.firstName,
                  lastName: employee.lastName,
                  email: employee.email ?? "",
                  phone: employee.phone ?? "",
                  jobType: employee.jobType,
                  contractType: employee.contractType,
                  contractHours: employee.contractHours,
                  color: employee.color,
                  hireDate: employee.hireDate ?? "",
                  endDate: employee.endDate ?? "",
                }
              : undefined
          }
          onSubmit={(data) => {
            onSubmit(data);
          }}
          isPending={isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
