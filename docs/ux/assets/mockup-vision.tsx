import React, { useState, useEffect } from 'react';
import {
    Calendar,
    CheckCircle2,
    AlertCircle,
    Clock,
    Users,
    ChevronLeft,
    ChevronRight,
    Briefcase,
    Coffee,
    GraduationCap,
    Palmtree,
    ArrowRight,
    Menu,
    Bell,
    PawPrint,
    Sparkles,
    Loader2,
    Plus,
    X,
    Check,
    Plane,
    Thermometer,
    Baby,
    FileText,
    Filter,
    MoreHorizontal
} from 'lucide-react';

// --- DATA & CONFIG ---

const COLORS = {
    primary: "bg-indigo-600",
    primaryText: "text-indigo-600",
    primaryLight: "bg-indigo-50",
    secondary: "bg-orange-500",
    secondaryText: "text-orange-500",
    secondaryLight: "bg-orange-50",
    success: "bg-emerald-500",
    neutral: "bg-neutral-900",
};

// Mock Initial Data
const EMPLOYEES = [
    { id: 1, name: "Dr. Martin", role: "Véto Senior", type: "vet", contract: 40, avatar: "👨‍⚕️" },
    { id: 2, name: "Julie", role: "ASV Chirurgie", type: "asv1", contract: 35, avatar: "👩‍⚕️" },
    { id: 3, name: "Thomas", role: "ASV Accueil", type: "asv2", contract: 35, avatar: "👨‍💻" },
    { id: 4, name: "Eva", role: "Apprentie", type: "appr", contract: 35, trainingDays: [3, 4], avatar: "🎓" },
];

const SHIFTS = {
    CHIR: { label: "Chirurgie", hours: "8h30 - 18h30", color: "indigo", short: "CHIR", icon: Briefcase },
    ACC: { label: "Accueil", hours: "9h00 - 19h30", color: "orange", short: "ACC", icon: Users },
    OFF: { label: "Repos", hours: "-", color: "gray", short: "OFF", icon: Palmtree },
    FORM: { label: "Formation", hours: "École", color: "neutral", short: "ECOLE", icon: GraduationCap },
    SICK: { label: "Maladie", hours: "-", color: "rose", short: "MAL", icon: Thermometer },
    VAC: { label: "Congés", hours: "-", color: "emerald", short: "CONG", icon: Plane },
};

const REQUEST_TYPES = [
    { id: 'vacation', label: "Congés Payés", icon: Plane, color: "bg-emerald-100 text-emerald-700" },
    { id: 'sick', label: "Arrêt Maladie", icon: Thermometer, color: "bg-rose-100 text-rose-700" },
    { id: 'school', label: "École / Formation", icon: GraduationCap, color: "bg-neutral-100 text-neutral-700" },
    { id: 'child', label: "Enfant Malade", icon: Baby, color: "bg-blue-100 text-blue-700" },
];

// --- COMPONENTS ---

const Card = ({ children, className = "", onClick }) => (
    <div
        onClick={onClick}
        className={`bg-white rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-neutral-100 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} ${className}`}
    >
        {children}
    </div>
);

const Badge = ({ children, color = "neutral", className = "" }) => {
    let styleClass = "bg-neutral-100 text-neutral-600";
    if (color === 'indigo') styleClass = "bg-indigo-50 text-indigo-700";
    if (color === 'orange') styleClass = "bg-orange-50 text-orange-700";
    if (color === 'emerald') styleClass = "bg-emerald-50 text-emerald-700";
    if (color === 'rose') styleClass = "bg-rose-50 text-rose-700";

    return (
        <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${styleClass} ${className}`}>
            {children}
        </span>
    );
};

const TabButton = ({ active, onClick, icon: Icon, label }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${active ? 'bg-neutral-900 text-white shadow-md' : 'text-neutral-500 hover:bg-neutral-100'}`}
    >
        <Icon size={16} />
        {label}
    </button>
);

// --- EMPLOYEE - ABSENCE REQUEST VIEW ---

