"use client";

import { useState, useCallback, useEffect } from "react";
import {
  QueryKeyFactory,
  useServerActionQuery,
  useServerActionMutation,
} from "@/lib/hooks/server-action-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  getMyPushSubscriptionAction,
  subscribePushAction,
  unsubscribePushAction,
} from "../_actions/settings-actions";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const t = useTranslations("dashboard.settings");
  const queryClient = useQueryClient();
  const [permissionState, setPermissionState] = useState<
    "default" | "granted" | "denied" | "unsupported"
  >("default");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !("PushManager" in window)) {
      setPermissionState("unsupported");
      return;
    }
    setPermissionState(Notification.permission);
  }, []);

  const { data: rawSubscription, isPending: isLoadingSub } =
    useServerActionQuery(getMyPushSubscriptionAction, {
      queryKey: QueryKeyFactory.myPushSubscription(),
      input: undefined,
      enabled: permissionState !== "unsupported",
    });

  const subscription = rawSubscription as
    | { subscribed: true; endpoint: string }
    | { subscribed: false }
    | undefined;

  const { mutateAsync: subscribeMutateAsync, isPending: isSubscribing } =
    useServerActionMutation(subscribePushAction, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QueryKeyFactory.myPushSubscription() });
        toast.success(t("pushEnabled"));
      },
      onError: (err: { message?: string }) => {
        toast.error(t("pushEnableError"), {
          description: err?.message,
        });
      },
    });

  const { mutateAsync: unsubscribeMutateAsync, isPending: isUnsubscribing } =
    useServerActionMutation(unsubscribePushAction, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QueryKeyFactory.myPushSubscription() });
        toast.success(t("pushDisabled"));
      },
      onError: (err: { message?: string }) => {
        toast.error(t("pushDisableError"), {
          description: err?.message,
        });
      },
    });

  const subscribe = useCallback(async () => {
    if (permissionState === "unsupported") {
      toast.error(t("pushUnsupported"));
      return;
    }

    try {
      // Step 1: Request permission
      const permission = await Notification.requestPermission();
      setPermissionState(permission);

      if (permission === "denied") {
        toast.error(t("pushBlocked"));
        return;
      }
      if (permission !== "granted") {
        toast.info(t("pushPermissionNotGranted"));
        return;
      }

      // Step 2: Check VAPID key
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        toast.error(t("pushVapidMissing"));
        return;
      }

      // Step 3: Get service worker with timeout
      if (!("serviceWorker" in navigator)) {
        toast.error(t("pushSwUnavailable"));
        return;
      }

      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Service Worker timeout")), 5000),
        ),
      ]);

      // Step 4: Get or create push subscription
      let pushSub = await registration.pushManager.getSubscription();

      if (!pushSub) {
        pushSub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      const json = pushSub.toJSON();
      if (!json.endpoint || !json.keys) {
        toast.error(t("pushSubscriptionInvalid"));
        return;
      }

      // Step 5: Register on server (awaited for error handling)
      await subscribeMutateAsync({
        endpoint: json.endpoint,
        keys: {
          p256dh: json.keys.p256dh!,
          auth: json.keys.auth!,
        },
      });
    } catch (err) {
      const message = (err as Error).message ?? "Unknown error";
      console.error("[Push] Subscribe failed:", err);
      toast.error(t("pushError", { message }));
    }
  }, [permissionState, subscribeMutateAsync, t]);

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const pushSub = await registration.pushManager.getSubscription();

      if (pushSub) {
        const endpoint = pushSub.endpoint;
        await pushSub.unsubscribe();
        await unsubscribeMutateAsync({ endpoint });
      }
    } catch (err) {
      console.error("[Push] Unsubscribe failed:", err);
      toast.error(t("pushUnsubscribeError"));
    }
  }, [unsubscribeMutateAsync, t]);

  return {
    permissionState,
    isSubscribed: subscription?.subscribed ?? false,
    isLoading: isLoadingSub || isSubscribing || isUnsubscribing,
    subscribe,
    unsubscribe,
  };
}
