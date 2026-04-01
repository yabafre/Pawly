"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface VarianceRejectDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}

export function VarianceRejectDialog({ open, onClose, onConfirm }: VarianceRejectDialogProps) {
  const t = useTranslations("admin.variance.rejectDialog");
  const [note, setNote] = useState("");

  const handleConfirm = () => {
    if (note.trim()) {
      onConfirm(note.trim());
      setNote("");
    }
  };

  const handleClose = () => {
    setNote("");
    onClose();
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-sm font-semibold">
            {t("exceptionNoteLabel")}
          </Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("exceptionNotePlaceholder")}
            rows={3}
            maxLength={500}
            className="rounded-xl resize-none"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose} className="rounded-xl">
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!note.trim()}
            className="rounded-xl bg-destructive hover:bg-destructive/90 text-white"
          >
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
