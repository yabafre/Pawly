"use client";

import { useState, useEffect, useRef, useCallback, useReducer } from "react";
import { useTranslations } from "next-intl";
import { Download, X, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isStandalone, isIos } from "@/lib/pwa-utils";

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
    prompt(): Promise<void>;
}

declare global {
    interface WindowEventMap {
        beforeinstallprompt: BeforeInstallPromptEvent;
    }
}

const DISMISS_KEY = "pawly-install-dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isDismissed(): boolean {
    if (typeof window === "undefined") return false;
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) return false;
    const timestamp = parseInt(dismissed, 10);
    if (isNaN(timestamp)) return false;
    return Date.now() - timestamp < DISMISS_DURATION_MS;
}

export function PwaInstallPrompt() {
    const t = useTranslations("dashboard.pwaInstall");
    const [promptState, dispatch] = useReducer(
        (state: { show: boolean; platform: "chrome" | "ios" | "other" | null }, action: Partial<{ show: boolean; platform: "chrome" | "ios" | "other" | null }>) => ({ ...state, ...action }),
        { show: false, platform: null }
    );

    const showPrompt = promptState.show;
    const platform = promptState.platform;
    const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

    useEffect(() => {
        if (isStandalone() || isDismissed()) return;

        if (isIos()) {
            dispatch({ show: true, platform: "ios" });
            return;
        }

        const timeoutRef = { id: null as ReturnType<typeof setTimeout> | null };

        const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
            e.preventDefault();
            if (timeoutRef.id) clearTimeout(timeoutRef.id);
            deferredPromptRef.current = e;
            dispatch({ show: true, platform: "chrome" });
        };

        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

        // If no event after 1s, show generic message
        timeoutRef.id = setTimeout(() => {
            if (!deferredPromptRef.current && !isIos()) {
                dispatch({ show: true, platform: "other" });
            }
        }, 1000);
        const timeout = timeoutRef.id;

        const handleAppInstalled = () => {
            dispatch({ show: false });
            deferredPromptRef.current = null;
        };

        window.addEventListener("appinstalled", handleAppInstalled);

        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
            window.removeEventListener("appinstalled", handleAppInstalled);
            clearTimeout(timeout);
        };
    }, []);

    const handleInstall = useCallback(async () => {
        if (!deferredPromptRef.current) return;
        await deferredPromptRef.current.prompt();
        const { outcome } = await deferredPromptRef.current.userChoice;
        if (outcome === "accepted") {
            dispatch({ show: false });
        }
        deferredPromptRef.current = null;
    }, []);

    const handleDismiss = useCallback(() => {
        localStorage.setItem(DISMISS_KEY, Date.now().toString());
        dispatch({ show: false });
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && showPrompt) {
                handleDismiss();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [showPrompt, handleDismiss]);

    if (!showPrompt || isStandalone()) return null;

    return (
        <div
            role="region"
            aria-label={t("ariaLabel")}
            className="bg-card rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,149,136,0.15)] border border-teal-100 p-4 sm:p-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2"
        >
            <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Download className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm sm:text-base text-foreground">
                        {t("title")}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                        {t("description")}
                    </p>

                    {platform === "chrome" && (
                        <Button
                            onClick={handleInstall}
                            className="mt-3 bg-primary hover:bg-primary/90 text-white rounded-xl px-6 py-2.5 font-semibold text-sm min-h-[44px]"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            {t("installButton")}
                        </Button>
                    )}

                    {platform === "ios" && (
                        <div className="mt-3 bg-muted rounded-xl p-3 text-xs sm:text-sm text-muted-foreground space-y-1.5">
                            <p className="font-semibold">{t("iosTitle")}</p>
                            <p>
                                1. {t("iosStep1")}{" "}
                                <Share className="inline h-4 w-4 text-primary" aria-hidden="true" />
                            </p>
                            <p>2. {t("iosStep2")}</p>
                        </div>
                    )}

                    {platform === "other" && (
                        <p className="mt-2 text-xs text-muted-foreground">
                            {t("notSupported")}
                        </p>
                    )}
                </div>
                <button
                    onClick={handleDismiss}
                    className="shrink-0 text-muted-foreground hover:text-muted-foreground transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label={t("dismissButton")}
                >
                    <X className="h-5 w-5" />
                </button>
            </div>
        </div>
    );
}
