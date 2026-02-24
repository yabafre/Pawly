"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminCreateAbsence } from "../_hooks/useAdminAbsences";
import { useServerActionQuery, QueryKeyFactory } from "@/lib/hooks/server-action-hooks";
import { listEmployeesAction } from "../_actions/admin-absence-actions";
import type { DateRange } from "react-day-picker";
import { fr, enUS } from "date-fns/locale";
import { ABSENCE_TYPES } from "@pawly/validators";

interface AdminAbsenceFormProps {
  open: boolean;
  onClose: () => void;
}

export function AdminAbsenceForm({ open, onClose }: AdminAbsenceFormProps) {
  const t = useTranslations("admin.absences");
  const tTypes = useTranslations("admin.absences.types");
  const locale = useLocale();
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [reason, setReason] = useState("");

  const { data: employees } = useServerActionQuery(listEmployeesAction, {
    input: undefined,
    queryKey: QueryKeyFactory.employees(),
  });

  const { createAbsence, isPending } = useAdminCreateAbsence();

  const canSubmit = selectedEmployee && selectedType && dateRange?.from && !isPending;

  const resetForm = () => {
    setSelectedEmployee("");
    setSelectedType("");
    setDateRange(undefined);
    setReason("");
  };

  const handleSubmit = () => {
    if (!selectedEmployee || !selectedType || !dateRange?.from) return;
    const endDate = dateRange.to ?? dateRange.from;

    createAbsence(
      {
        employeeId: selectedEmployee,
        type: selectedType as any,
        startDate: dateRange.from.toISOString(),
        endDate: endDate.toISOString(),
        reason: reason || undefined,
      },
      {
        onSuccess: () => {
          resetForm();
          onClose();
        },
      },
    );
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const calendarLocale = locale === "fr" ? fr : enUS;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{t("adminCreate.title")}</DialogTitle>
          <DialogDescription className="text-sm text-neutral-500">
            {t("adminCreate.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-neutral-700">
              {t("adminCreate.selectEmployee")}
            </Label>
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder={t("adminCreate.selectEmployee")} />
              </SelectTrigger>
              <SelectContent>
                {(employees ?? []).map((emp: any) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.jobType})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-neutral-700">
              {t("adminCreate.selectType")}
            </Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder={t("adminCreate.selectType")} />
              </SelectTrigger>
              <SelectContent>
                {ABSENCE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {tTypes(type as any)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-neutral-700">
              {t("list.from")} / {t("list.to")}
            </Label>
            <div className="flex justify-center">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                locale={calendarLocale}
                className="rounded-2xl border border-neutral-200"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-neutral-700">
              {t("list.reason")}
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("list.noReason")}
              rows={2}
              maxLength={500}
              className="rounded-xl resize-none"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="rounded-xl"
            >
              {t("rejectDialog.cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-xl font-bold"
            >
              {isPending ? t("adminCreate.submitting") : t("adminCreate.submit")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
