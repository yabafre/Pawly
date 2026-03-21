"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { AlertTriangle } from "lucide-react";
import { AbsenceTypeSelector } from "./AbsenceTypeSelector";
import { useCreateAbsenceRequest, useCheckOverlap } from "../_hooks/useAbsences";
import type { DateRange } from "react-day-picker";
import { useLocale } from "next-intl";
import { fr, enUS } from "date-fns/locale";
import type { AbsenceType } from "@pawly/validators";

interface AbsenceRequestFormProps {
  employeeId: string;
  onSuccess?: () => void;
  preselectedType?: AbsenceType | null;
}

export function AbsenceRequestForm({ employeeId, onSuccess, preselectedType }: AbsenceRequestFormProps) {
  const t = useTranslations("dashboard.absences.form");
  const tOverlap = useTranslations("dashboard.absences.overlap");
  const locale = useLocale();
  const [selectedType, setSelectedType] = useState<AbsenceType | null>(preselectedType ?? null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [reason, setReason] = useState("");

  const { createAbsence, isPending } = useCreateAbsenceRequest(employeeId);

  const startDateISO = dateRange?.from?.toISOString();
  const endDateISO = (dateRange?.to ?? dateRange?.from)?.toISOString();

  const { overlap } = useCheckOverlap(employeeId, startDateISO, endDateISO);

  const canSubmit = selectedType && dateRange?.from && !isPending && !overlap.hasOverlap;

  const handleSubmit = () => {
    if (!selectedType || !dateRange?.from) return;
    const endDate = dateRange.to ?? dateRange.from;

    createAbsence(
      {
        employeeId,
        type: selectedType,
        startDate: dateRange.from.toISOString(),
        endDate: endDate.toISOString(),
        reason: reason || undefined,
      },
      {
        onSuccess: () => {
          setSelectedType(null);
          setDateRange(undefined);
          setReason("");
          onSuccess?.();
        },
      },
    );
  };

  const calendarLocale = locale === "fr" ? fr : enUS;

  return (
    <div className="rounded-2xl border bg-card p-5 space-y-5">
      <h2 className="text-sm font-semibold">{t("title")}</h2>

      {!preselectedType && (
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">
            {t("selectType")}
          </Label>
          <AbsenceTypeSelector selected={selectedType} onSelect={(t) => setSelectedType(t as AbsenceType)} />
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          {t("dateRange")}
        </Label>
        <div className="flex justify-center">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={setDateRange}
            disabled={{ before: new Date() }}
            locale={calendarLocale}
          />
        </div>
      </div>

      {overlap.hasOverlap && (
        <div className="flex items-start gap-2 rounded-2xl border bg-card p-3">
          <AlertTriangle size={14} className="text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            {tOverlap("warning", {
              startDate: overlap.overlappingAbsences[0]?.startDate
                ? new Date(overlap.overlappingAbsences[0].startDate).toLocaleDateString(locale)
                : overlap.overlappingUnavailabilities[0]?.startDate
                  ? new Date(overlap.overlappingUnavailabilities[0].startDate).toLocaleDateString(locale)
                  : "",
              endDate: overlap.overlappingAbsences[0]?.endDate
                ? new Date(overlap.overlappingAbsences[0].endDate).toLocaleDateString(locale)
                : overlap.overlappingUnavailabilities[0]?.endDate
                  ? new Date(overlap.overlappingUnavailabilities[0].endDate).toLocaleDateString(locale)
                  : "",
            })}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">
          {t("reason")}
        </Label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("reasonPlaceholder")}
          rows={2}
          maxLength={500}
          className="resize-none"
        />
      </div>

      <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full">
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </div>
  );
}
