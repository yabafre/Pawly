"use client";

import { useTranslations } from "next-intl";
import { Mail, BellOff } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";

type PreviewEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  shiftCount: number;
  notifyOnPublish: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  softViolationCount: number;
  isPublishing: boolean;
  preview?: {
    employees: PreviewEmployee[];
    emailCount: number;
    disabledCount: number;
    totalWithShifts: number;
  };
};

export function PublishConfirmDialog({
  open,
  onClose,
  onConfirm,
  softViolationCount,
  isPublishing,
  preview,
}: Props) {
  const t = useTranslations("admin.publication");

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v && !isPublishing) onClose(); }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {softViolationCount > 0
              ? t("confirmDescriptionWithWarnings", { count: softViolationCount })
              : t("confirmDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {preview && preview.totalWithShifts > 0 && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4 text-primary" />
              <span>{t("employeesNotified", { count: preview.emailCount })}</span>
            </div>

            {preview.disabledCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <BellOff className="h-4 w-4 text-muted-foreground" />
                <span>{t("employeesDisabled", { count: preview.disabledCount })}</span>
              </div>
            )}

            <ScrollArea className="max-h-40 rounded-lg border border-border bg-muted p-3">
              <ul className="space-y-1.5">
                {preview.employees.map((emp) => (
                  <li
                    key={emp.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">
                      {emp.firstName} {emp.lastName}
                      <span className="text-muted-foreground ml-1">
                        ({emp.shiftCount} {emp.shiftCount > 1 ? t("shifts") : t("shift")})
                      </span>
                    </span>
                    <span className="shrink-0 ml-2">
                      {emp.notifyOnPublish ? (
                        <Mail className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPublishing} onClick={onClose}>
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPublishing}>
            {isPublishing ? t("publishing") : t("confirmPublish")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
