"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { GraduationCap, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { useEmployeeContext } from "../../_components/EmployeeContext";
import { useSchoolDays, useDeclareSchoolDays } from "../_hooks/useSchoolDays";
import { SchoolDayReminderBanner } from "./SchoolDayReminderBanner";

function getNextMonth(): { year: number; month: number; key: string } {
    const now = new Date();
    const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const month = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    return { year, month, key };
}

function getMonthLabel(year: number, month: number, locale: string): string {
    return new Date(year, month, 1).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
        month: "long",
        year: "numeric",
    });
}

export function SchoolDayCalendar() {
    const t = useTranslations("dashboard.schoolDays");
    const locale = useLocale();
    const { employeeId, jobType } = useEmployeeContext();
    const { year, month, key: monthKey } = useMemo(() => getNextMonth(), []);

    const { schoolDays, isPending: isLoading } = useSchoolDays(employeeId, monthKey);
    const { declareSchoolDays, isPending: isSubmitting } = useDeclareSchoolDays(monthKey);

    const [selectedDates, setSelectedDates] = useState<Date[]>([]);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const hasInitialized = useRef(false);

    useEffect(() => {
        if (schoolDays.length > 0 && !hasInitialized.current) {
            const dates = schoolDays.map((sd: { startDate: string | Date }) => {
                const d = typeof sd.startDate === "string" ? new Date(sd.startDate) : sd.startDate;
                return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
            });
            setSelectedDates(dates);
            setHasSubmitted(true);
            hasInitialized.current = true;
        }
    }, [schoolDays]);

    const monthStart = useMemo(() => new Date(year, month, 1), [year, month]);
    const monthEnd = useMemo(() => new Date(year, month + 1, 0), [year, month]);

    const isReminderVisible = useMemo(() => {
        const now = new Date();
        return now.getDate() >= 25 && !hasSubmitted;
    }, [hasSubmitted]);

    const monthLabel = useMemo(
        () => getMonthLabel(year, month, locale),
        [year, month, locale],
    );

    const handleSubmit = useCallback(() => {
        const dates = selectedDates.map(
            (d) =>
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        );
        declareSchoolDays({
            month: monthKey,
            dates,
            employeeId,
        });
        setHasSubmitted(true);
    }, [selectedDates, monthKey, employeeId, declareSchoolDays]);

    if (jobType !== "APPRENTICE") {
        return (
            <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-100 text-center">
                <GraduationCap className="mx-auto h-12 w-12 text-neutral-300 mb-4" />
                <p className="text-neutral-500">{t("errors.notApprentice")}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">
                    {t("title")}
                </h1>
                <p className="text-neutral-500 mt-1">{t("subtitle")}</p>
            </div>

            {/* Reminder banner */}
            {isReminderVisible && <SchoolDayReminderBanner month={monthLabel} />}

            {/* Calendar card */}
            <div className="rounded-3xl bg-white p-6 shadow-sm border border-neutral-100">
                <div className="flex items-center gap-2 mb-4">
                    <GraduationCap className="h-5 w-5 text-neutral-600" />
                    <h2 className="text-lg font-bold text-neutral-900">
                        {t("calendar.instructions", { month: monthLabel })}
                    </h2>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
                    </div>
                ) : (
                    <>
                        <div className="flex justify-center">
                            <Calendar
                                mode="multiple"
                                selected={selectedDates}
                                onSelect={(dates) => setSelectedDates(dates ?? [])}
                                month={monthStart}
                                fromDate={monthStart}
                                toDate={monthEnd}
                                disabled={[
                                    { before: monthStart },
                                    { after: monthEnd },
                                ]}
                                fixedWeeks={false}
                                classNames={{
                                    selected:
                                        "bg-neutral-100 text-neutral-600 border border-neutral-200 hover:bg-neutral-200 rounded-md",
                                }}
                                components={{
                                    DayButton: ({ day, modifiers, className, children, ...btnProps }: any) => (
                                        <button className={cn(className, modifiers?.selected ? "relative" : "")} {...btnProps}>
                                            {children}
                                            {modifiers?.selected && (
                                                <GraduationCap className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 text-neutral-400" />
                                            )}
                                        </button>
                                    ),
                                }}
                            />
                        </div>

                        {/* Selection count */}
                        <div className="mt-4 text-center">
                            <p className="text-sm text-neutral-500">
                                {t("calendar.selectedCount", { count: selectedDates.length })}
                            </p>
                        </div>

                        {/* Submit button */}
                        <div className="mt-6 flex justify-center">
                            <Button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="bg-neutral-900 hover:bg-neutral-800 text-white font-bold rounded-2xl px-8 py-3 shadow-md"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {t("submitting")}
                                    </>
                                ) : (
                                    t("submit")
                                )}
                            </Button>
                        </div>
                    </>
                )}
            </div>

            {/* Success state */}
            {hasSubmitted && selectedDates.length > 0 && (
                <div className="rounded-3xl bg-white p-6 shadow-sm border border-neutral-100">
                    <div className="flex items-center gap-3 mb-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        <h3 className="font-bold text-neutral-900">{t("success.title")}</h3>
                    </div>
                    <p className="text-sm text-neutral-500">
                        {t("success.message", { month: monthLabel })}
                    </p>
                </div>
            )}
        </div>
    );
}
