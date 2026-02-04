"use client";

import { useState } from "react";
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

const REQUEST_TYPES = [
    { id: "vacation", label: "Congés Payés", icon: Plane, color: "bg-emerald-100 text-emerald-700" },
    { id: "sick", label: "Arrêt Maladie", icon: Thermometer, color: "bg-rose-100 text-rose-700" },
    { id: "school", label: "École / Formation", icon: GraduationCap, color: "bg-neutral-100 text-neutral-700" },
    { id: "child", label: "Enfant Malade", icon: Baby, color: "bg-blue-100 text-blue-700" },
];

const Card = ({
    children,
    className = "",
    onClick,
}: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
}) => (
    <div
        onClick={onClick}
        className={`bg-white rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-neutral-100 ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""} ${className}`}
    >
        {children}
    </div>
);

const Badge = ({ children, color = "neutral" }: { children: React.ReactNode; color?: "neutral" | "emerald" }) => {
    const styleClass = color === "emerald" ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600";
    return (
        <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${styleClass}`}>
            {children}
        </span>
    );
};

const AbsenceRequestView = ({
    onSubmit,
    onCancel,
}: {
    onSubmit: (data: { type: string; date: string }) => void;
    onCancel: () => void;
}) => {
    const [selectedType, setSelectedType] = useState<string | null>(null);

    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-500">
            <div className="flex items-center gap-4 mb-8">
                <button onClick={onCancel} className="p-2 hover:bg-neutral-100 rounded-full">
                    <ChevronLeft size={24} />
                </button>
                <h2 className="text-2xl font-bold">Nouvelle Demande</h2>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider ml-2">Type d&apos;absence</label>
                <div className="grid grid-cols-2 gap-3">
                    {REQUEST_TYPES.map((type) => (
                        <div
                            key={type.id}
                            onClick={() => setSelectedType(type.id)}
                            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col items-center gap-2 text-center ${selectedType === type.id ? "border-neutral-900 bg-neutral-50" : "border-transparent bg-white shadow-sm"}`}
                        >
                            <div className={`p-3 rounded-full ${type.color}`}>
                                <type.icon size={24} />
                            </div>
                            <span className="font-bold text-sm text-neutral-900">{type.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {selectedType && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-4">
                    <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider ml-2">Date(s)</label>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-neutral-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Calendar className="text-neutral-400" />
                            <span className="font-bold text-neutral-900">Jeudi 15 Octobre</span>
                        </div>
                        <span className="text-sm text-neutral-400">Toute la journée</span>
                    </div>

                    <div className="mt-8">
                        <button
                            onClick={() => onSubmit({ type: selectedType, date: "Jeudi 15 Oct" })}
                            className="w-full py-4 bg-neutral-900 text-white rounded-2xl font-bold text-lg shadow-lg shadow-neutral-900/20 hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                        >
                            Envoyer la demande
                            <ArrowRight size={20} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const EmployeeDashboard = ({ navigateToRequest }: { navigateToRequest: () => void }) => {
    const [confirmed, setConfirmed] = useState(false);

    return (
        <div className="max-w-md mx-auto space-y-8 pb-20 animate-in fade-in">
            <div className="flex justify-between items-center pt-2">
                <div>
                    <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900">
                        Bonjour,
                        <br />
                        Julie
                    </h2>
                </div>
                <div className="h-14 w-14 rounded-2xl bg-neutral-100 flex items-center justify-center border border-neutral-200 shadow-sm">
                    <span className="text-2xl">👩‍⚕️</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <Card className="p-4 bg-neutral-900 text-white border-none flex flex-col justify-between h-36 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-30 transition-opacity">
                        <Briefcase size={60} />
                    </div>
                    <div className="z-10">
                        <span className="text-neutral-400 text-xs font-bold uppercase">Cette semaine</span>
                        <div className="text-3xl font-bold mt-1">35h</div>
                    </div>
                    <div className="z-10">
                        <div className="h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-400 w-full"></div>
                        </div>
                        <div className="flex justify-between mt-1 text-[10px] text-neutral-400">
                            <span>Objectif atteint ✅</span>
                        </div>
                    </div>
                </Card>

                <Card onClick={navigateToRequest} className="p-4 flex flex-col justify-between h-36 hover:bg-neutral-50 border-dashed border-2 border-neutral-200 shadow-none">
                    <div className="flex justify-end">
                        <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center">
                            <Plus size={20} className="text-neutral-600" />
                        </div>
                    </div>
                    <div>
                        <div className="font-bold text-lg text-neutral-900">
                            Demander
                            <br />
                            une absence
                        </div>
                        <div className="text-xs text-neutral-500 mt-1">Congés, Maladie...</div>
                    </div>
                </Card>
            </div>

            <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    Aujourd&apos;hui
                </h3>
                <Card className="p-6 flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                        <Briefcase size={24} />
                    </div>
                    <div className="flex-1">
                        <h4 className="font-bold text-xl text-neutral-900">Chirurgie</h4>
                        <p className="text-neutral-500">Dr. Martin • 8h30 - 18h30</p>
                    </div>
                    {!confirmed ? (
                        <button
                            onClick={() => setConfirmed(true)}
                            className="p-3 bg-neutral-100 rounded-full hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
                        >
                            <Check size={24} />
                        </button>
                    ) : (
                        <div className="p-3 bg-emerald-100 text-emerald-600 rounded-full">
                            <CheckCircle2 size={24} />
                        </div>
                    )}
                </Card>
            </div>

            <div>
                <h3 className="font-bold text-lg mb-4 text-neutral-400">Prochains Jours</h3>
                <div className="space-y-3">
                    {[
                        { d: "Mer 14", t: "Repos", i: Palmtree, c: "bg-neutral-100 text-neutral-500" },
                        { d: "Jeu 15", t: "Chirurgie", i: Briefcase, c: "bg-indigo-50 text-indigo-600" },
                        { d: "Ven 16", t: "Congés", i: Plane, c: "bg-emerald-50 text-emerald-600", status: "Validé" },
                    ].map((item) => (
                        <div
                            key={item.d}
                            className="flex items-center justify-between p-4 bg-white rounded-2xl border border-neutral-50 hover:border-neutral-200 transition-colors"
                        >
                            <div className="flex items-center gap-4">
                                <span className="font-bold text-sm w-12 text-neutral-400">{item.d}</span>
                                <div className={`p-2 rounded-lg ${item.c}`}>
                                    <item.i size={18} />
                                </div>
                                <span className="font-bold text-neutral-900">{item.t}</span>
                            </div>
                            {item.status && <Badge color="emerald">{item.status}</Badge>}
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

    return (
        <div className="min-h-screen bg-[#FDFDFD] font-sans text-neutral-900">
            <main className="max-w-5xl mx-auto p-4 md:p-6 pt-8">
                {employeeView === "dashboard" ? (
                    <EmployeeDashboard navigateToRequest={() => setEmployeeView("request")} />
                ) : (
                    <AbsenceRequestView onSubmit={handleRequestSubmit} onCancel={() => setEmployeeView("dashboard")} />
                )}
            </main>
        </div>
    );
};
