"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AbsencePendingList } from "./AbsencePendingList";
import { AdminAbsenceForm } from "./AdminAbsenceForm";
import { AbsenceStatusFilter } from "./AbsenceStatusFilter";
import { useAdminAbsences, usePendingAbsenceCount } from "../_hooks/useAdminAbsences";

export function AdminAbsencePageClient() {
  const t = useTranslations("admin.absences");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { absences, isPending } = useAdminAbsences(
    statusFilter ? { status: statusFilter } : undefined
  );
  const { count: pendingCount } = usePendingAbsenceCount();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-muted text-muted-foreground border border-border">
              {t("pendingBadge", { count: pendingCount })}
            </span>
          )}
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="rounded-xl font-bold"
          >
            <Plus size={16} className="mr-2" />
            {t("adminCreate.title")}
          </Button>
        </div>
      </div>

      <AbsenceStatusFilter selected={statusFilter} onSelect={setStatusFilter} />

      <AbsencePendingList absences={absences} isPending={isPending} />

      <AdminAbsenceForm
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />
    </div>
  );
}
