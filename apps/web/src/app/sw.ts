import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// NOTE: Schedule data is fetched via ZSA server actions (server-to-server tRPC),
// NOT via browser-to-API HTTP calls. The service worker cannot intercept these.
// Offline schedule access relies on React Query PersistQueryClientProvider
// with localStorage persistence (24h gcTime, offlineFirst networkMode).
// The SW handles static asset caching and offline fallback pages only.

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/fr/~offline",
        matcher({ request }) {
          if (request.destination !== "document") return false;
          const url = new URL(request.url);
          return url.pathname.startsWith("/fr");
        },
      },
      {
        url: "/en/~offline",
        matcher({ request }) {
          if (request.destination !== "document") return false;
          const url = new URL(request.url);
          return url.pathname.startsWith("/en");
        },
      },
    ],
  },
});

serwist.addEventListeners();

// ─── Web Push Notification Handlers ──────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json() as {
      title?: string;
      body?: string;
      url?: string;
    };

    const title = payload.title ?? "Pawly";
    const options: NotificationOptions = {
      body: payload.body ?? "",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-72x72.png",
      data: { url: payload.url ?? "/dashboard/schedule" },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Malformed payload — ignore
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawUrl = (event.notification.data as { url?: string })?.url ?? "/dashboard/schedule";
  const url = rawUrl.startsWith("/") ? rawUrl : "/dashboard/schedule";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing tab already at target URL
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open new tab
      return self.clients.openWindow(url);
    }),
  );
});
