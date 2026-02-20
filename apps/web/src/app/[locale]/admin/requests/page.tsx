"use client";

import { useState } from "react";
import { CheckCircle2, Sparkles, Plane, Thermometer, GraduationCap, Baby } from "lucide-react";

const EMPLOYEES = [
    { id: 1, name: "Dr. Martin", role: "Véto Senior", avatar: "👨‍⚕️" },
    { id: 2, name: "Julie", role: "ASV Chirurgie", avatar: "👩‍⚕️" },
    { id: 3, name: "Thomas", role: "ASV Accueil", avatar: "👨‍💻" },
    { id: 4, name: "Eva", role: "Apprentie", avatar: "🎓" },
];

const REQUEST_TYPES = [
    { id: "vacation", label: "Congés Payés", icon: Plane, color: "bg-emerald-100 text-emerald-700" },
    { id: "sick", label: "Arrêt Maladie", icon: Thermometer, color: "bg-rose-100 text-rose-700" },
    { id: "school", label: "École / Formation", icon: GraduationCap, color: "bg-neutral-100 text-neutral-700" },
    { id: "child", label: "Enfant Malade", icon: Baby, color: "bg-blue-100 text-blue-700" },
];

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <div className={`bg-white rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-neutral-100 ${className}`}>
        {children}
    </div>
);

const Badge = ({ children, color = "orange" }: { children: React.ReactNode; color?: "orange" | "neutral" }) => {
    const style = color === "orange" ? "bg-orange-50 text-orange-700" : "bg-neutral-100 text-neutral-600";
    return <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${style}`}>{children}</span>;
};

export default function AdminRequestsPage() {
    const [requests, setRequests] = useState([
        { id: 101, empId: 2, type: REQUEST_TYPES[0], date: "Ven 16 Oct" },
    ]);

    const handleAction = (reqId: number) => {
        setRequests(requests.filter((req) => req.id !== reqId));
    };

    return (
        <div className="animate-in fade-in space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Demandes en attente</h1>
                    <p className="text-neutral-400">Valider ou refuser les demandes d&apos;absence</p>
                </div>
                <Badge color="orange">{requests.length} nouvelles</Badge>
            </div>

            {requests.length === 0 ? (
                <Card className="p-12 text-center text-neutral-400">
                    <Sparkles className="mx-auto mb-4 opacity-50" size={40} />
                    <p>Aucune demande en attente.</p>
                </Card>
            ) : (
                <div className="space-y-4">
                    {requests.map((req) => (
                        <Card key={req.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-start gap-4">
                                <div className="h-12 w-12 rounded-full bg-neutral-100 flex items-center justify-center text-2xl border border-neutral-200">
                                    {EMPLOYEES.find((e) => e.id === req.empId)?.avatar}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-lg">{EMPLOYEES.find((e) => e.id === req.empId)?.name}</h4>
                                        <span className="text-neutral-400 text-xs">• {req.date}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 ${req.type.color}`}>
                                            <req.type.icon size={12} /> {req.type.label}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 w-full md:w-auto">
                                <button
                                    onClick={() => handleAction(req.id)}
                                    className="flex-1 md:flex-none px-4 py-2 border border-neutral-200 rounded-xl font-bold text-neutral-500 hover:bg-neutral-50 hover:text-red-600 transition-colors"
                                >
                                    Refuser
                                </button>
                                <button
                                    onClick={() => handleAction(req.id)}
                                    className="flex-1 md:flex-none px-6 py-2 bg-neutral-900 text-white rounded-xl font-bold shadow-lg shadow-neutral-900/10 hover:bg-black transition-colors flex items-center justify-center gap-2"
                                >
                                    <CheckCircle2 size={16} />
                                    Valider
                                </button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
