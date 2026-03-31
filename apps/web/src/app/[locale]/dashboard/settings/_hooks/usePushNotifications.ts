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
  const [browserEndpoint, setBrowserEndpoint] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !("PushManager" in window)) {
      setPermissionState("unsupported");
      return;
    }
    setPermissionState(Notification.permission);

    // Check what the browser actually has registered
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setBrowserEndpoint(sub?.endpoint ?? null))
        .catch(() => setBrowserEndpoint(null));
    }
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

  // Only consider truly subscribed if server record matches current browser endpoint
  const serverEndpoint = subscription?.subscribed ? subscription.endpoint : null;
  const isReallySubscribed = !!(serverEndpoint && browserEndpoint && serverEndpoint === browserEndpoint);
  const isStale = !!(serverEndpoint && (!browserEndpoint || serverEndpoint !== browserEndpoint));

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
        setBrowserEndpoint(null);
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

      // Step 4: Clean up stale server subscription if origin changed
      if (isStale && serverEndpoint) {
        await unsubscribeMutateAsync({ endpoint: serverEndpoint }).catch(() => {});
      }

      // Step 5: Unsubscribe old browser subscription (different VAPID/origin)
      let pushSub = await registration.pushManager.getSubscription();
      if (pushSub) {
        await pushSub.unsubscribe();
      }

      // Step 6: Create fresh push subscription
      pushSub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const json = pushSub.toJSON();
      if (!json.endpoint || !json.keys) {
        toast.error(t("pushSubscriptionInvalid"));
        return;
      }

      // Step 7: Register on server
      await subscribeMutateAsync({
        endpoint: json.endpoint,
        keys: {
          p256dh: json.keys.p256dh!,
          auth: json.keys.auth!,
        },
      });
      setBrowserEndpoint(json.endpoint);
    } catch (err) {
      const message = (err as Error).message ?? "Unknown error";
      console.error("[Push] Subscribe failed:", err);
      toast.error(t("pushError", { message }));
    }
  }, [permissionState, subscribeMutateAsync, unsubscribeMutateAsync, isStale, serverEndpoint, t]);

  const unsubscribe = useCallback(async () => {
    try {
      // Unsubscribe browser push if it exists
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const pushSub = await registration.pushManager.getSubscription();
        if (pushSub) {
          await pushSub.unsubscribe();
        }
      }

      // Always clean up server record — use browser endpoint or fall back to server's stale endpoint
      const endpointToRemove = browserEndpoint ?? serverEndpoint;
      if (endpointToRemove) {
        await unsubscribeMutateAsync({ endpoint: endpointToRemove });
      }
    } catch (err) {
      console.error("[Push] Unsubscribe failed:", err);
      toast.error(t("pushUnsubscribeError"));
    }
  }, [unsubscribeMutateAsync, browserEndpoint, serverEndpoint, t]);

  return {
    permissionState,
    isSubscribed: isReallySubscribed,
    isStale,
    isLoading: isLoadingSub || isSubscribing || isUnsubscribing,
    subscribe,
    unsubscribe,
  };
}
