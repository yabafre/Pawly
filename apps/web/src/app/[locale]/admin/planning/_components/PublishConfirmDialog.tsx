"use client";

import { useTranslations } from "next-intl";
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

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  softViolationCount: number;
  isPublishing: boolean;
};

export function PublishConfirmDialog({
  open,
  onClose,
  onConfirm,
  softViolationCount,
  isPublishing,
}: Props) {
  const t = useTranslations("admin.publication");

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v && !isPublishing) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {softViolationCount > 0
              ? t("confirmDescriptionWithWarnings", { count: softViolationCount })
              : t("confirmDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
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
