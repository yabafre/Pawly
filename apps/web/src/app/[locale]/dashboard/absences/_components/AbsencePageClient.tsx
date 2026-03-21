"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useEmployeeContext } from "../../_components/EmployeeContext";
import { AbsenceTypeSelector } from "./AbsenceTypeSelector";
import { AbsenceRequestList } from "./AbsenceRequestList";
import { AbsenceRequestForm } from "./AbsenceRequestForm";
import type { AbsenceType } from "@pawly/validators";

type Step = "list" | "type" | "dates";

export function AbsencePageClient() {
  const t = useTranslations("dashboard.absences");
  const tForm = useTranslations("dashboard.absences.form");
  const { employeeId } = useEmployeeContext();

  const [step, setStep] = useState<Step>("list");
  const [selectedType, setSelectedType] = useState<AbsenceType | null>(null);

  const reset = () => {
    setSelectedType(null);
    setStep("list");
  };

  // Step 1: List
  if (step === "list") {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <AbsenceRequestList employeeId={employeeId} />

        <Button onClick={() => setStep("type")} className="w-full">
          {t("newRequest")}
        </Button>
      </div>
    );
  }

  // Step 2: Type selection
  if (step === "type") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="w-8 h-8 flex items-center justify-center rounded-full border bg-card hover:bg-muted transition shrink-0"
          >
            <ArrowLeft size={16} strokeWidth={1.5} />
          </button>
          <h1 className="text-lg font-semibold tracking-tight">
            {tForm("selectType")}
          </h1>
        </div>

        <AbsenceTypeSelector
          selected={selectedType}
          onSelect={(type) => {
            setSelectedType(type as AbsenceType);
            setStep("dates");
          }}
        />
      </div>
    );
  }

  // Step 3: Dates + reason + submit (delegated to AbsenceRequestForm)
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setStep("type")}
          className="w-8 h-8 flex items-center justify-center rounded-full border bg-card hover:bg-muted transition shrink-0"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
        </button>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {tForm("dateRange")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {selectedType ? t(`types.${selectedType}` as any) : ""}
          </p>
        </div>
      </div>

      <AbsenceRequestForm
        employeeId={employeeId}
        preselectedType={selectedType}
        onSuccess={reset}
      />
    </div>
  );
}
