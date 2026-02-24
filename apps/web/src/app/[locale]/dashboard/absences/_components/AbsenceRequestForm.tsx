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

interface AbsenceRequestFormProps {
  employeeId: string;
}

export function AbsenceRequestForm({ employeeId }: AbsenceRequestFormProps) {
  const t = useTranslations("dashboard.absences.form");
  const tOverlap = useTranslations("dashboard.absences.overlap");
  const locale = useLocale();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [reason, setReason] = useState("");

  const { createAbsence, isPending } = useCreateAbsenceRequest(employeeId);

  const startDateISO = dateRange?.from?.toISOString();
  const endDateISO = (dateRange?.to ?? dateRange?.from)?.toISOString();

  const { overlap } = useCheckOverlap(employeeId, startDateISO, endDateISO);

  const canSubmit = selectedType && dateRange?.from && !isPending;

  const handleSubmit = () => {
    if (!selectedType || !dateRange?.from) return;
    const endDate = dateRange.to ?? dateRange.from;

    createAbsence(
      {
        employeeId,
        type: selectedType as any,
        startDate: dateRange.from.toISOString(),
        endDate: endDate.toISOString(),
        reason: reason || undefined,
      },
      {
        onSuccess: () => {
          setSelectedType(null);
          setDateRange(undefined);
          setReason("");
        },
      },
    );
  };

  const calendarLocale = locale === "fr" ? fr : enUS;

  return (
    <div className="bg-white rounded-3xl border border-neutral-200 p-6 space-y-6 shadow-sm">
      <h2 className="text-lg font-bold text-neutral-900">{t("title")}</h2>

      <div className="space-y-2">
        <Label className="text-sm font-semibold text-neutral-700">
          {t("selectType")}
        </Label>
        <AbsenceTypeSelector selected={selectedType} onSelect={setSelectedType} />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold text-neutral-700">
          {t("dateRange")}
        </Label>
        <div className="flex justify-center">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={setDateRange}
            disabled={{ before: new Date() }}
            locale={calendarLocale}
            className="rounded-2xl border border-neutral-200"
          />
        </div>
      </div>

      {overlap.hasOverlap && (
        <div className="flex items-start gap-2 rounded-xl bg-orange-50 border border-orange-200 p-3">
          <AlertTriangle size={16} className="text-orange-500 mt-0.5 shrink-0" />
          <p className="text-sm text-orange-700">
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
        <Label className="text-sm font-semibold text-neutral-700">
          {t("reason")}
        </Label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("reasonPlaceholder")}
          rows={3}
          maxLength={500}
          className="rounded-xl resize-none"
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded-xl h-12 text-base font-bold"
      >
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </div>
  );
}
