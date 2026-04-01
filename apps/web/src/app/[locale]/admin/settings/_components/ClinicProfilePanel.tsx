"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useClinicProfile } from "../_hooks/useAdminProfile";
import { useServerActionMutation } from "@/lib/hooks/server-action-hooks";
import { updateClinicNameAction } from "../_actions/settings-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Save } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function ClinicProfilePanel() {
  const t = useTranslations("settings.clinic");
  const locale = useLocale();
  const { clinic, isPending } = useClinicProfile();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  useEffect(() => {
    if (clinic?.name) setName(clinic.name);
  }, [clinic?.name]);

  const { mutate: saveName, isPending: isSaving } = useServerActionMutation(
    updateClinicNameAction,
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["clinic-profile"] });
        toast.success(t("saved"));
      },
      onError: () => toast.error(t("saveError")),
    },
  );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    saveName({ name: name.trim() });
  };

  if (isPending) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-4 w-60" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-bold text-foreground">{t("title")}</h3>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="clinic-name" className="text-sm font-medium">
            {t("nameLabel")}
          </Label>
          <Input
            id="clinic-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl"
          />
        </div>

        {clinic?.slug && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("slugLabel")}</Label>
            <p className="text-sm text-muted-foreground font-mono bg-muted rounded-lg px-3 py-2">
              {clinic.slug}
            </p>
          </div>
        )}

        {clinic?.createdAt && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("createdAtLabel")}</Label>
            <p className="text-sm text-muted-foreground">
              {new Date(clinic.createdAt).toLocaleDateString(locale, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSaving || name.trim() === clinic?.name}
          className="rounded-xl"
        >
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
