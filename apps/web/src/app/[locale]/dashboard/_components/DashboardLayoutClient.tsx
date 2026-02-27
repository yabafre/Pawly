"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarDays, CalendarOff, GraduationCap, Home, LogOut, PawPrint } from "lucide-react";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OnlineRestoreToast } from "@/components/OnlineRestoreToast";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { logoutAction } from "@/app/[locale]/(auth)/login/_actions/auth-actions";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useQueryClient } from "@tanstack/react-query";

export function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const t = useTranslations("dashboard.nav");
    const tCommon = useTranslations("common");

    const navItems = [
        { href: "/dashboard", icon: Home, labelKey: "home" as const, exact: true },
        { href: "/dashboard/schedule", icon: CalendarDays, labelKey: "schedule" as const },
        { href: "/dashboard/school-days", icon: GraduationCap, labelKey: "schoolDays" as const },
        { href: "/dashboard/absences", icon: CalendarOff, labelKey: "absences" as const },
    ];

    const queryClient = useQueryClient();

    const handleLogout = async () => {
        queryClient.clear();
        if (typeof window !== "undefined") {
            window.localStorage.removeItem("REACT_QUERY_OFFLINE_CACHE");
        }
        await logoutAction();
        router.push("/login");
    };

    return (
        <div className="min-h-screen bg-[#FDFDFD] font-sans text-neutral-900">
            {/* Top header bar */}
            <header className="sticky top-0 z-50 w-full bg-[#FDFDFD]/90 backdrop-blur-xl border-b border-neutral-100">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-8 h-8 sm:w-9 sm:h-9 bg-neutral-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-neutral-900/10">
                            <PawPrint size={16} className="sm:hidden" />
                            <PawPrint size={18} className="hidden sm:block" />
                        </div>
                        <span className="font-extrabold text-base sm:text-lg tracking-tight">{t("title")}</span>
                    </div>

                    <div className="flex items-center gap-1 sm:gap-2">
                        <LanguageSwitcher />
                        <Button variant="ghost" size="icon" className="text-neutral-500 hover:text-neutral-900 sm:hidden" onClick={handleLogout} aria-label={tCommon("logout")}>
                            <LogOut className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" className="text-neutral-500 hover:text-neutral-900 hidden sm:inline-flex" onClick={handleLogout}>
                            <LogOut className="w-4 h-4 mr-2" />
                            {tCommon("logout")}
                        </Button>
                    </div>
                </div>
            </header>

            <OfflineBanner />
            <OnlineRestoreToast />

            {/* Desktop horizontal pill nav — hidden on mobile */}
            <div className="hidden sm:block max-w-4xl mx-auto px-6 pt-8">
                <div className="flex gap-2">
                    {navItems.map((item) => {
                        const isActive = item.exact
                            ? pathname === item.href
                            : pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={isActive ? "page" : undefined}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap",
                                    isActive
                                        ? "bg-neutral-900 text-white shadow-md"
                                        : "text-neutral-500 hover:bg-neutral-100",
                                )}
                            >
                                <item.icon size={16} />
                                {t(item.labelKey)}
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Main content — extra bottom padding on mobile for tab bar */}
            <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-6 pb-32 sm:pb-8 space-y-4 sm:space-y-6">
                {children}
            </main>

            {/* Mobile bottom tab bar — hidden on desktop */}
            <nav
                className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-xl border-t border-neutral-200 sm:hidden"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
            >
                <div className="grid grid-cols-4 h-16">
                    {navItems.map((item) => {
                        const isActive = item.exact
                            ? pathname === item.href
                            : pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={isActive ? "page" : undefined}
                                className={cn(
                                    "flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px]",
                                    isActive
                                        ? "text-neutral-900"
                                        : "text-neutral-400",
                                )}
                            >
                                <div className={cn(
                                    "flex items-center justify-center w-10 h-7 rounded-full transition-colors",
                                    isActive && "bg-neutral-900/10",
                                )}>
                                    <item.icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
                                </div>
                                <span className={cn(
                                    "text-[10px] leading-tight",
                                    isActive ? "font-bold" : "font-medium",
                                )}>
                                    {t(item.labelKey)}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
