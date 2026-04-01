"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { CalendarDays, CalendarOff, GraduationCap, Home, Bell, Settings } from "lucide-react";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OnlineRestoreToast } from "@/components/OnlineRestoreToast";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { PawlyLogo } from "@/components/pawly-logo";
import { useEmployeeContext } from "./EmployeeContext";

const allNavItems = [
    { href: "/dashboard", icon: Home, labelKey: "home" as const, exact: true },
    { href: "/dashboard/schedule", icon: CalendarDays, labelKey: "schedule" as const },
    { href: "/dashboard/school-days", icon: GraduationCap, labelKey: "schoolDays" as const, apprenticeOnly: true },
    { href: "/dashboard/absences", icon: CalendarOff, labelKey: "absences" as const },
];

export function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const t = useTranslations("dashboard.nav");

    const { jobType } = useEmployeeContext();

    const navItems = useMemo(
        () => allNavItems.filter((item) => !item.apprenticeOnly || jobType === "APPRENTICE"),
        [jobType],
    );

    return (
        <div className="min-h-dvh bg-background text-foreground font-sans">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full bg-background/90 backdrop-blur-md border-b border-border/40">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
                    <PawlyLogo />
                    <div className="flex items-center gap-1">
                        <Link
                            href="/dashboard/settings"
                            className={cn(
                                "w-9 h-9 flex items-center justify-center rounded-full transition-colors",
                                pathname.startsWith("/dashboard/settings")
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                            aria-label={t("settings")}
                        >
                            <Settings size={18} strokeWidth={1.5} />
                        </Link>
                    </div>
                </div>
            </header>

            <OfflineBanner />
            <OnlineRestoreToast />

            {/* Desktop horizontal nav */}
            <div className="hidden sm:block max-w-4xl mx-auto px-6 pt-6">
                <div className="flex gap-1.5">
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
                                    "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap",
                                    isActive
                                        ? "bg-primary text-primary-foreground shadow-sm"
                                        : "text-muted-foreground hover:bg-muted",
                                )}
                            >
                                <item.icon size={16} />
                                {t(item.labelKey)}
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Main content */}
            <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-32 sm:pb-8">
                {children}
            </main>

            {/* Mobile bottom tab bar */}
            <nav
                className="fixed bottom-0 inset-x-0 z-50 bg-background/95 backdrop-blur-md border-t border-border/40 sm:hidden"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
            >
                <div className={`grid h-16 px-2 ${navItems.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
                    {navItems.map((item) => {
                        const isActive = item.exact
                            ? pathname === item.href
                            : pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={isActive ? "page" : undefined}
                                className="flex flex-col items-center justify-center gap-1 min-h-[44px]"
                            >
                                <div className={cn(
                                    "flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200",
                                    isActive
                                        ? "bg-primary text-primary-foreground shadow-sm"
                                        : "text-muted-foreground",
                                )}>
                                    <item.icon size={20} strokeWidth={1.5} />
                                </div>
                                {isActive && (
                                    <span className="text-[10px] font-medium text-foreground leading-none">
                                        {t(item.labelKey)}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
