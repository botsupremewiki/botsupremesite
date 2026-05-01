"use client";

/**
 * Analytics conditionnel.
 *
 * Charge Plausible (privacy-first, no cookies, lightweight ~1kb) ou
 * Umami selon les env vars définies. Si aucune n'est définie, le
 * composant est no-op (pas de tracking en prod si tu ne veux pas).
 *
 * Variables d'env supportées :
 *   - NEXT_PUBLIC_PLAUSIBLE_DOMAIN : "siteultime.com" (le domaine)
 *   - NEXT_PUBLIC_PLAUSIBLE_SCRIPT : URL custom (default plausible.io)
 *   - NEXT_PUBLIC_UMAMI_WEBSITE_ID : UUID du site dans Umami
 *   - NEXT_PUBLIC_UMAMI_SCRIPT     : URL du script Umami self-hosted
 *
 * Pas de Google Analytics (privacy + RGPD lourd, pas dans la philo
 * du site).
 */

import Script from "next/script";

// data-* attributes pas typés dans ScriptProps de Next 16 — cast.
const ScriptAny = Script as unknown as React.FC<
  Record<string, unknown> & { children?: React.ReactNode }
>;

export function Analytics() {
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const plausibleScript =
    process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT ??
    "https://plausible.io/js/script.js";
  const umamiId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const umamiScript = process.env.NEXT_PUBLIC_UMAMI_SCRIPT;

  if (!plausibleDomain && !umamiId) return null;

  return (
    <>
      {plausibleDomain ? (
        <ScriptAny
          data-domain={plausibleDomain}
          src={plausibleScript}
          strategy="afterInteractive"
        />
      ) : null}
      {umamiId && umamiScript ? (
        <ScriptAny
          data-website-id={umamiId}
          src={umamiScript}
          strategy="afterInteractive"
        />
      ) : null}
    </>
  );
}

/** Helper pour tracker un event custom (achat booster, match start…). */
type AnalyticsEvent = {
  name: string;
  props?: Record<string, string | number | boolean>;
};

export function track(event: AnalyticsEvent) {
  if (typeof window === "undefined") return;
  // Plausible global API.
  const plausible = (
    window as unknown as {
      plausible?: (name: string, opts?: { props?: AnalyticsEvent["props"] }) => void;
    }
  ).plausible;
  if (plausible) {
    plausible(event.name, event.props ? { props: event.props } : undefined);
  }
  // Umami global API.
  const umami = (
    window as unknown as {
      umami?: { track: (name: string, props?: AnalyticsEvent["props"]) => void };
    }
  ).umami;
  if (umami?.track) {
    umami.track(event.name, event.props);
  }
}
