"use client";

import { QueryKeyFactory } from "@/lib/hooks/server-action-hooks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Calendar,
  CalendarOff,
  ChevronDown,
  CreditCard,
  GitCompareArrows,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  PawPrint,
  Scale,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { logoutAction } from "@/app/[locale]/(auth)/login/_actions/auth-actions";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useEffect, useState, useRef } from "react";

// ── Navigation types ──────────────────────────────────────────────

type NavChild = {
  href: string;
  icon: LucideIcon;
  labelKey: string;
};

type NavGroupWithChildren = {
  labelKey: string;
  icon: LucideIcon;
  href?: undefined;
  children: NavChild[];
};

type NavGroupDirect = {
  labelKey: string;
  icon: LucideIcon;
  href: string;
  children?: undefined;
};

type NavGroup = NavGroupWithChildren | NavGroupDirect;

// ── Navigation structure ──────────────────────────────────────────

const navGroups: NavGroup[] = [
  {
    labelKey: "dashboard",
    icon: LayoutDashboard,
    href: "/admin/dashboard",
  },
  {
    labelKey: "team",
    icon: Users,
    children: [
      { href: "/admin/employees", icon: Users, labelKey: "employees" },
      { href: "/admin/employees/absences", icon: CalendarOff, labelKey: "absences" },
    ],
  },
  {
    labelKey: "planning",
    icon: Calendar,
    children: [
      { href: "/admin/planning", icon: Calendar, labelKey: "planningView" },
      { href: "/admin/planning/templates", icon: LayoutTemplate, labelKey: "templates" },
      { href: "/admin/planning/equity", icon: Scale, labelKey: "equityCounters" },
      { href: "/admin/planning/variance", icon: GitCompareArrows, labelKey: "variance" },
      { href: "/admin/planning/rules", icon: ShieldCheck, labelKey: "planningRules" },
    ],
  },
  {
    labelKey: "billing",
    icon: CreditCard,
    href: "/admin/billing",
  },
  {
    labelKey: "settings",
    icon: Settings2,
    href: "/admin/settings",
  },
];

// ── Helpers ───────────────────────────────────────────────────────

function isGroupActive(group: NavGroup, pathname: string): boolean {
  if (group.children) {
    return group.children.some((child) => isChildActive(child, group.children, pathname));
  }
  return pathname.startsWith(group.href);
}

function isChildActive(child: NavChild, siblings: NavChild[], pathname: string): boolean {
  return (
    pathname.startsWith(child.href) &&
    !siblings.some(
      (other) =>
        other.href !== child.href &&
        other.href.startsWith(child.href) &&
        pathname.startsWith(other.href),
    )
  );
}

// ── GroupDropdown component ───────────────────────────────────────

function GroupDropdown({
  group,
  pathname,
  t,
}: {
  group: NavGroupWithChildren;
  pathname: string;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = isGroupActive(group, pathname);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdown on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap",
          active
            ? "bg-neutral-900 text-white shadow-md"
            : "text-neutral-500 hover:bg-neutral-100",
        )}
      >
        <group.icon size={16} />
        {t(group.labelKey)}
        <ChevronDown
          size={14}
          className={cn(
            "transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 min-w-[200px] rounded-2xl border border-neutral-100 bg-white p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)] animate-in fade-in slide-in-from-top-1 duration-150">
          {group.children.map((child) => {
            const childActive = isChildActive(child, group.children, pathname);
            return (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  "flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all",
                  childActive
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
                )}
              >
                <child.icon size={15} />
                {t(child.labelKey)}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main layout ───────────────────────────────────────────────────

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("admin.nav");
  const tCommon = useTranslations("common");

  useEffect(() => {
    if (!pathname.startsWith("/admin/settings")) return;
    queryClient.invalidateQueries({
      queryKey: QueryKeyFactory.clinicOperationalConfig(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryClient is stable in RQ v5
  }, [pathname]);

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

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
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
        <div className="relative flex flex-wrap gap-2 pb-2">
          {navGroups.map((group) => {
            if (group.children) {
              return (
                <GroupDropdown
                  key={group.labelKey}
                  group={group}
                  pathname={pathname}
                  t={t}
                />
              );
            }

            const active = isGroupActive(group, pathname);
            return (
              <Link
                key={group.href}
                href={group.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap",
                  active
                    ? "bg-neutral-900 text-white shadow-md"
                    : "text-neutral-500 hover:bg-neutral-100",
                )}
              >
                <group.icon size={16} />
                {t(group.labelKey)}
              </Link>
            );
          })}
        </div>
        {children}
      </main>
    </div>
  );
}
