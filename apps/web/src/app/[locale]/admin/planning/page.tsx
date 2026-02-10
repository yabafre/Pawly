"use client";

import { useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Sparkles, Briefcase, Users, GraduationCap, Plane } from "lucide-react";
import { ClinicOperationalConfigPanel } from "./_components/ClinicOperationalConfigPanel";

const EMPLOYEES = [
    { id: 1, name: "Dr. Martin", role: "Véto Senior", avatar: "👨‍⚕️" },
    { id: 2, name: "Julie", role: "ASV Chirurgie", avatar: "👩‍⚕️" },
    { id: 3, name: "Thomas", role: "ASV Accueil", avatar: "👨‍💻" },
    { id: 4, name: "Eva", role: "Apprentie", avatar: "🎓" },
];

const days = ["Lun 12", "Mar 13", "Mer 14", "Jeu 15", "Ven 16", "Sam 17"];

const ShiftCell = ({ shiftType, onClick }: { shiftType: string; onClick: () => void }) => {
    let style = "bg-white border-neutral-100 text-neutral-300";
    let icon = null;

    if (shiftType === "CHIR") {
        style = "bg-indigo-50 border-indigo-100 text-indigo-700";
        icon = <Briefcase size={14} />;
    } else if (shiftType === "ACC") {
        style = "bg-orange-50 border-orange-100 text-orange-700";
        icon = <Users size={14} />;
    } else if (shiftType === "ECOLE") {
        style = "bg-neutral-100 border-neutral-200 text-neutral-600";
        icon = <GraduationCap size={14} />;
    } else if (shiftType === "VAC") {
        style = "bg-emerald-50 border-emerald-100 text-emerald-700";
        icon = <Plane size={14} />;
    }

    return (
        <div
            onClick={onClick}
            className={`h-full min-h-[60px] rounded-xl border ${style} p-2 flex flex-col justify-between transition-all hover:scale-[1.03] cursor-pointer`}
        >
            <span className="text-[10px] font-bold uppercase">{shiftType === "OFF" ? "" : shiftType}</span>
            <div className="self-end">{icon}</div>
        </div>
    );
};

export default function PlanningPage() {
    const [planning, setPlanning] = useState<Record<number, string[]>>({
        1: ["CHIR", "CHIR", "CHIR", "CHIR", "CHIR", "OFF"],
        2: ["ACC", "CHIR", "OFF", "CHIR", "ACC", "ACC"],
        3: ["CHIR", "ACC", "ACC", "OFF", "ACC", "OFF"],
        4: ["ACC", "ACC", "ACC", "ECOLE", "ECOLE", "OFF"],
    });

    const cycleShift = (empId: number, dayIdx: number) => {
        const current = planning[empId][dayIdx];
        let next = "CHIR";
        if (current === "CHIR") next = "ACC";
        else if (current === "ACC") next = "OFF";

        setPlanning((prev) => ({
            ...prev,
            [empId]: prev[empId].map((shift, idx) => (idx === dayIdx ? next : shift)),
        }));
    };

    return (
        <div className="h-full flex flex-col animate-in fade-in space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Planning</h1>
                    <p className="text-neutral-400">Semaine 42</p>
                </div>
                <div className="flex gap-2">
                    <button className="p-2 border border-neutral-200 rounded-lg hover:bg-neutral-50">
                        <ChevronLeft size={20} />
                    </button>
                    <div className="flex items-center gap-2 px-4 border border-neutral-200 rounded-lg font-bold text-sm">
                        <Calendar size={16} className="text-neutral-400" />
                        12 → 17 Oct
                    </div>
                    <button className="p-2 border border-neutral-200 rounded-lg hover:bg-neutral-50">
                        <ChevronRight size={20} />
                    </button>
                    <button className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg hover:scale-105 transition-transform">
                        <Sparkles size={16} className="text-yellow-300" />
                        Auto-Générer
                    </button>
                </div>
            </div>

            <ClinicOperationalConfigPanel />

            <div className="bg-white rounded-[1.5rem] shadow-sm border border-neutral-100 overflow-hidden">
                <div className="grid grid-cols-[180px_repeat(6,1fr)] border-b border-neutral-100 bg-neutral-50/50">
                    <div className="p-4 font-bold text-xs uppercase text-neutral-400 tracking-wider">Employé</div>
                    {days.map((d) => (
                        <div key={d} className="p-4 font-bold text-xs uppercase text-center text-neutral-900 border-l border-neutral-100">
                            {d}
                        </div>
                    ))}
                </div>

                <div className="divide-y divide-neutral-50">
                    {EMPLOYEES.map((emp) => (
                        <div key={emp.id} className="grid grid-cols-[180px_repeat(6,1fr)] hover:bg-neutral-50/30">
                            <div className="p-4 flex items-center gap-3">
                                <span className="text-xl">{emp.avatar}</span>
                                <div>
                                    <div className="font-bold text-sm">{emp.name}</div>
                                    <div className="text-[10px] text-neutral-400 uppercase font-bold">{emp.role}</div>
                                </div>
                            </div>
                            {planning[emp.id].map((shift, idx) => (
                                <div key={`${emp.id}-${idx}`} className="p-1.5 border-l border-dashed border-neutral-100">
                                    <ShiftCell shiftType={shift} onClick={() => cycleShift(emp.id, idx)} />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-3xl border border-neutral-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6">
                    <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">Heures planifiées</div>
                    <div className="text-3xl font-extrabold text-neutral-900 mt-2">140h</div>
                    <p className="text-xs text-neutral-500 mt-1">Objectif atteint</p>
                </div>
                <div className="bg-white rounded-3xl border border-neutral-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6">
                    <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">Conflits potentiels</div>
                    <div className="text-3xl font-extrabold text-neutral-900 mt-2">2</div>
                    <p className="text-xs text-neutral-500 mt-1">Mardi : 1 seul véto</p>
                </div>
                <div className="bg-white rounded-3xl border border-neutral-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6">
                    <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">Absences</div>
                    <div className="text-3xl font-extrabold text-neutral-900 mt-2">1</div>
                    <p className="text-xs text-neutral-500 mt-1">Eva (Formation)</p>
                </div>
            </div>
        </div>
    );
}