const AbsenceRequestView = ({ onSubmit, onCancel }) => {
    const [selectedType, setSelectedType] = useState(null);
    const [selectedDate, setSelectedDate] = useState("Demain");

    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-500">
            <div className="flex items-center gap-4 mb-8">
                <button onClick={onCancel} className="p-2 hover:bg-neutral-100 rounded-full">
                    <ChevronLeft size={24} />
                </button>
                <h2 className="text-2xl font-bold">Nouvelle Demande</h2>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-bold text-neutral-400 uppercase tracking-wider ml-2">Type d'absence</label>
                <div className="grid grid-cols-2 gap-3">
                    {REQUEST_TYPES.map((type) => (
                        <div
                            key={type.id}
                            onClick={() => setSelectedType(type.id)}
                            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col items-center gap-2 text-center ${selectedType === type.id ? 'border-neutral-900 bg-neutral-50' : 'border-transparent bg-white shadow-sm'}`}
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
                            onClick={() => onSubmit({ type: selectedType, date: 'Jeudi 15 Oct' })}
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

// --- EMPLOYEE DASHBOARD ---

const EmployeeDashboard = ({ navigateToRequest }) => {
    const [confirmed, setConfirmed] = useState(false);

    return (
        <div className="max-w-md mx-auto space-y-8 pb-20 animate-in fade-in">
            {/* Header */}
            <div className="flex justify-between items-center pt-2">
                <div>
                    <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900">Bonjour,<br />Julie</h2>
                </div>
                <div className="h-14 w-14 rounded-2xl bg-neutral-100 flex items-center justify-center border border-neutral-200 shadow-sm">
                    <span className="text-2xl">👩‍⚕️</span>
                </div>
            </div>

            {/* Main Stats with Shortcuts */}
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
                        <div className="font-bold text-lg text-neutral-900">Demander<br />une absence</div>
                        <div className="text-xs text-neutral-500 mt-1">Congés, Maladie...</div>
                    </div>
                </Card>
            </div>

            {/* Today's Shift */}
            <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    Aujourd'hui
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
                        <button onClick={() => setConfirmed(true)} className="p-3 bg-neutral-100 rounded-full hover:bg-emerald-100 hover:text-emerald-600 transition-colors">
                            <Check size={24} />
                        </button>
                    ) : (
                        <div className="p-3 bg-emerald-100 text-emerald-600 rounded-full">
                            <CheckCircle2 size={24} />
                        </div>
                    )}
                </Card>
            </div>

            {/* Upcoming */}
            <div>
                <h3 className="font-bold text-lg mb-4 text-neutral-400">Prochains Jours</h3>
                <div className="space-y-3">
                    {[
                        { d: "Mer 14", t: "Repos", i: Palmtree, c: "bg-neutral-100 text-neutral-500" },
                        { d: "Jeu 15", t: "Chirurgie", i: Briefcase, c: "bg-indigo-50 text-indigo-600" },
                        { d: "Ven 16", t: "Congés", i: Plane, c: "bg-emerald-50 text-emerald-600", status: "Validé" }
                    ].map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-neutral-50 hover:border-neutral-200 transition-colors">
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

// --- ADMIN - REQUESTS MANAGEMENT ---

const AdminRequests = ({ requests, onAction }) => {
    return (
        <div className="animate-in fade-in">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Demandes en attente</h2>
                <Badge color="orange">{requests.length} nouvelles</Badge>
            </div>

            <div className="space-y-4">
                {requests.length === 0 && (
                    <div className="text-center py-20 text-neutral-400">
                        <Sparkles className="mx-auto mb-4 opacity-50" size={40} />
                        <p>Aucune demande en attente.</p>
                    </div>
                )}

                {requests.map((req) => (
                    <Card key={req.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                            <div className="h-12 w-12 rounded-full bg-neutral-100 flex items-center justify-center text-2xl border border-neutral-200">
                                {EMPLOYEES.find(e => e.id === req.empId)?.avatar}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-lg">{EMPLOYEES.find(e => e.id === req.empId)?.name}</h4>
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
                                onClick={() => onAction(req.id, 'reject')}
                                className="flex-1 md:flex-none px-4 py-2 border border-neutral-200 rounded-xl font-bold text-neutral-500 hover:bg-neutral-50 hover:text-red-600 transition-colors"
                            >
                                Refuser
                            </button>
                            <button
                                onClick={() => onAction(req.id, 'approve')}
                                className="flex-1 md:flex-none px-6 py-2 bg-neutral-900 text-white rounded-xl font-bold shadow-lg shadow-neutral-900/10 hover:bg-black transition-colors"
                            >
                                Valider
                            </button>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

// --- ADMIN - PLANNING EDITOR ---

const ShiftCell = ({ shiftType, onClick }) => {
    let style = "bg-white border-neutral-100 text-neutral-300";
    let icon = null;

    if (shiftType === 'CHIR') {
        style = "bg-indigo-50 border-indigo-100 text-indigo-700";
        icon = <Briefcase size={14} />;
    } else if (shiftType === 'ACC') {
        style = "bg-orange-50 border-orange-100 text-orange-700";
        icon = <Users size={14} />;
    } else if (shiftType === 'ECOLE') {
        style = "bg-neutral-100 border-neutral-200 text-neutral-600";
        icon = <GraduationCap size={14} />;
    } else if (shiftType === 'VAC') {
        style = "bg-emerald-50 border-emerald-100 text-emerald-700";
        icon = <Plane size={14} />;
    }

    return (
        <div onClick={onClick} className={`h-full min-h-[60px] rounded-xl border ${style} p-2 flex flex-col justify-between transition-all hover:scale-[1.05] cursor-pointer`}>
            <span className="text-[10px] font-bold uppercase">{shiftType === 'OFF' ? '' : shiftType}</span>
            <div className="self-end">{icon}</div>
        </div>
    );
};

const AdminPlanning = ({ planningData, onCellClick }) => {
    const days = ["Lun 12", "Mar 13", "Mer 14", "Jeu 15", "Ven 16", "Sam 17"];

    return (
        <div className="h-full flex flex-col animate-in fade-in">
            {/* Toolbar */}
            <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2">
                    <button className="p-2 border border-neutral-200 rounded-lg hover:bg-neutral-50"><ChevronLeft size={20} /></button>
                    <div className="flex items-center gap-2 px-4 border border-neutral-200 rounded-lg font-bold text-sm">
                        <Calendar size={16} className="text-neutral-400" />
                        Semaine 42
                    </div>
                    <button className="p-2 border border-neutral-200 rounded-lg hover:bg-neutral-50"><ChevronRight size={20} /></button>
                </div>
                <div className="flex gap-2">
                    <button className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg hover:scale-105 transition-transform">
                        <Sparkles size={16} className="text-yellow-300" />
                        Auto-Générer
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div className="bg-white rounded-[1.5rem] shadow-sm border border-neutral-100 overflow-hidden">
                <div className="grid grid-cols-[180px_repeat(6,1fr)] border-b border-neutral-100 bg-neutral-50/50">
                    <div className="p-4 font-bold text-xs uppercase text-neutral-400 tracking-wider">Employé</div>
                    {days.map(d => <div key={d} className="p-4 font-bold text-xs uppercase text-center text-neutral-900 border-l border-neutral-100">{d}</div>)}
                </div>

                <div className="divide-y divide-neutral-50">
                    {EMPLOYEES.map(emp => (
                        <div key={emp.id} className="grid grid-cols-[180px_repeat(6,1fr)] hover:bg-neutral-50/30">
                            <div className="p-4 flex items-center gap-3">
                                <span className="text-xl">{emp.avatar}</span>
                                <div>
                                    <div className="font-bold text-sm">{emp.name}</div>
                                    <div className="text-[10px] text-neutral-400 uppercase font-bold">{emp.role}</div>
                                </div>
                            </div>
                            {planningData[emp.id]?.map((shift, idx) => (
                                <div key={idx} className="p-1.5 border-l border-dashed border-neutral-100">
                                    <ShiftCell shiftType={shift} onClick={() => onCellClick(emp.id, idx)} />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- MAIN LAYOUT & APP ---

export default function App() {
    const [loading, setLoading] = useState(false); // Skip splash for dev speed
    const [role, setRole] = useState('employee'); // 'admin' | 'employee'

    // Navigation State
    const [adminView, setAdminView] = useState('dashboard'); // 'dashboard' | 'planning' | 'requests'
    const [employeeView, setEmployeeView] = useState('dashboard'); // 'dashboard' | 'request'

    // Data State
    const [requests, setRequests] = useState([
        { id: 101, empId: 2, type: REQUEST_TYPES[0], date: "Ven 16 Oct" }, // Julie vacation
    ]);

    const [planning, setPlanning] = useState({
        1: ['CHIR', 'CHIR', 'CHIR', 'CHIR', 'CHIR', 'OFF'],
        2: ['ACC', 'CHIR', 'OFF', 'CHIR', 'ACC', 'ACC'], // Julie
        3: ['CHIR', 'ACC', 'ACC', 'OFF', 'ACC', 'OFF'],
        4: ['ACC', 'ACC', 'ACC', 'ECOLE', 'ECOLE', 'OFF'],
    });

    // Handlers
    const handleRequestSubmit = (data) => {
        // Simulate API Call
        const newReq = {
            id: Date.now(),
            empId: 2, // Hardcoded as Julie for demo
            type: REQUEST_TYPES.find(t => t.id === data.type),
            date: data.date
        };
        setRequests([...requests, newReq]);
        setEmployeeView('dashboard');
        // Show toast notification here ideally
    };

    const handleAdminAction = (reqId, action) => {
        if (action === 'approve') {
            // Find request
            const req = requests.find(r => r.id === reqId);
            // Auto-update planning (Simulated logic: set Friday (index 4) to VAC)
            if (req && req.empId === 2) {
                const newPlanning = { ...planning };
                newPlanning[2][4] = 'VAC'; // Force VAC on Friday for Julie
                setPlanning(newPlanning);
            }
        }
        setRequests(requests.filter(r => r.id !== reqId));
    };

    const cycleShift = (empId, dayIdx) => {
        // Simple cycle for demo: CHIR -> ACC -> OFF -> CHIR
        const current = planning[empId][dayIdx];
        let next = 'CHIR';
        if (current === 'CHIR') next = 'ACC';
        else if (current === 'ACC') next = 'OFF';

        const newPlanning = { ...planning };
        newPlanning[empId][dayIdx] = next;
        setPlanning(newPlanning);
    };

    return (
        <div className="min-h-screen bg-[#FDFDFD] font-sans text-neutral-900 selection:bg-indigo-100">

            {/* Top Navbar */}
            <nav className="sticky top-0 z-50 w-full bg-[#FDFDFD]/90 backdrop-blur-xl border-b border-neutral-100">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-neutral-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-neutral-900/10">
                            <PawPrint size={18} />
                        </div>
                        <span className="font-extrabold text-lg tracking-tight">MiniLucca</span>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Role Toggles */}
                        <div className="flex bg-neutral-100 p-1 rounded-xl">
                            <button
                                onClick={() => setRole('admin')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${role === 'admin' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-400'}`}
                            >
                                Admin
                            </button>
                            <button
                                onClick={() => setRole('employee')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${role === 'employee' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-400'}`}
                            >
                                Employé
                            </button>
                        </div>

                        <div className="h-6 w-[1px] bg-neutral-200"></div>

                        <button className="relative p-2 text-neutral-400 hover:text-neutral-900 transition-colors">
                            <Bell size={20} />
                            {requests.length > 0 && role === 'admin' && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span>}
                        </button>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-5xl mx-auto p-4 md:p-6 pt-8">

                {role === 'admin' ? (
                    <div className="space-y-6">
                        {/* Admin Sub-Nav */}
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            <TabButton active={adminView === 'dashboard'} onClick={() => setAdminView('dashboard')} icon={FileText} label="Dashboard" />
                            <TabButton active={adminView === 'planning'} onClick={() => setAdminView('planning')} icon={Calendar} label="Planning" />
                            <TabButton active={adminView === 'requests'} onClick={() => setAdminView('requests')} icon={CheckCircle2} label={`Demandes ${requests.length > 0 ? `(${requests.length})` : ''}`} />
                        </div>

                        {/* Admin Views */}
                        <div className="min-h-[60vh]">
                            {adminView === 'dashboard' && (
                                <div className="text-center py-20 animate-in fade-in">
                                    <h3 className="text-2xl font-bold text-neutral-900">Vue d'ensemble</h3>
                                    <p className="text-neutral-400 mt-2">Le dashboard global avec les KPIs (comme vu précédemment).</p>
                                    <button onClick={() => setAdminView('planning')} className="mt-6 px-6 py-2 bg-neutral-100 rounded-full font-bold text-sm">Aller au Planning</button>
                                </div>
                            )}
                            {adminView === 'planning' && (
                                <AdminPlanning planningData={planning} onCellClick={cycleShift} />
                            )}
                            {adminView === 'requests' && (
                                <AdminRequests requests={requests} onAction={handleAdminAction} />
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Employee Views */}
                        <div className="min-h-[60vh]">
                            {employeeView === 'dashboard' && (
                                <EmployeeDashboard navigateToRequest={() => setEmployeeView('request')} />
                            )}
                            {employeeView === 'request' && (
                                <AbsenceRequestView onSubmit={handleRequestSubmit} onCancel={() => setEmployeeView('dashboard')} />
                            )}
                        </div>
                    </div>
                )}

            </main>

        </div>
    );
}