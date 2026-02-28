"use client";

import { useTranslations } from "next-intl";
import {
    Briefcase,
    CalendarOff,
    CheckCircle2,
    AlertCircle,
    Thermometer,
    Plane,
    GraduationCap,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useFormattedNumber } from "@/lib/hooks/useFormattedNumber";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, isToday, isFuture, parseISO, getISOWeek } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useLocale } from "next-intl";
import { useState, useEffect } from "react";
import { useMySchedule, useMyShiftTypes } from "../schedule/_hooks/useMySchedule";
import DashboardLoading from "../loading";
import type { EmployeeScheduleData, EmployeeShift, EmployeeUnavailability, EmployeeShiftTypeInfo } from "@pawly/types";

const UNAVAILABILITY_ICONS: Record<string, typeof Plane> = {
    VACATION: Plane,
    SICK: Thermometer,
    SCHOOL: GraduationCap,
    OTHER: CalendarOff,
};

const UNAVAILABILITY_COLORS: Record<string, string> = {
    VACATION: "bg-emerald-50 text-emerald-600",
    SICK: "bg-rose-50 text-rose-600",
    SCHOOL: "bg-purple-50 text-purple-600",
    OTHER: "bg-neutral-100 text-neutral-500",
};

const EmployeeDashboard = () => {
    const t = useTranslations("dashboard");
    const locale = useLocale();
    const dateFnsLocale = locale === "fr" ? fr : enUS;
    const { formatHours } = useFormattedNumber();
    const [isMounted, setIsMounted] = useState(false);
    const [showSplash, setShowSplash] = useState(true);

    useEffect(() => {
        setIsMounted(true);
        const hasShownSplash = sessionStorage.getItem("employeeSplashShown");
        if (hasShownSplash) {
            setShowSplash(false);
        } else {
            const timer = setTimeout(() => {
                setShowSplash(false);
                sessionStorage.setItem("employeeSplashShown", "true");
            }, 2500); // 2.5 seconds minimum display time for the animation
            return () => clearTimeout(timer);
        }
    }, []);

    const currentMonth = format(new Date(), "yyyy-MM");

    const { data: rawScheduleData, isPending } = useMySchedule(currentMonth);
    const { data: rawShiftTypes } = useMyShiftTypes();
    const scheduleData = rawScheduleData as EmployeeScheduleData | undefined;
    const shiftTypes = rawShiftTypes as EmployeeShiftTypeInfo[] | undefined;

    const allShiftTypes = (shiftTypes ?? scheduleData?.shiftTypes ?? []) as EmployeeShiftTypeInfo[];
    const shiftTypeMap = new Map<string, EmployeeShiftTypeInfo>(
        allShiftTypes.map((st) => [st.code, st]),
    );

    if (!isMounted || isPending || showSplash) {
        return <DashboardLoading />;
    }

    const employeeName = scheduleData
        ? `${scheduleData.employee.firstName}`
        : "";

    const todayShift = scheduleData?.shifts.find((s) => isToday(parseISO(s.date)));
    const todayShiftType = todayShift ? shiftTypeMap.get(todayShift.shiftTypeCode) : undefined;

    const currentWeekNumber = getISOWeek(new Date());
    const weekSummary = scheduleData?.weeklySummary.find(
        (w) => w.weekNumber === currentWeekNumber,
    );
    const weekHours = weekSummary
        ? Math.round((weekSummary.totalMinutes / 60) * 10) / 10
        : 0;
    const contractHours = scheduleData?.employee.contractHours ?? 35;
    const progressPercent = contractHours > 0
        ? Math.min(Math.round((weekHours / contractHours) * 100), 100)
        : 0;

    const upcomingEntries: Array<{
        date: string;
        type: "shift" | "unavailability";
        shift?: EmployeeShift;
        unavailability?: EmployeeUnavailability;
    }> = [];

    if (scheduleData) {
        for (const s of scheduleData.shifts) {
            if (isFuture(parseISO(s.date)) && !isToday(parseISO(s.date))) {
                upcomingEntries.push({ date: s.date, type: "shift", shift: s });
            }
        }
        for (const ua of scheduleData.unavailabilities) {
            if (isFuture(parseISO(ua.date)) && !isToday(parseISO(ua.date))) {
                upcomingEntries.push({ date: ua.date, type: "unavailability", unavailability: ua });
            }
        }
    }

    upcomingEntries.sort((a, b) => a.date.localeCompare(b.date));
    const nextDays = upcomingEntries.slice(0, 3);

    return (
        <div className="space-y-6 sm:space-y-8 pb-8 motion-safe:animate-in motion-safe:fade-in">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900">
                    {t("greeting")}
                    <br />
                    {employeeName}
                </h2>
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-neutral-100 flex items-center justify-center border border-neutral-200 shadow-sm shrink-0">
                    <span className="text-xl sm:text-2xl" aria-hidden="true">👩‍⚕️</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <Card className="p-3 sm:p-4 bg-neutral-900 text-white border-none flex flex-col justify-between h-32 sm:h-36 relative overflow-hidden group rounded-2xl">
                    <div className="absolute top-0 right-0 p-2 sm:p-3 opacity-20 group-hover:opacity-30 transition-opacity">
                        <Briefcase className="h-12 w-12 sm:h-[60px] sm:w-[60px]" />
                    </div>
                    <div className="z-10">
                        <span className="text-neutral-400 text-[10px] sm:text-xs font-bold uppercase">{t("thisWeek")}</span>
                        <div className="text-2xl sm:text-3xl font-bold mt-1">{formatHours(weekHours)}</div>
                    </div>
                    <div className="z-10">
                        <div className="h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-400 transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-1 text-[10px] text-neutral-400">
                            <span>{progressPercent >= 100 ? t("targetReached") : `${progressPercent}%`}</span>
                        </div>
                    </div>
                </Card>

                <Link href="/dashboard/absences">
                    <Card className="p-3 sm:p-4 flex flex-col justify-between h-32 sm:h-36 hover:bg-neutral-50 border-dashed border-2 border-neutral-200 shadow-none cursor-pointer rounded-2xl">
                        <div className="flex justify-end">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-neutral-100 flex items-center justify-center">
                                <CalendarOff className="h-4 w-4 sm:h-5 sm:w-5 text-neutral-600" />
                            </div>
                        </div>
                        <div>
                            <div className="font-bold text-base sm:text-lg text-neutral-900 leading-tight">
                                {t("requestAbsence")}
                            </div>
                            <div className="text-[10px] sm:text-xs text-neutral-500 mt-1">{t("absenceTypes")}</div>
                        </div>
                    </Card>
                </Link>
            </div>

            {todayShift && (
                <div>
                    <h3 className="font-bold text-base sm:text-lg mb-3 sm:mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 motion-safe:animate-pulse" />
                        {t("today")}
                    </h3>
                    <Card className="p-4 sm:p-6 flex items-center gap-3 sm:gap-4 rounded-2xl">
                        <div
                            className="h-10 w-10 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0"
                            style={{
                                backgroundColor: todayShiftType?.color ? `${todayShiftType.color}15` : "#eef2ff",
                                color: todayShiftType?.color ?? "#4f46e5",
                            }}
                        >
                            <Briefcase className="h-5 w-5 sm:h-6 sm:w-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-base sm:text-xl text-neutral-900">
                                {todayShiftType?.label ?? todayShift.shiftTypeCode}
                            </h4>
                            <p className="text-xs sm:text-sm text-neutral-500 truncate">
                                {todayShift.startTime} — {todayShift.endTime}
                            </p>
                        </div>
                        <div
                            className={`p-2 sm:p-3 rounded-full shrink-0 ${todayShift.isConfirmed
                                ? "bg-emerald-100 text-emerald-600"
                                : "bg-orange-100 text-orange-600"
                                }`}
                        >
                            {todayShift.isConfirmed ? (
                                <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
                            ) : (
                                <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6" />
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {nextDays.length > 0 && (
                <div>
                    <h3 className="font-bold text-base sm:text-lg mb-3 sm:mb-4 text-neutral-400">{t("upcomingDays")}</h3>
                    <div className="space-y-2 sm:space-y-3">
                        {nextDays.map((entry) => {
                            const dateObj = parseISO(entry.date);
                            const dayLabel = format(dateObj, "EEE d", { locale: dateFnsLocale });

                            if (entry.type === "unavailability" && entry.unavailability) {
                                const Icon = UNAVAILABILITY_ICONS[entry.unavailability.type] ?? CalendarOff;
                                const colorClass = UNAVAILABILITY_COLORS[entry.unavailability.type] ?? "bg-neutral-100 text-neutral-500";
                                return (
                                    <div
                                        key={entry.date + "-ua"}
                                        className="flex items-center justify-between p-3 sm:p-4 bg-white rounded-xl sm:rounded-2xl border border-neutral-100"
                                    >
                                        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                                            <span className="font-bold text-xs sm:text-sm w-10 sm:w-12 text-neutral-400 shrink-0 capitalize">{dayLabel}</span>
                                            <div className={`p-1.5 sm:p-2 rounded-lg ${colorClass} shrink-0`}>
                                                <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                                            </div>
                                            <span className="font-bold text-sm sm:text-base text-neutral-900 truncate">
                                                {t(`schedule.absenceTypes.${entry.unavailability.type.toLowerCase()}`)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            }

                            if (entry.type === "shift" && entry.shift) {
                                const st = shiftTypeMap.get(entry.shift.shiftTypeCode);
                                return (
                                    <div
                                        key={entry.date + "-shift"}
                                        className="flex items-center justify-between p-3 sm:p-4 bg-white rounded-xl sm:rounded-2xl border border-neutral-100"
                                    >
                                        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                                            <span className="font-bold text-xs sm:text-sm w-10 sm:w-12 text-neutral-400 shrink-0 capitalize">{dayLabel}</span>
                                            <div
                                                className="p-1.5 sm:p-2 rounded-lg shrink-0"
                                                style={{
                                                    backgroundColor: st?.color ? `${st.color}15` : "#f5f5f5",
                                                    color: st?.color ?? "#737373",
                                                }}
                                            >
                                                <Briefcase className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                                            </div>
                                            <span className="font-bold text-sm sm:text-base text-neutral-900 truncate">
                                                {st?.label ?? entry.shift.shiftTypeCode}
                                            </span>
                                        </div>
                                        <Badge variant="secondary" className="text-[10px] sm:text-xs shrink-0 ml-2">
                                            {entry.shift.startTime} — {entry.shift.endTime}
                                        </Badge>
                                    </div>
                                );
                            }

                            return null;
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export const DashboardClient = () => {
    return <EmployeeDashboard />;
};
