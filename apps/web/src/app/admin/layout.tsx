"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bell, Calendar, CheckCircle2, FileText, LogOut, PawPrint } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();

    const navItems = [
        { href: "/admin/dashboard", icon: FileText, label: "Dashboard" },
        { href: "/admin/planning", icon: Calendar, label: "Planning" },
        { href: "/admin/requests", icon: CheckCircle2, label: "Demandes" },
    ];

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
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
                        <span className="font-extrabold text-lg tracking-tight">Pawly Admin</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="relative p-2 text-neutral-400 hover:text-neutral-900 transition-colors">
                            <Bell size={20} />
                        </button>
                        <Button variant="ghost" className="text-neutral-500 hover:text-neutral-900" onClick={handleLogout}>
                            <LogOut className="w-4 h-4 mr-2" />
                            Déconnexion
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
                            {item.label}
                        </Link>
                    ))}
                </div>
                {children}
            </main>
        </div>
    );
}
