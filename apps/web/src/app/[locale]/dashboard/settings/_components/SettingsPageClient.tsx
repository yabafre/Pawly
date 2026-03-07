"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { Bell, BellRing, Smartphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isStandalone } from "@/lib/pwa-utils";
import {
    useNotificationPreferences,
    useUpdateNotificationPreferences,
} from "../_hooks/useNotificationPreferences";
import { usePushNotifications } from "../_hooks/usePushNotifications";

export function SettingsPageClient() {
    const t = useTranslations("dashboard.settings");
    const { data: preferences, isPending } = useNotificationPreferences();
    const { mutate: updatePreferences, isPending: isUpdating } = useUpdateNotificationPreferences();
    const {
        permissionState,
        isSubscribed: pushSubscribed,
        isLoading: pushLoading,
        subscribe: subscribePush,
        unsubscribe: unsubscribePush,
    } = usePushNotifications();
    const [pwaInstalled, setPwaInstalled] = useState(false);

    useEffect(() => {
        setPwaInstalled(isStandalone());
    }, []);

    const notifyOnPublish = preferences?.notifyOnPublish ?? true;

    const handleToggleNotify = (checked: boolean) => {
        updatePreferences({ notifyOnPublish: checked });
    };

    return (
        <div className="space-y-6 motion-safe:animate-in motion-safe:fade-in">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900">
                {t("title")}
            </h2>

            {/* PWA Section */}
            <Card className="rounded-2xl shadow-sm border border-neutral-100 p-5 sm:p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-[#009588]/10 flex items-center justify-center">
                        <Smartphone className="h-5 w-5 text-[#009588]" />
                    </div>
                    <h3 className="font-bold text-base sm:text-lg text-neutral-900">
                        {t("appSection")}
                    </h3>
                </div>
                <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-neutral-600">{t("pwaStatus")}</span>
                    {pwaInstalled ? (
                        <Badge className="bg-emerald-100 text-emerald-700 rounded-full px-3 py-1 text-xs font-bold uppercase hover:bg-emerald-100">
                            {t("installed")}
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-bold uppercase">
                            {t("notInstalled")}
                        </Badge>
                    )}
                </div>
            </Card>

            {/* Notifications Section */}
            <Card className="rounded-2xl shadow-sm border border-neutral-100 p-5 sm:p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
                        <Bell className="h-5 w-5 text-amber-600" />
                    </div>
                    <h3 className="font-bold text-base sm:text-lg text-neutral-900">
                        {t("notificationsSection")}
                    </h3>
                </div>

                {/* Email notification toggle */}
                <div className="flex items-center justify-between py-2">
                    <div className="flex-1 min-w-0 mr-4">
                        <label
                            htmlFor="notify-on-publish"
                            className="text-sm font-medium text-neutral-900 cursor-pointer"
                        >
                            {t("notifyOnPublish")}
                        </label>
                        <p className="text-xs text-neutral-500 mt-0.5">
                            {t("notifyOnPublishDescription")}
                        </p>
                    </div>
                    <Switch
                        id="notify-on-publish"
                        checked={notifyOnPublish}
                        onCheckedChange={handleToggleNotify}
                        disabled={isPending || isUpdating}
                        aria-label={t("notifyOnPublish")}
                        className="data-[state=checked]:bg-[#009588]"
                    />
                </div>

                {/* Push notification toggle */}
                {permissionState !== "unsupported" && (
                    <div className="flex items-center justify-between py-2 mt-2 border-t border-neutral-100 pt-4">
                        <div className="flex-1 min-w-0 mr-4">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-neutral-900">
                                    {t("pushNotifications")}
                                </span>
                                {pushSubscribed && (
                                    <BellRing className="h-3.5 w-3.5 text-[#009588]" />
                                )}
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">
                                {t("pushDescription")}
                            </p>
                            {permissionState === "denied" && (
                                <p className="text-xs text-red-500 mt-1">
                                    {t("pushDenied")}
                                </p>
                            )}
                        </div>
                        {pushSubscribed ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={unsubscribePush}
                                disabled={pushLoading}
                                className="rounded-xl text-xs"
                            >
                                {t("pushDisable")}
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                onClick={subscribePush}
                                disabled={pushLoading || permissionState === "denied"}
                                className="rounded-xl text-xs bg-[#009588] hover:bg-[#00796B] text-white"
                            >
                                {t("pushEnable")}
                            </Button>
                        )}
                    </div>
                )}
            </Card>
        </div>
    );
}
