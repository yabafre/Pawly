"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export function OfflineBanner() {
  const t = useTranslations("dashboard.schedule.offline");
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  useEffect(() => {
    setIsOffline(!navigator.onLine);

    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div role="alert" className="sticky top-14 z-40 w-full border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-800 sm:top-16">
      <div className="flex items-center justify-center gap-2">
        <WifiOff className="h-4 w-4" aria-hidden="true" />
        <span>{t("banner")}</span>
      </div>
    </div>
  );
}
