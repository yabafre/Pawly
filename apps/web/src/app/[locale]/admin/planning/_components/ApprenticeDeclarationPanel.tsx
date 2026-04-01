"use client";

import { useTranslations } from "next-intl";
import { useApprenticeDeclarations } from "../_hooks/useApprenticeDeclarations";
import type { ApprenticeDeclarationRow } from "@pawly/validators";

const statusColors: Record<ApprenticeDeclarationRow["status"], string> = {
  SCHOOL_DAYS_PROVIDED: "bg-green-100 text-green-800",
  NO_SCHOOL_THIS_MONTH: "bg-blue-100 text-blue-800",
  MISSING: "bg-destructive/10 text-destructive",
};

export function ApprenticeDeclarationPanel({ month }: { month: string }) {
  const t = useTranslations("admin.apprenticeDeclarations");
  const {
    declarations,
    isLoading,
    confirmNoSchool,
    isConfirming,
    removeDeclaration,
    isRemoving,
    allDeclared,
  } = useApprenticeDeclarations(month);

  if (isLoading) {
    return (
      <div className="rounded-xl border p-4 animate-pulse">
        <div className="h-5 bg-muted rounded w-1/3 mb-3" />
        <div className="h-4 bg-muted rounded w-2/3" />
      </div>
    );
  }

  if (declarations.length === 0) return null;

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-sm">{t("title")}</h3>
        <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
      </div>

      {allDeclared && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
          {t("allDeclared")}
        </div>
      )}

      <div className="space-y-2">
        {declarations.map((row: ApprenticeDeclarationRow) => (
          <div
            key={row.employeeId}
            className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-muted/30"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                {row.firstName} {row.lastName}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[row.status]}`}
              >
                {t(`status.${row.status}`)}
              </span>
            </div>

            <div className="flex gap-2">
              {row.status === "MISSING" && (
                <button
                  type="button"
                  onClick={() =>
                    confirmNoSchool({ employeeId: row.employeeId, month })
                  }
                  disabled={isConfirming}
                  className="text-xs px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {t("actions.confirmNoSchool")}
                </button>
              )}
              {row.status === "NO_SCHOOL_THIS_MONTH" && (
                <button
                  type="button"
                  onClick={() =>
                    removeDeclaration({ employeeId: row.employeeId, month })
                  }
                  disabled={isRemoving}
                  className="text-xs px-3 py-1 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/5 disabled:opacity-50 transition-colors"
                >
                  {t("actions.removeDeclaration")}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
