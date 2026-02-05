"use client";

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
    PawPrint,
    ArrowRight,
    Check,
    Grid,
    Type,
    Layout,
    Ban,
    Copy,
    Search,
    Heart,
    Activity,
    ShieldCheck,
    Zap,
    Stethoscope,
    MousePointer2,
    ToggleRight,
    Terminal
} from 'lucide-react';
import { cn } from "@/lib/utils";

// --- UTILITIES ---

const Section = ({ title, icon: Icon, children }: { title: string, icon?: React.ComponentType<{ className?: string }>, children: React.ReactNode }) => (
    <section className="mb-24 relative">
        {/* Decorative vertical guide line (Light Mode) */}
        <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-neutral-200 to-transparent -ml-6 hidden lg:block"></div>

        <div className="flex items-center gap-3 mb-8">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 border border-neutral-200 flex items-center justify-center">
                {Icon && <Icon className="w-4 h-4 text-[#009588]" />}
            </div>
            <h2 className="text-2xl font-light text-neutral-900 tracking-tight">{title}</h2>
        </div>
        <div className="grid gap-10 animate-in fade-in slide-in-from-bottom-4 duration-700">{children}</div>
    </section>
);

const CopyBlock = ({ text, label }: { text: string, label: string }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className="group relative flex flex-col w-full p-4 bg-white border border-neutral-200 rounded-xl hover:border-[#009588] hover:shadow-md transition-all text-left"
        >
            <div className="flex justify-between items-center w-full mb-2">
                <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">{label}</span>
                {copied ? <Check className="w-3 h-3 text-[#009588]" /> : <Copy className="w-3 h-3 text-neutral-400 group-hover:text-neutral-900 transition-colors" />}
            </div>
            <span className="font-mono text-sm text-neutral-600 truncate">{text}</span>
        </button>
    );
};

const ColorSwatch = ({ name, hex, usage, type = "solid", darkText = false }: { name: string, hex: string, usage: string, type?: "solid" | "gradient", darkText?: boolean }) => (
    <div className="space-y-3 group">
        <div
            className={cn(
                "h-28 rounded-2xl border border-neutral-100 shadow-sm relative overflow-hidden transition-transform group-hover:scale-[1.02]",
                type === 'gradient' ? '' : 'bg-current'
            )}
            style={type === 'solid' ? { color: hex } : { background: hex }}
        >
            {/* Subtle texture to avoid flatness */}
            <div className="absolute inset-0 bg-neutral-900 opacity-[0.02] mix-blend-multiply"></div>

            {/* Shiny reflection */}
            <div className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 transform rotate-45"></div>

            <div className={cn(
                "absolute bottom-3 left-4 text-xs font-bold font-mono uppercase tracking-wider",
                darkText ? 'text-neutral-900' : 'text-white'
            )}>
                {hex}
            </div>
        </div>
        <div>
            <div className="flex justify-between items-baseline mb-1">
                <h3 className="font-bold text-sm text-neutral-900">{name}</h3>
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">{usage}</p>
        </div>
    </div>
);

// --- DEMO COMPONENTS ---

const AtmosphereDemo = () => {
    const t = useTranslations("brand");
    return (
        <div className="relative w-full h-48 bg-white rounded-xl border border-neutral-100 overflow-hidden isolate group shadow-sm">
            {/* Teal Glow */}
            <div className="absolute top-[-20%] right-[-10%] w-[300px] h-[300px] bg-[#009588] opacity-[0.08] blur-[80px] rounded-full mix-blend-multiply animate-pulse"></div>
            {/* Orange Warmth */}
            <div className="absolute bottom-[-20%] left-[-10%] w-[250px] h-[250px] bg-orange-500 opacity-[0.05] blur-[80px] rounded-full mix-blend-multiply group-hover:opacity-[0.1] transition-opacity duration-700"></div>

            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                <div className="text-xs font-mono text-neutral-400 mb-2 font-bold tracking-widest uppercase">{t("atmosphere")}</div>
                <div className="flex gap-3 text-[10px] text-neutral-400 font-mono">
                    <span>{t("hygiene")}</span>
                    <span className="text-[#009588]">•</span>
                    <span>{t("precision")}</span>
                    <span className="text-orange-500">•</span>
                    <span>{t("gentleness")}</span>
                </div>
            </div>
        </div>
    );
};

