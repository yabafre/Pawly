"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bell, Calendar, CheckCircle2, FileText, LogOut, PawPrint } from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { logoutAction } from "@/app/[locale]/(auth)/login/_actions/auth-actions";
import { useTranslations } from "next-intl";

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const t = useTranslations("admin.nav");
    const tCommon = useTranslations("common");

    const navItems = [
        { href: "/admin/dashboard", icon: FileText, labelKey: "dashboard" as const },
        { href: "/admin/planning", icon: Calendar, labelKey: "planning" as const },
        { href: "/admin/requests", icon: CheckCircle2, labelKey: "requests" as const },
    ];

    const handleLogout = async () => {
        await logoutAction();
        router.push("/login");
    };

    return (
        <div className="min-h-screen bg-[#FDFDFD] font-sans text-neutral-900">
            <nav className="sticky top-0 z-50 w-full bg-[#FDFDFD]/90 backdrop-blur-xl border-b border-neutral-100">
                <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-neutral-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-neutral-900/10">
                            <PawPrint size={18} />
                        </div>
                        <span className="font-extrabold text-lg tracking-tight">{t("title")}</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="relative p-2 text-neutral-400 hover:text-neutral-900 transition-colors">
                            <Bell size={20} />
                        </button>
                        <Button variant="ghost" className="text-neutral-500 hover:text-neutral-900" onClick={handleLogout}>
                            <LogOut className="w-4 h-4 mr-2" />
                            {tCommon("logout")}
                        </Button>
                    </div>
                </div>
            </nav>

            <main className="max-w-6xl mx-auto p-4 md:p-6 pt-8 space-y-6">
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all",
                                pathname.startsWith(item.href)
                                    ? "bg-neutral-900 text-white shadow-md"
                                    : "text-neutral-500 hover:bg-neutral-100"
                            )}
                        >
                            <item.icon size={16} />
                            {t(item.labelKey)}
                        </Link>
                    ))}
                </div>
                {children}
            </main>
        </div>
    );
}
