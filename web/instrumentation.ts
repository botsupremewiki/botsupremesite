// Next.js instrumentation hook — appelé une fois au démarrage du
// serveur. Sert à initialiser le monitoring (Sentry, OpenTelemetry…).
//
// On charge Sentry dynamiquement si la variable SENTRY_DSN est définie
// ET si le package est installé. Sinon, no-op. Cela permet de déployer
// sans bloc dépendance.
//
// Pour activer Sentry :
//   1. npm i @sentry/nextjs (dans web/)
//   2. ajoute SENTRY_DSN=https://xxx@sentry.io/yyy dans .env
//   3. redéploie

export async function register() {
  if (!process.env.SENTRY_DSN) return;
  try {
    // @ts-expect-error — package optionnel, peut ne pas être installé.
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.VERCEL_ENV ?? "development",
    });
  } catch {
    // Sentry pas installé : on log juste, pas d'erreur.
    console.warn(
      "[instrumentation] SENTRY_DSN défini mais @sentry/nextjs pas installé.",
    );
  }
}

export const onRequestError =
  process.env.SENTRY_DSN
    ? async (...args: unknown[]) => {
        try {
          // @ts-expect-error — package optionnel.
          const Sentry = await import("@sentry/nextjs");
          Sentry.captureRequestError?.(...args);
        } catch {
          // ignore
        }
      }
    : undefined;
