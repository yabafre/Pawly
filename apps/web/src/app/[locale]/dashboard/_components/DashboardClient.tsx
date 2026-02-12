"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
    ArrowRight,
    Briefcase,
    Calendar,
    Check,
    CheckCircle2,
    ChevronLeft,
    GraduationCap,
    Palmtree,
    Plane,
    Plus,
    Thermometer,
    Baby,
} from "lucide-react";
import { useFormattedDate } from "@/lib/hooks/useFormattedDate";
import { useFormattedNumber } from "@/lib/hooks/useFormattedNumber";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const AbsenceRequestView = ({
    onSubmit,
    onCancel,
}: {
    onSubmit: (data: { type: string; date: string }) => void;
    onCancel: () => void;
}) => {
    const t = useTranslations("dashboard");
    const { formatDate } = useFormattedDate();
    const [selectedType, setSelectedType] = useState<string | null>(null);
    // Demo date — would come from a date picker in a real implementation
    const selectedDate = new Date(2024, 9, 15); // October 15, 2024

    const REQUEST_TYPES = [
        { id: "vacation", label: t("requestTypes.vacation"), icon: Plane, color: "bg-emerald-100 text-emerald-700" },
        { id: "sick", label: t("requestTypes.sick"), icon: Thermometer, color: "bg-rose-100 text-rose-700" },
        { id: "school", label: t("requestTypes.school"), icon: GraduationCap, color: "bg-neutral-100 text-neutral-700" },
        { id: "child", label: t("requestTypes.child"), icon: Baby, color: "bg-blue-100 text-blue-700" },
    ];

    return (
        <div className="space-y-4 sm:space-y-6 animate-in slide-in-from-right duration-500">
            <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8">
                <button onClick={onCancel} className="p-1.5 sm:p-2 hover:bg-neutral-100 rounded-full">
                    <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
                <h2 className="text-xl sm:text-2xl font-bold">{t("newRequest")}</h2>
            </div>

            <div className="space-y-2">
                <label className="text-xs sm:text-sm font-bold text-neutral-400 uppercase tracking-wider ml-2">
                    {t("absenceType")}
                </label>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {REQUEST_TYPES.map((type) => (
                        <div
                            key={type.id}
                            onClick={() => setSelectedType(type.id)}
                            className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 cursor-pointer transition-all flex flex-col items-center gap-1.5 sm:gap-2 text-center ${selectedType === type.id ? "border-neutral-900 bg-neutral-50" : "border-transparent bg-white shadow-sm"}`}
                        >
                            <div className={`p-2 sm:p-3 rounded-full ${type.color}`}>
                                <type.icon className="h-5 w-5 sm:h-6 sm:w-6" />
                            </div>
                            <span className="font-bold text-xs sm:text-sm text-neutral-900">{type.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {selectedType && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-4">
                    <label className="text-xs sm:text-sm font-bold text-neutral-400 uppercase tracking-wider ml-2">
                        {t("dates")}
                    </label>
                    <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-sm border border-neutral-100 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <Calendar className="h-5 w-5 text-neutral-400 shrink-0" />
                            <span className="font-bold text-sm sm:text-base text-neutral-900 truncate">{formatDate(selectedDate, 'fullWithWeekday')}</span>
                        </div>
                        <span className="text-xs sm:text-sm text-neutral-400 shrink-0">{t("allDay")}</span>
                    </div>

                    <div className="mt-6 sm:mt-8">
                        <button
                            onClick={() => onSubmit({ type: selectedType, date: formatDate(selectedDate, 'short') })}
                            className="w-full py-3 sm:py-4 bg-neutral-900 text-white rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg shadow-lg shadow-neutral-900/20 hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                        >
                            {t("sendRequest")}
                            <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const EmployeeDashboard = ({ navigateToRequest }: { navigateToRequest: () => void }) => {
    const t = useTranslations("dashboard");
    const { formatDate, formatTime } = useFormattedDate();
    const { formatHours } = useFormattedNumber();
    const [confirmed, setConfirmed] = useState(false);

    // Demo dates — would come from real data in production
    const todayScheduleStart = new Date(2024, 9, 13, 8, 30);
    const todayScheduleEnd = new Date(2024, 9, 13, 18, 30);
    const upcomingDays = [
        { date: new Date(2024, 9, 14), type: "rest" as const, icon: Palmtree, color: "bg-neutral-100 text-neutral-500" },
        { date: new Date(2024, 9, 15), type: "surgery" as const, icon: Briefcase, color: "bg-indigo-50 text-indigo-600" },
        { date: new Date(2024, 9, 16), type: "vacation" as const, icon: Plane, color: "bg-emerald-50 text-emerald-600", status: t("validated") },
    ];

    return (
        <div className="space-y-6 sm:space-y-8 pb-8 animate-in fade-in">
            {/* Greeting */}
            <div className="flex justify-between items-center">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900">
                    {t("greeting")}
                    <br />
                    Julie
                </h2>
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-neutral-100 flex items-center justify-center border border-neutral-200 shadow-sm shrink-0">
                    <span className="text-xl sm:text-2xl">👩‍⚕️</span>
                </div>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-3">
                <Card className="p-3 sm:p-4 bg-neutral-900 text-white border-none flex flex-col justify-between h-32 sm:h-36 relative overflow-hidden group rounded-2xl">
                    <div className="absolute top-0 right-0 p-2 sm:p-3 opacity-20 group-hover:opacity-30 transition-opacity">
                        <Briefcase className="h-12 w-12 sm:h-[60px] sm:w-[60px]" />
                    </div>
                    <div className="z-10">
                        <span className="text-neutral-400 text-[10px] sm:text-xs font-bold uppercase">{t("thisWeek")}</span>
                        <div className="text-2xl sm:text-3xl font-bold mt-1">{formatHours(35)}</div>
                    </div>
                    <div className="z-10">
                        <div className="h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-400 w-full"></div>
                        </div>
                        <div className="flex justify-between mt-1 text-[10px] text-neutral-400">
                            <span>{t("targetReached")}</span>
                        </div>
                    </div>
                </Card>

                <Card onClick={navigateToRequest} className="p-3 sm:p-4 flex flex-col justify-between h-32 sm:h-36 hover:bg-neutral-50 border-dashed border-2 border-neutral-200 shadow-none cursor-pointer rounded-2xl">
                    <div className="flex justify-end">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-neutral-100 flex items-center justify-center">
                            <Plus className="h-4 w-4 sm:h-5 sm:w-5 text-neutral-600" />
                        </div>
                    </div>
                    <div>
                        <div className="font-bold text-base sm:text-lg text-neutral-900 leading-tight">
                            {t("requestAbsence")}
                        </div>
                        <div className="text-[10px] sm:text-xs text-neutral-500 mt-1">{t("absenceTypes")}</div>
                    </div>
                </Card>
            </div>

            {/* Today */}
            <div>
                <h3 className="font-bold text-base sm:text-lg mb-3 sm:mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    {t("today")}
                </h3>
                <Card className="p-4 sm:p-6 flex items-center gap-3 sm:gap-4 rounded-2xl">
                    <div className="h-10 w-10 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                        <Briefcase className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-base sm:text-xl text-neutral-900">{t("scheduleTypes.surgery")}</h4>
                        <p className="text-xs sm:text-sm text-neutral-500 truncate">{t("doctorSchedule", { doctor: "Dr. Martin", time: t("timeRange", { start: formatTime(todayScheduleStart), end: formatTime(todayScheduleEnd) }) })}</p>
                    </div>
                    {!confirmed ? (
                        <button
                            onClick={() => setConfirmed(true)}
                            className="p-2 sm:p-3 bg-neutral-100 rounded-full hover:bg-emerald-100 hover:text-emerald-600 transition-colors shrink-0"
                        >
                            <Check className="h-5 w-5 sm:h-6 sm:w-6" />
                        </button>
                    ) : (
                        <div className="p-2 sm:p-3 bg-emerald-100 text-emerald-600 rounded-full shrink-0">
                            <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
                        </div>
                    )}
                </Card>
            </div>

            {/* Upcoming days */}
            <div>
                <h3 className="font-bold text-base sm:text-lg mb-3 sm:mb-4 text-neutral-400">{t("upcomingDays")}</h3>
                <div className="space-y-2 sm:space-y-3">
                    {upcomingDays.map((item) => (
                        <div
                            key={item.date.toISOString()}
                            className="flex items-center justify-between p-3 sm:p-4 bg-white rounded-xl sm:rounded-2xl border border-neutral-100 hover:border-neutral-200 transition-colors"
                        >
                            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                                <span className="font-bold text-xs sm:text-sm w-10 sm:w-12 text-neutral-400 shrink-0">{formatDate(item.date, { weekday: 'short', day: 'numeric' })}</span>
                                <div className={`p-1.5 sm:p-2 rounded-lg ${item.color} shrink-0`}>
                                    <item.icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                                </div>
                                <span className="font-bold text-sm sm:text-base text-neutral-900 truncate">{t(`scheduleTypes.${item.type}`)}</span>
                            </div>
                            {item.status && <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 text-[10px] sm:text-xs shrink-0 ml-2">{item.status}</Badge>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const DashboardClient = () => {
    const [employeeView, setEmployeeView] = useState<"dashboard" | "request">("dashboard");

    const handleRequestSubmit = () => {
        setEmployeeView("dashboard");
    };

    return employeeView === "dashboard" ? (
        <EmployeeDashboard navigateToRequest={() => setEmployeeView("request")} />
    ) : (
        <AbsenceRequestView onSubmit={handleRequestSubmit} onCancel={() => setEmployeeView("dashboard")} />
    );
};
