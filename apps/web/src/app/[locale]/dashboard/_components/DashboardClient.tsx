"use client";

import { useTranslations } from "next-intl";
import {
    Briefcase,
    CalendarOff,
    CheckCircle2,
    Thermometer,
    Plane,
    GraduationCap,
    Clock,
    ChevronRight,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useFormattedNumber } from "@/lib/hooks/useFormattedNumber";
import { format, isToday, isFuture, parseISO, getISOWeek } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useLocale } from "next-intl";
import { useState, useEffect, useMemo, useReducer, useRef, useCallback } from "react";
import { useMySchedule, useMyShiftTypes } from "../schedule/_hooks/useMySchedule";
import { useConfirmShift } from "../schedule/_hooks/useConfirmShift";
import DashboardLoading from "../loading";
import { PwaInstallPrompt } from "./PwaInstallPrompt";
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
    OTHER: "bg-muted text-muted-foreground",
};

// --- Slide to Validate ---
function SlideToValidate({ onValidate, isPending }: { onValidate: () => void; isPending: boolean }) {
    const t = useTranslations("dashboard");
    const [progress, setProgress] = useState(0);
    const [validated, setValidated] = useState(false);
    const isDragging = useRef(false);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (validated || isPending) return;
        isDragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
    }, [validated, isPending]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging.current || validated) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        let pct = (x / rect.width) * 100;
        pct = Math.max(0, Math.min(pct, 100));
        setProgress(pct);

        if (pct >= 90) {
            setValidated(true);
            setProgress(100);
            isDragging.current = false;
            onValidate();
        }
    }, [validated, onValidate]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        isDragging.current = false;
        if (!validated) setProgress(0);
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    }, [validated]);

    return (
        <div
            className={`relative h-12 rounded-full overflow-hidden flex items-center transition-colors duration-300 touch-none ${validated ? "bg-emerald-500" : "bg-foreground"}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className={`text-sm font-medium transition-opacity ${validated ? "text-white" : "text-muted-foreground"}`}>
                    {validated ? t("slideValidated") : t("slideToValidate")}
                </span>
            </div>
            <div className="absolute left-1 right-1 top-1 bottom-1 pointer-events-none">
                <div
                    className={`h-10 w-10 bg-background rounded-full flex items-center justify-center shadow-md pointer-events-auto ${validated ? "" : "cursor-grab active:cursor-grabbing"}`}
                    style={{
                        left: `${progress}%`,
                        transform: `translateX(-${progress}%)`,
                        transition: validated || progress === 0 ? "all 0.3s ease" : "none",
                        position: "relative",
                    }}
                >
                    {validated ? (
                        <CheckCircle2 size={18} className="text-emerald-500" strokeWidth={2.5} />
                    ) : (
                        <ChevronRight size={18} className="text-foreground" strokeWidth={2.5} />
                    )}
                </div>
            </div>
        </div>
    );
}

const EmployeeDashboard = () => {
    const t = useTranslations("dashboard");
    const locale = useLocale();
    const dateFnsLocale = locale === "fr" ? fr : enUS;
    const { formatHours } = useFormattedNumber();
    const [pageState, dispatch] = useReducer(
        (state: { isMounted: boolean; showSplash: boolean }, action: Partial<{ isMounted: boolean; showSplash: boolean }>) => ({ ...state, ...action }),
        { isMounted: false, showSplash: true }
    );

    useEffect(() => {
        const hasShownSplash = sessionStorage.getItem("employeeSplashShown");
        if (hasShownSplash) {
            dispatch({ isMounted: true, showSplash: false });
        } else {
            dispatch({ isMounted: true });
            const timer = setTimeout(() => {
                dispatch({ isMounted: true, showSplash: false });
                sessionStorage.setItem("employeeSplashShown", "true");
            }, 2500);
            return () => clearTimeout(timer);
        }
    }, []);

    const currentMonth = useMemo(() => format(new Date(), "yyyy-MM"), []);

    const { data: rawScheduleData, isPending } = useMySchedule(currentMonth);
    const { data: rawShiftTypes } = useMyShiftTypes();
    const { confirmShift, isConfirmPending } = useConfirmShift(currentMonth);
    const scheduleData = rawScheduleData as EmployeeScheduleData | undefined;
    const shiftTypes = rawShiftTypes as EmployeeShiftTypeInfo[] | undefined;

    const shiftTypeMap = useMemo(() => {
        const types = (shiftTypes ?? scheduleData?.shiftTypes ?? []) as EmployeeShiftTypeInfo[];
        return new Map(types.map((st) => [st.code, st]));
    }, [shiftTypes, scheduleData?.shiftTypes]);

    if (!pageState.isMounted || isPending || pageState.showSplash) {
        return <DashboardLoading />;
    }

    const employeeName = scheduleData ? scheduleData.employee.firstName : "";

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
        <div className="space-y-6 pb-8">
            {/* Greeting */}
            <div className="pt-2">
                <p className="text-xs text-muted-foreground font-medium mb-1">{t("overview")}</p>
                <h2 className="text-3xl font-semibold tracking-tight leading-tight">
                    {t("greeting")}{" "}
                    {employeeName}
                </h2>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
                {/* Weekly hours */}
                <div className="bg-card rounded-3xl p-5 border flex flex-col justify-between h-40">
                    <div>
                        <p className="text-xs text-muted-foreground font-medium mb-1">{t("thisWeek")}</p>
                        <p className="text-3xl font-semibold tracking-tight leading-none">
                            {formatHours(weekHours)}
                        </p>
                    </div>
                    <div>
                        <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden mb-2">
                            <div
                                className="bg-primary h-full rounded-full transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${progressPercent >= 100 ? "bg-emerald-500" : "bg-primary"}`} />
                            <p className="text-[11px] font-medium">
                                {progressPercent >= 100 ? t("targetReached") : `${progressPercent}%`}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Request absence */}
                <Link href="/dashboard/absences">
                    <div className="bg-card rounded-3xl p-5 border flex flex-col justify-between h-40 hover:shadow-md transition-shadow cursor-pointer">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                            <CalendarOff size={18} strokeWidth={1.5} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-base leading-snug mb-0.5">{t("requestAbsence")}</h3>
                            <p className="text-xs text-muted-foreground">{t("absenceTypes")}</p>
                        </div>
                    </div>
                </Link>
            </div>

            {/* Today's shift */}
            {todayShift && (
                <div>
                    <h3 className="text-lg font-semibold mb-3 tracking-tight">{t("today")}</h3>
                    <div className="bg-card rounded-3xl p-5 border">
                        <div className={`flex justify-between items-start ${!todayShift.isConfirmed ? "mb-5" : ""}`}>
                            <div className="flex gap-3">
                                <div
                                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                                    style={{
                                        backgroundColor: todayShiftType?.color ? `${todayShiftType.color}15` : "var(--muted)",
                                        color: todayShiftType?.color ?? "var(--muted-foreground)",
                                    }}
                                >
                                    <Briefcase size={22} strokeWidth={1.5} />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-base tracking-tight mb-0.5">
                                        {todayShiftType?.label ?? todayShift.shiftTypeCode}
                                    </h4>
                                    <div className="flex items-center text-sm text-muted-foreground">
                                        <Clock size={14} strokeWidth={1.5} className="mr-1.5 opacity-50" />
                                        {todayShift.startTime} — {todayShift.endTime}
                                    </div>
                                </div>
                            </div>
                            <div className={`px-2.5 py-1 rounded-full text-[11px] font-medium border flex items-center gap-1.5 ${
                                todayShift.isConfirmed
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                    : "bg-card text-foreground border-border"
                            }`}>
                                {!todayShift.isConfirmed && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                {todayShift.isConfirmed ? t("confirmed") : t("inProgress")}
                            </div>
                        </div>

                        {!todayShift.isConfirmed && (
                            <SlideToValidate
                                onValidate={() => confirmShift({ shiftId: todayShift.id })}
                                isPending={isConfirmPending}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Upcoming */}
            {nextDays.length > 0 && (
                <div>
                    <h3 className="text-lg font-semibold mb-3 tracking-tight">{t("upcomingDays")}</h3>
                    <div className="space-y-2">
                        {nextDays.map((entry) => {
                            const dateObj = parseISO(entry.date);
                            const dayName = format(dateObj, "EEE", { locale: dateFnsLocale });
                            const dayNum = format(dateObj, "d");

                            if (entry.type === "unavailability" && entry.unavailability) {
                                const Icon = UNAVAILABILITY_ICONS[entry.unavailability.type] ?? CalendarOff;
                                const colorClass = UNAVAILABILITY_COLORS[entry.unavailability.type] ?? "bg-muted text-muted-foreground";
                                return (
                                    <div
                                        key={entry.date + "-ua"}
                                        className="bg-card rounded-2xl p-4 border flex items-center gap-4"
                                    >
                                        <div className="bg-muted rounded-xl p-3 text-center min-w-[52px] border">
                                            <p className="text-[11px] text-muted-foreground font-medium uppercase">{dayName}</p>
                                            <p className="text-lg font-semibold leading-none">{dayNum}</p>
                                        </div>
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`p-2 rounded-lg shrink-0 ${colorClass}`}>
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            <span className="font-semibold text-sm truncate">
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
                                        className="bg-card rounded-2xl p-4 border flex items-center gap-4"
                                    >
                                        <div className="bg-muted rounded-xl p-3 text-center min-w-[52px] border">
                                            <p className="text-[11px] text-muted-foreground font-medium uppercase">{dayName}</p>
                                            <p className="text-lg font-semibold leading-none">{dayNum}</p>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-sm">{st?.label ?? entry.shift.shiftTypeCode}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {entry.shift.startTime} — {entry.shift.endTime}
                                            </p>
                                        </div>
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
    return (
        <>
            <PwaInstallPrompt />
            <EmployeeDashboard />
        </>
    );
};
