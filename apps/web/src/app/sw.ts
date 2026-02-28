import { defaultCache } from "@serwist/next/worker";
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
