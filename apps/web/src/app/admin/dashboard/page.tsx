import { Calendar, CheckCircle2, Users, Sparkles } from "lucide-react";

const StatCard = ({
    title,
    value,
    helper,
    icon: Icon,
    accent,
}: {
    title: string;
    value: string;
    helper: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
}) => (
    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-neutral-100 p-6 flex items-center justify-between">
        <div>
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">{title}</p>
            <div className="text-3xl font-extrabold text-neutral-900 mt-2">{value}</div>
            <p className="text-xs text-neutral-500 mt-1">{helper}</p>
        </div>
        <div className={`w-12 h-12 rounded-2xl ${accent} flex items-center justify-center`}>
            <Icon className="w-5 h-5" />
        </div>
    </div>
);

export default function AdminDashboardPage() {
    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Vue d&apos;ensemble</h1>
                    <p className="text-neutral-400">Suivi hebdomadaire et état des demandes</p>
                </div>
                <button className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-sm font-bold shadow-lg shadow-neutral-900/10 hover:bg-black transition-colors flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-yellow-300" />
                    Auto-Générer
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                    title="Planning de la semaine"
                    value="140h"
                    helper="Objectif 140h atteint"
                    icon={Calendar}
                    accent="bg-indigo-50 text-indigo-600"
                />
                <StatCard
                    title="Demandes en attente"
                    value="2"
                    helper="À valider rapidement"
                    icon={CheckCircle2}
                    accent="bg-orange-50 text-orange-600"
                />
                <StatCard
                    title="Équipe active"
                    value="12"
                    helper="Vétos & ASV"
                    icon={Users}
                    accent="bg-emerald-50 text-emerald-600"
                />
            </div>

            <div className="bg-white rounded-3xl border border-neutral-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-neutral-900">Synthèse rapide</h2>
                    <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">Semaine 42</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-neutral-600">
                    <div className="p-4 rounded-2xl bg-neutral-50">
                        Aucun conflit bloquant détecté. 2 avertissements soft à surveiller.
                    </div>
                    <div className="p-4 rounded-2xl bg-neutral-50">
                        Les apprentis ont bien renseigné leurs jours d&apos;école.
                    </div>
                </div>
            </div>
        </div>
    );
}
