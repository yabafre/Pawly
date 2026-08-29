"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAdminMe, useUpdateProfile, useChangePassword } from "../_hooks/useAdminProfile";
import { PasswordStrength, allPasswordRulesPass } from "@/components/ui/password-strength";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Lock, Save, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export function AdminAccountPanel() {
  const t = useTranslations("settings.account");
  const tPwd = useTranslations("auth.resetPassword");
  const { me, isPending } = useAdminMe();
  const { updateProfile, isPending: isUpdating } = useUpdateProfile();
  const { changePassword, isPending: isChanging, error: changeError } = useChangePassword();

  const [name, setName] = useState("");

  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwdError, setPwdError] = useState("");

  useEffect(() => {
    if (me) {
      setName(me.name ?? "");
    }
  }, [me]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({ name: name.trim() || undefined });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError("");

    if (!allPasswordRulesPass(newPassword)) return;
    if (newPassword !== confirmPassword) {
      setPwdError(tPwd("mismatch"));
      return;
    }

    changePassword(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        },
        onError: (err) => {
          // zsa hands back the shape declared by `experimental_shapeError`, not
          // an Error — reading only `err.message` off an Error left every
          // failure looking identical.
          const msg =
            err instanceof Error
              ? err.message
              : typeof err === "object" && err !== null && "message" in err
                ? String((err as { message: unknown }).message)
                : String(err);
          if (msg.includes("incorrect") || msg.includes("UNAUTHORIZED")) {
            setPwdError(t("wrongPassword"));
          } else {
            toast.error(t("passwordError"));
          }
        },
      },
    );
  };

  if (isPending) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmitPwd = allPasswordRulesPass(newPassword) && passwordsMatch && currentPassword.length > 0 && !isChanging;

  return (
    <div className="space-y-6">
      {/* Profile section */}
      <form onSubmit={handleSaveProfile} className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-bold text-foreground">{t("profileTitle")}</h3>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="admin-name" className="text-sm font-medium">{t("nameLabel")}</Label>
          <Input
            id="admin-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t("emailLabel")}</Label>
          <p className="text-sm text-muted-foreground bg-muted rounded-xl px-3 py-2.5">
            {me?.email}
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isUpdating || name.trim() === (me?.name ?? "")}
            className="rounded-xl"
          >
            <Save className="mr-2 h-4 w-4" />
            {isUpdating ? t("saving") : t("save")}
          </Button>
        </div>
      </form>

      {/* Change password section */}
      <form onSubmit={handleChangePassword} className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
            <Lock className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-bold text-foreground">{t("passwordTitle")}</h3>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="current-pwd" className="text-sm font-medium">{t("currentPassword")}</Label>
          <div className="relative">
            <Input
              id="current-pwd"
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setPwdError(""); }}
              className="rounded-xl pr-10"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {pwdError && <p className="text-xs text-destructive">{pwdError}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-pwd" className="text-sm font-medium">{t("newPassword")}</Label>
          <div className="relative">
            <Input
              id="new-pwd"
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-xl pr-10"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <PasswordStrength
          password={newPassword}
          translations={{
            hint: tPwd("passwordHint"),
            empty: tPwd("strength.empty"),
            weak: tPwd("strength.weak"),
            medium: tPwd("strength.medium"),
            strong: tPwd("strength.strong"),
            rules: {
              min8: tPwd("rules.min8"),
              uppercase: tPwd("rules.uppercase"),
              lowercase: tPwd("rules.lowercase"),
              digit: tPwd("rules.digit"),
            },
          }}
        />

        <div className="space-y-1.5">
          <Label htmlFor="confirm-pwd" className="text-sm font-medium">{t("confirmPassword")}</Label>
          <div className="relative">
            <Input
              id="confirm-pwd"
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="rounded-xl pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-xs text-destructive">{tPwd("mismatch")}</p>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={!canSubmitPwd} className="rounded-xl">
            <Lock className="mr-2 h-4 w-4" />
            {isChanging ? t("changingPassword") : t("changePassword")}
          </Button>
        </div>
      </form>
    </div>
  );
}
