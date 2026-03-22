"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarClock, GraduationCap, Mail, Pencil, UserCheck, UserX } from "lucide-react";
import type { Employee } from "@pawly/types";

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
  VET: "bg-muted border-border text-muted-foreground",
  ASV: "bg-muted border-border text-muted-foreground",
  APPRENTICE: "bg-muted border-border text-muted-foreground",
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
              <h3 className="font-bold text-foreground leading-tight">
                {employee.firstName} {employee.lastName}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    employee.isActive ? "bg-primary" : "bg-muted-foreground/40"
                  }`}
                  aria-label={employee.isActive ? t("status.active") : t("status.inactive")}
                />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                  {employee.isActive ? t("status.active") : t("status.inactive")}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-muted"
              onClick={() => onEdit(employee)}
              aria-label={t("actions.edit")}
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-muted"
              onClick={() => onToggleActive(employee)}
              aria-label={employee.isActive ? t("actions.deactivate") : t("actions.activate")}
            >
              {employee.isActive ? (
                <UserX className="h-4 w-4 text-muted-foreground" />
              ) : (
                <UserCheck className="h-4 w-4 text-primary" />
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
          <Badge variant="outline" className="text-muted-foreground border-border">
            {t(`contractTypes.${employee.contractType}` as Parameters<typeof t>[0])}
          </Badge>
          <span className="text-[10px] font-bold text-muted-foreground">
            {t("labels.contractHoursPerWeek", {
              hours: employee.contractHours,
            })}
          </span>
          {employee.jobType === "APPRENTICE" && schoolDaysDeclared !== undefined && (
            <Badge
              variant="outline"
              className="border-border text-muted-foreground"
            >
              <GraduationCap className="mr-1 h-3 w-3" />
              {schoolDaysDeclared
                ? t("schoolDays.declared")
                : t("schoolDays.notDeclared")}
            </Badge>
          )}
        </div>

        {employee.email && (
          <p className="mt-3 text-xs text-muted-foreground truncate">{employee.email}</p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border-border"
            onClick={() => onManageConstraints(employee)}
          >
            <CalendarClock className="mr-2 h-4 w-4 text-muted-foreground" />
            {t("constraints.actions.manage")}
          </Button>

          {employee.email && onResendInvitation && (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border-border"
              onClick={() => onResendInvitation(employee)}
              disabled={isResendingInvitation}
            >
              <Mail className="mr-2 h-4 w-4 text-muted-foreground" />
              {t("actions.resendInvitation")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
