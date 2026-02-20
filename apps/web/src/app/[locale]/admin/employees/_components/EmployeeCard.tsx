"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarClock, GraduationCap, Mail, Pencil, UserCheck, UserX } from "lucide-react";

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
  onResendInvitation?: (employee: Employee) => void;
  isResendingInvitation?: boolean;
  schoolDaysDeclared?: boolean;
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
  onResendInvitation,
  isResendingInvitation,
  schoolDaysDeclared,
}: EmployeeCardProps) {
  const t = useTranslations("employees");

  return (
    <Card className={`transition-opacity ${!employee.isActive ? "opacity-60" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm"
              style={{ backgroundColor: employee.color }}
              aria-hidden="true"
            >
              {employee.firstName[0]}
              {employee.lastName[0]}
            </div>
            <div>
              <h3 className="font-bold text-neutral-900 leading-tight">
                {employee.firstName} {employee.lastName}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    employee.isActive ? "bg-emerald-500" : "bg-neutral-300"
                  }`}
                  aria-label={employee.isActive ? t("status.active") : t("status.inactive")}
                />
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">
                  {employee.isActive ? t("status.active") : t("status.inactive")}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-neutral-100"
              onClick={() => onEdit(employee)}
              aria-label={t("actions.edit")}
            >
              <Pencil className="h-4 w-4 text-neutral-500" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-neutral-100"
              onClick={() => onToggleActive(employee)}
              aria-label={employee.isActive ? t("actions.deactivate") : t("actions.activate")}
            >
              {employee.isActive ? (
                <UserX className="h-4 w-4 text-neutral-500" />
              ) : (
                <UserCheck className="h-4 w-4 text-emerald-600" />
              )}
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={JOB_TYPE_STYLES[employee.jobType] ?? ""}
          >
            {t(`jobTypes.${employee.jobType}` as Parameters<typeof t>[0])}
          </Badge>
          <Badge variant="outline" className="text-neutral-600 border-neutral-200">
            {t(`contractTypes.${employee.contractType}` as Parameters<typeof t>[0])}
          </Badge>
          <span className="text-[10px] font-bold text-neutral-400">
            {t("labels.contractHoursPerWeek", {
              hours: employee.contractHours,
            })}
          </span>
          {employee.jobType === "APPRENTICE" && schoolDaysDeclared !== undefined && (
            <Badge
              variant="outline"
              className={
                schoolDaysDeclared
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-amber-50 border-amber-200 text-amber-700"
              }
            >
              <GraduationCap className="mr-1 h-3 w-3" />
              {schoolDaysDeclared
                ? t("schoolDays.declared")
                : t("schoolDays.notDeclared")}
            </Badge>
          )}
        </div>

        {employee.email && (
          <p className="mt-3 text-xs text-neutral-500 truncate">{employee.email}</p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start rounded-xl text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50 border-neutral-200"
            onClick={() => onManageConstraints(employee)}
          >
            <CalendarClock className="mr-2 h-4 w-4 text-neutral-400" />
            {t("constraints.actions.manage")}
          </Button>

          {employee.email && onResendInvitation && (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start rounded-xl text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50 border-neutral-200"
              onClick={() => onResendInvitation(employee)}
              disabled={isResendingInvitation}
            >
              <Mail className="mr-2 h-4 w-4 text-neutral-400" />
              {t("actions.resendInvitation")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
