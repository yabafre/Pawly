"use client";

import { useTranslations } from "next-intl";
import { useEmployeeContext } from "../../_components/EmployeeContext";
import { AbsenceRequestForm } from "./AbsenceRequestForm";
import { AbsenceRequestList } from "./AbsenceRequestList";

export function AbsencePageClient() {
  const t = useTranslations("dashboard.absences");
  const { employeeId } = useEmployeeContext();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{t("subtitle")}</p>
      </div>

      <AbsenceRequestForm employeeId={employeeId} />

      <AbsenceRequestList employeeId={employeeId} />
    </div>
  );
}
