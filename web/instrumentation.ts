// Next.js instrumentation hook — appelé une fois au démarrage du
// serveur. Sert à initialiser le monitoring (Sentry).
//
// Pour activer Sentry : ajouter SENTRY_DSN=https://xxx@sentry.io/yyy
// dans les variables d'env Vercel. Sans cette var, instrumentation
// ne fait rien (pas de coût en prod si tu ne veux pas).

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.VERCEL_ENV ?? "development",
    // Skip les erreurs ResizeObserver et abort signal qui sont du bruit.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "AbortError",
    ],
  });
}

export const onRequestError = process.env.SENTRY_DSN
  ? Sentry.captureRequestError
  : undefined;
