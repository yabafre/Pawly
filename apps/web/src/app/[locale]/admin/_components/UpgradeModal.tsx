"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

const DISMISS_KEY = "pawly_upgrade_modal_dismissed";
const PLAN_KEY = "pawly_selected_plan";

interface UpgradeModalProps {
  entitlementTier: string;
}

export function UpgradeModal({ entitlementTier }: UpgradeModalProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("upgradeModal");

  useEffect(() => {
    if (entitlementTier !== "starter") return;

    const selectedPlan = sessionStorage.getItem(PLAN_KEY);
    const dismissed = sessionStorage.getItem(DISMISS_KEY);

    if (selectedPlan === "professional" && !dismissed) {
      setOpen(true);
      sessionStorage.removeItem(PLAN_KEY);
    }
  }, [entitlementTier]);

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "true");
    setOpen(false);
  };

  const handleUpgrade = () => {
    // Redirect to billing page where they can upgrade
    window.location.href = `/${document.documentElement.lang || "fr"}/admin/billing`;
  };

  const benefits = [
    t("benefits.unlimitedEmployees"),
    t("benefits.advancedRules"),
    t("benefits.csvExport"),
    t("benefits.prioritySupport"),
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-xl font-bold">{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {benefits.map((benefit) => (
            <div key={benefit} className="flex items-center gap-3">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Check className="h-3 w-3 text-primary" />
              </div>
              <span className="text-sm">{benefit}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={handleUpgrade} className="w-full">
            {t("ctaButton")}
          </Button>
          <Button variant="ghost" onClick={handleDismiss} className="w-full text-muted-foreground">
            {t("dismissButton")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
