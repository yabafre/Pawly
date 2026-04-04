"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

export function OfflineClient() {
    const t = useTranslations("common.offlinePage");

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
            <div className="text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-50">
                    <WifiOff className="h-10 w-10 text-amber-600" />
                </div>
                <h1 className="mb-2 text-2xl font-semibold text-foreground">
                    {t("title")}
                </h1>
                <p className="mb-6 text-muted-foreground">
                    {t("description")}
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                >
                    {t("retry")}
                </button>
            </div>
        </div>
    );
}
