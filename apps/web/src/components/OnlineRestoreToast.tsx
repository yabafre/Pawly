"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function OnlineRestoreToast() {
  const t = useTranslations("dashboard.schedule.offline");
  const wasOffline = useRef(false);

  useEffect(() => {
    const handleOffline = () => {
      wasOffline.current = true;
    };

    const handleOnline = () => {
      if (wasOffline.current) {
        toast.success(t("backOnline"), { duration: 3000 });
        wasOffline.current = false;
      }
    };

    if (!navigator.onLine) {
      wasOffline.current = true;
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [t]);

  return null;
}
