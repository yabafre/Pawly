"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  Clock,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useClinicShiftTypes,
  type ShiftTypeRecord,
} from "../_hooks/useClinicShiftTypes";
import { ShiftTypeFormSheet } from "./ShiftTypeFormSheet";

export function ShiftTypesPanel() {
  const t = useTranslations("settings.shiftTypes");
  const { shiftTypes, isPending, error, refetch, deleteShiftType, isDeleting } =
    useClinicShiftTypes();

  const [formOpen, setFormOpen] = useState(false);
  const [editingShiftType, setEditingShiftType] =
    useState<ShiftTypeRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleEdit = (st: ShiftTypeRecord) => {
    setEditingShiftType(st);
    setFormOpen(true);
  };

  const handleCreate = () => {
    setEditingShiftType(null);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingShiftType(null);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteShiftType({ id: deleteTarget });
      setDeleteTarget(null);
    }
  };

  if (isPending) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-2xl border border-neutral-100 bg-neutral-50"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-red-100 bg-red-50/50 p-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-red-200 bg-red-100">
            <AlertCircle
              className="h-5 w-5 text-red-600"
              strokeWidth={1.5}
            />
          </div>
          <p className="text-sm font-medium text-red-700">
            {t("errors.loadFailed")}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="mt-1 rounded-xl border-red-200 text-red-700 hover:bg-red-100"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            {t("errors.retry")}
          </Button>
        </div>
      </section>
    );
  }

  const hasShiftTypes = shiftTypes.length > 0;

  return (
    <>
      {/* Add button */}
      <div className="mb-6 flex justify-end">
        <Button
          onClick={handleCreate}
          className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-neutral-900/10 hover:bg-black"
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("actions.add")}
        </Button>
      </div>

      {!hasShiftTypes ? (
        <section className="group relative overflow-hidden rounded-3xl border-2 border-dashed border-neutral-200 bg-white p-12 text-center shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="pointer-events-none absolute -left-16 -top-16 h-[200px] w-[200px] rounded-full bg-[#009588] opacity-0 blur-[60px] transition-opacity duration-700 group-hover:opacity-[0.06]" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-100">
              <Layers
                className="h-6 w-6 text-neutral-400"
                strokeWidth={1.5}
              />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-neutral-700">
              {t("empty.title")}
            </h3>
            <p className="mt-1 text-sm text-neutral-500">
              {t("empty.description")}
            </p>
            <Button
              onClick={handleCreate}
              className="mt-6 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-neutral-900/10 hover:bg-black"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("empty.cta")}
            </Button>
          </div>
        </section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shiftTypes.map((st) => (
            <section
              key={st.id}
              className="group relative overflow-hidden rounded-3xl border border-neutral-100 bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] md:p-6"
            >
              <div className="pointer-events-none absolute -left-16 -top-16 h-[200px] w-[200px] rounded-full bg-[#009588] opacity-0 blur-[60px] transition-opacity duration-700 group-hover:opacity-[0.06]" />

              <div className="relative z-10">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${st.color}15` }}
                    >
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: st.color }}
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-neutral-900">
                        {st.name}
                      </h3>
                      <span className="font-mono text-xs text-neutral-400">
                        {st.code}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
                  <Clock className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span>
                    {st.startTime} — {st.endTime}
                    {st.breakMinutes > 0 && (
                      <span className="ml-1.5 text-neutral-400">
                        ({st.breakMinutes} {t("fields.breakMinutes").toLowerCase()})
                      </span>
                    )}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-neutral-100 pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(st)}
                    className="h-7 rounded-lg px-2.5 text-xs font-medium text-neutral-600 hover:text-neutral-900"
                  >
                    <Pencil className="mr-1.5 h-3 w-3" />
                    {t("actions.edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(st.id)}
                    className="h-7 rounded-lg px-2.5 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="mr-1.5 h-3 w-3" />
                    {t("actions.delete")}
                  </Button>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      <ShiftTypeFormSheet
        open={formOpen}
        onClose={handleFormClose}
        editingShiftType={editingShiftType}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirm.deleteMessage")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">
              {t("confirm.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-xl bg-red-600 text-white hover:bg-red-700"
            >
              {t("confirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
