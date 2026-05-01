"use client";

import { useEffect } from "react";

/**
 * Enregistre /sw.js au montage. À mettre dans le root layout.
 *
 * En dev (next dev), on désactive — le SW interfère avec HMR. En prod
 * (process.env.NODE_ENV === "production"), on enregistre.
 *
 * Pour désinstaller : F12 → Application → Service Workers → Unregister.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[sw] register failed:", err);
    });
  }, []);
  return null;
}