export default function BrandBoard() {
    const t = useTranslations("brand");

    return (
        <div className="min-h-screen bg-[#FDFDFD] text-neutral-900 font-sans selection:bg-[#009588]/20">

            {/* Background Ambient Layers (Light Mode) */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] bg-[#009588]/5 blur-[120px] rounded-full mix-blend-multiply"></div>
                <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-orange-500/5 blur-[120px] rounded-full mix-blend-multiply"></div>
            </div>

            <div className="relative max-w-6xl mx-auto p-8 lg:p-20">

                {/* HEADER BRAND BOARD */}
                <header className="mb-32 border-b border-neutral-100 pb-12">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
                        <div>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-12 h-12 bg-neutral-900 rounded-2xl flex items-center justify-center shadow-xl shadow-neutral-900/10 relative overflow-hidden group">
                                    <PawPrint className="w-6 h-6 text-white relative z-10" />
                                </div>
                                <span className="text-4xl font-bold tracking-tighter text-neutral-900">{t("name")}</span>
                            </div>
                            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-4 text-neutral-900">
                                {t("boardTitle")}
                            </h1>
                            <p className="text-neutral-400 font-mono text-sm">
                                {t("version")}
                            </p>
                        </div>
                        <div className="text-right md:max-w-xs">
                            <p className="text-sm text-neutral-500 leading-relaxed">
                                {t("description")}
                            </p>
                        </div>
                    </div>
                </header>

                <main>
                    {/* 1. LOGOTYPE */}
                    <Section title={t("sections.logotype")} icon={Layout}>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Construction */}
                            <div className="lg:col-span-2 p-12 rounded-3xl border border-neutral-100 bg-white relative overflow-hidden flex items-center justify-center group shadow-sm">
                                {/* Background grid */}
                                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

                                <div className="relative z-10 flex flex-col items-center gap-6 scale-125 transition-transform duration-700 group-hover:scale-110">
                                    <div className="w-20 h-20 bg-neutral-900 rounded-[2rem] flex items-center justify-center relative shadow-2xl shadow-neutral-900/20">
                                        {/* Visual guides (visible on hover) */}
                                        <div className="absolute top-0 bottom-0 w-[1px] bg-[#009588] left-1/2 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                        <div className="absolute left-0 right-0 h-[1px] bg-[#009588] top-1/2 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                        <PawPrint className="w-10 h-10 text-white fill-current" />
                                    </div>
                                </div>
                                <div className="absolute bottom-6 left-6 text-[10px] font-mono text-[#009588] opacity-60">
                                    {t("logotype.cornerRadius")}
                                </div>
                            </div>

                            {/* Rules */}
                            <div className="space-y-4">
                                <div className="p-6 rounded-2xl border border-neutral-100 bg-white shadow-sm">
                                    <div className="flex items-center gap-2 mb-2 text-emerald-600 text-xs font-bold uppercase tracking-widest">
                                        <Check className="w-4 h-4" /> {t("logotype.authorized")}
                                    </div>
                                    <p className="text-xs text-neutral-500">
                                        {t("logotype.authorizedDesc")}
                                    </p>
                                </div>
                                <div className="p-6 rounded-2xl border border-neutral-100 bg-white shadow-sm">
                                    <div className="flex items-center gap-2 mb-2 text-rose-500 text-xs font-bold uppercase tracking-widest">
                                        <Ban className="w-4 h-4" /> {t("logotype.forbidden")}
                                    </div>
                                    <p className="text-xs text-neutral-500">
                                        {t("logotype.forbiddenDesc")}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </Section>

                    {/* 2. COLORS */}
                    <Section title={t("sections.colors")} icon={Grid}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <ColorSwatch name="Surgical White" hex="#FFFFFF" usage="Fond principal, Cartes." darkText={true} />
                            <ColorSwatch name="Neutral Wash" hex="#FDFDFD" usage="Fond d'application (App Background)." darkText={true} />
                            <ColorSwatch name="Ink Black" hex="#171717" usage="Titres, Textes forts." />
                            <ColorSwatch name="Soft Steel" hex="#737373" usage="Textes secondaires, Icônes inactives." />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                            <div className="md:col-span-1 transform hover:-translate-y-1 transition-transform duration-300">
                                <ColorSwatch type="solid" name="Vet Teal" hex="#009588" usage="Identité Médicale, Logos, Validation pro." />
                            </div>
                            <ColorSwatch type="solid" name="Electric Indigo" hex="#4F46E5" usage="Actions UI, Boutons, Liens." />
                            <ColorSwatch type="solid" name="Vital Orange" hex="#F97316" usage="Alertes douces, Tags, Chaleur." />
                        </div>

                        {/* Gradients & Textures */}
                        <div className="mt-8">
                            <h3 className="text-sm font-bold mb-4 ml-1 text-neutral-400 uppercase tracking-widest text-[10px]">{t("colors.surfacesAndStates")}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <ColorSwatch type="gradient" name="Teal Wash" hex="linear-gradient(135deg, #E0F2F1 0%, #FFFFFF 100%)" usage="Fonds 'Santé', Cartes actives." darkText={true} />
                                <div className="h-28 rounded-2xl border border-neutral-100 relative overflow-hidden bg-white group shadow-sm">
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-[#009588] blur-[80px] opacity-10 rounded-full group-hover:opacity-20 transition-opacity"></div>
                                    <div className="absolute bottom-3 left-4 text-xs font-bold text-neutral-400 font-mono">Glow Spot (Vet Green)</div>
                                </div>
                            </div>
                        </div>
                    </Section>

                    {/* 3. TYPOGRAPHY */}
                    <Section title={t("sections.typography")} icon={Type}>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                            {/* Scale */}
                            <div className="space-y-10">
                                <div className="border-l-2 border-[#009588] pl-6 relative">
                                    <span className="text-[10px] font-mono text-[#009588] mb-2 block uppercase tracking-widest">{t("typography.displayH1")}</span>
                                    <div className="text-5xl md:text-6xl font-bold tracking-tighter text-neutral-900">
                                        {t("typography.healBetter")}
                                    </div>
                                </div>
                                <div className="border-l-2 border-neutral-200 pl-6 group hover:border-neutral-300 transition-colors">
                                    <span className="text-[10px] font-mono text-neutral-400 mb-2 block uppercase tracking-widest">{t("typography.headingH2")}</span>
                                    <div className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900">
                                        {t("typography.clinicManagement")}
                                    </div>
                                </div>
                                <div className="border-l-2 border-neutral-200 pl-6 group hover:border-neutral-300 transition-colors">
                                    <span className="text-[10px] font-mono text-neutral-400 mb-2 block uppercase tracking-widest">{t("typography.bodyLarge")}</span>
                                    <div className="text-lg text-neutral-500 leading-relaxed font-normal max-w-md">
                                        {t("typography.bodyDescription")}
                                    </div>
                                </div>
                            </div>

                            {/* Guide */}
                            <div className="space-y-6">
                                <CopyBlock label={t("typography.fontFamily")} text="Inter, -apple-system, BlinkMacSystemFont, sans-serif" />

                                <div className="p-8 bg-white rounded-3xl border border-neutral-100 shadow-sm mt-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-3 opacity-[0.03]">
                                        <Type className="w-24 h-24 text-neutral-900 -rotate-12" />
                                    </div>
                                    <h4 className="text-sm font-bold mb-6 flex items-center gap-2 text-neutral-900">
                                        <Stethoscope className="w-4 h-4 text-[#009588]" /> {t("typography.styleGuide")}
                                    </h4>
                                    <ul className="space-y-4 text-xs text-neutral-500">
                                        <li className="flex gap-3">
                                            <span className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700 font-bold shrink-0">1</span>
                                            <span className="leading-relaxed"><strong>{t("typography.medicalClarity")}</strong> {t("typography.medicalClarityDesc")}</span>
                                        </li>
                                        <li className="flex gap-3">
                                            <span className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700 font-bold shrink-0">2</span>
                                            <span className="leading-relaxed"><strong>{t("typography.colorHierarchy")}</strong> {t("typography.colorHierarchyDesc")}</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </Section>

                    {/* 4. TEXTURE & ATMOSPHERE */}
                    <Section title={t("sections.texture")} icon={Zap}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                            <div>
                                <p className="text-neutral-500 mb-8 leading-relaxed text-sm">
                                    {t("texture.description")}
                                </p>
                                <AtmosphereDemo />
                            </div>
                            <div className="space-y-4">
                                <div className="relative h-20 bg-white border border-transparent rounded-2xl flex items-center px-6">
                                    <div className="absolute inset-0 shadow-[0_4px_20px_-4px_rgba(0,149,136,0.15)] rounded-2xl"></div>
                                    <span className="relative z-10 text-xs font-bold text-neutral-900">{t("texture.softShadow")}</span>
                                    <div className="ml-auto w-3 h-3 bg-[#009588] rounded-full"></div>
                                </div>

                                <div className="relative h-20 bg-white border border-neutral-200 rounded-2xl flex items-center px-6 shadow-sm">
                                    <span className="relative z-10 text-xs font-bold text-neutral-900">{t("texture.solidBorder")}</span>
                                    <div className="ml-auto text-[10px] text-neutral-400 font-mono">1px solid #E5E5E5</div>
                                </div>
                            </div>
                        </div>
                    </Section>

                    {/* 5. UI COMPONENTS */}
                    <Section title={t("sections.components")} icon={MousePointer2}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

                            {/* Inputs & Forms */}
                            <div className="space-y-6">
                                <h3 className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">{t("components.inputs")}</h3>

                                <div className="space-y-4 p-6 bg-white rounded-2xl border border-neutral-100 shadow-sm">
                                    <div className="relative group">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 group-focus-within:text-[#009588] transition-colors" />
                                        <input
                                            type="text"
                                            placeholder={t("components.searchPlaceholder")}
                                            className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 pl-11 pr-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-[#009588] focus:ring-1 focus:ring-[#009588]/20 focus:bg-white transition-all"
                                        />
                                    </div>

                                    <div className="flex items-center justify-between p-4 border border-neutral-200 rounded-xl bg-white">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
                                                <Activity className="w-4 h-4 text-orange-500" />
                                            </div>
                                            <span className="text-sm text-neutral-600 font-medium">{t("components.emergencies")}</span>
                                        </div>
                                        <ToggleRight className="w-6 h-6 text-[#009588]" />
                                    </div>
                                </div>
                            </div>

                            {/* Buttons */}
                            <div className="space-y-6">
                                <h3 className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">{t("components.actions")}</h3>
                                <div className="space-y-3 p-6 bg-white rounded-2xl border border-neutral-100 shadow-sm">
                                    <button className="w-full py-3 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-black transition-colors shadow-lg shadow-neutral-900/10 flex items-center justify-center gap-2">
                                        {t("components.newAppointment")} <ArrowRight className="w-4 h-4" />
                                    </button>
                                    <button className="w-full py-3 bg-white text-neutral-900 border border-neutral-200 rounded-xl text-sm font-bold hover:bg-neutral-50 transition-colors flex items-center justify-center gap-2">
                                        <ShieldCheck className="w-4 h-4 text-neutral-400" />
                                        {t("components.adminPortal")}
                                    </button>
                                    <button className="w-full py-3 text-[#009588] text-sm font-bold hover:text-[#00796B] transition-colors flex items-center justify-center gap-2">
                                        {t("components.viewFullPlanning")}
                                    </button>
                                </div>
                            </div>

                            {/* Cards */}
                            <div className="space-y-6">
                                <h3 className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">{t("components.cards")}</h3>
                                {/* MiniLucca style card adapted to light mode */}
                                <div className="p-6 rounded-3xl border border-neutral-100 bg-white relative overflow-hidden group hover:border-[#009588]/30 transition-colors shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-lg">
                                    <div className="absolute top-0 right-0 p-6 opacity-30 group-hover:opacity-100 transition-opacity">
                                        <div className="w-2 h-2 rounded-full bg-[#009588] shadow-[0_0_10px_#009588]"></div>
                                    </div>

                                    <div className="flex items-start justify-between mb-6">
                                        <div className="w-12 h-12 bg-neutral-50 rounded-2xl flex items-center justify-center">
                                            <Heart className="w-6 h-6 text-[#009588] fill-current" />
                                        </div>
                                        <span className="px-3 py-1 rounded-full bg-[#009588]/10 text-[10px] font-bold text-[#009588] uppercase">Santé</span>
                                    </div>

                                    <h4 className="text-2xl font-bold text-neutral-900 mb-1">Dr. Martin</h4>
                                    <p className="text-sm text-neutral-400 mb-4">Chirurgie • Bloc A</p>

                                    <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                        <div className="h-full w-3/4 bg-[#009588] rounded-full"></div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </Section>

                    {/* 6. ICONOGRAPHY */}
                    <Section title={t("sections.iconography")} icon={Grid}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="p-10 border border-neutral-100 rounded-3xl bg-white flex flex-wrap gap-8 justify-center items-center relative overflow-hidden shadow-sm">
                                <div className="absolute inset-0 bg-[#009588] opacity-[0.02]"></div>
                                <PawPrint className="w-8 h-8 text-neutral-900 stroke-[1.5]" />
                                <Activity className="w-8 h-8 text-[#009588] stroke-[1.5]" />
                                <Heart className="w-8 h-8 text-neutral-900 stroke-[1.5]" />
                                <ShieldCheck className="w-8 h-8 text-neutral-900 stroke-[1.5]" />
                                <Terminal className="w-8 h-8 text-neutral-900 stroke-[1.5]" />
                            </div>
                            <div className="flex flex-col justify-center space-y-6">
                                <h3 className="text-sm font-bold text-neutral-900">{t("iconography.guidelines")}</h3>
                                <ul className="space-y-4 text-xs text-neutral-500">
                                    <li className="flex items-start gap-3">
                                        <Check className="w-4 h-4 text-[#009588] shrink-0" />
                                        <span><strong>{t("iconography.linearStyle")}</strong> {t("iconography.linearStyleDesc")}</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <Check className="w-4 h-4 text-[#009588] shrink-0" />
                                        <span><strong>{t("iconography.colorsRule")}</strong> {t("iconography.colorsRuleDesc")}</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </Section>

                </main>

                <footer className="mt-32 border-t border-neutral-100 pt-12 pb-20 text-center">
                    <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-white border border-neutral-200 hover:bg-neutral-50 transition-colors cursor-pointer shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-[#009588] animate-pulse"></span>
                        <span className="text-xs font-mono text-neutral-400 uppercase tracking-widest">{t("designSystem")}</span>
                    </div>
                </footer>

            </div>
        </div>
    );
}
