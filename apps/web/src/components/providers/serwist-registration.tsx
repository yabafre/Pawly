"use client";

import { useEffect } from "react";

export function SerwistRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/serwist/sw.js", {
        scope: "/",
        type: "classic",
      }).catch((err) => {
        console.error("[SW] Registration failed:", err);
      });
    }
  }, []);

  return null;
}
