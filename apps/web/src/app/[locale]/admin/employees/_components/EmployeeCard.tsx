"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, Pencil, UserCheck, UserX } from "lucide-react";

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

type EmployeeCardProps = {
  employee: Employee;
  onEdit: (employee: Employee) => void;
  onToggleActive: (employee: Employee) => void;
  onManageConstraints: (employee: Employee) => void;
};

const JOB_TYPE_STYLES: Record<string, string> = {
  VET: "bg-indigo-50 border-indigo-100 text-indigo-700",
  ASV: "bg-orange-50 border-orange-100 text-orange-700",
  APPRENTICE: "bg-neutral-100 border-neutral-200 text-neutral-600",
};

export function EmployeeCard({
  employee,
  onEdit,
  onToggleActive,
  onManageConstraints,
}: EmployeeCardProps) {
  const t = useTranslations("employees");

  return (
    <div
      className={`rounded-3xl border border-neutral-100 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-5 transition-opacity ${
        !employee.isActive ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: employee.color }}
            aria-hidden="true"
          >
            {employee.firstName[0]}
            {employee.lastName[0]}
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">
              {employee.firstName} {employee.lastName}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  employee.isActive ? "bg-green-500" : "bg-neutral-300"
                }`}
                aria-label={employee.isActive ? t("status.active") : t("status.inactive")}
              />
              <span className="text-xs text-neutral-500">
                {employee.isActive ? t("status.active") : t("status.inactive")}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(employee)}
            aria-label={t("actions.edit")}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onToggleActive(employee)}
            aria-label={employee.isActive ? t("actions.deactivate") : t("actions.activate")}
          >
            {employee.isActive ? (
              <UserX className="h-4 w-4 text-neutral-500" />
            ) : (
              <UserCheck className="h-4 w-4 text-green-600" />
            )}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={JOB_TYPE_STYLES[employee.jobType] ?? ""}
        >
          {t(`jobTypes.${employee.jobType}` as Parameters<typeof t>[0])}
        </Badge>
        <Badge variant="outline" className="text-neutral-600">
          {t(`contractTypes.${employee.contractType}` as Parameters<typeof t>[0])}
        </Badge>
        <span className="text-xs text-neutral-500">
          {t("labels.contractHoursPerWeek", {
            hours: employee.contractHours,
          })}
        </span>
      </div>

      {employee.email && (
        <p className="mt-2 text-xs text-neutral-500 truncate">{employee.email}</p>
      )}

      <Button
        variant="outline"
        size="sm"
        className="mt-3 w-full justify-start rounded-xl text-neutral-700"
        onClick={() => onManageConstraints(employee)}
      >
        <CalendarClock className="mr-2 h-4 w-4" />
        {t("constraints.actions.manage")}
      </Button>
    </div>
  );
}
