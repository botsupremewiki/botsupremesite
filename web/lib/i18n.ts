import "server-only";
import { cookies } from "next/headers";
import fr from "../locales/fr.json";
import en from "../locales/en.json";

/**
 * Helper i18n minimaliste. Stocke la locale dans le cookie `locale`
 * (FR par défaut). Pas de hook React — utilisable uniquement côté
 * server components. Pour le client, voir useLocale().
 *
 * Usage server-side :
 *   const t = await getT();
 *   return <h1>{t("site.tagline")}</h1>;
 */

export type Locale = "fr" | "en";

const MESSAGES: Record<Locale, Record<string, unknown>> = { fr, en };

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const v = cookieStore.get("locale")?.value;
  return v === "en" ? "en" : "fr";
}

/** Plonge dans l'objet messages avec une clé pointée "tcg.collection". */
function lookup(messages: Record<string, unknown>, key: string): string {
  const parts = key.split(".");
  let cur: unknown = messages;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return key;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : key;
}

export async function getT(): Promise<(key: string) => string> {
  const locale = await getLocale();
  const m = MESSAGES[locale];
  return (key: string) => lookup(m, key);
}
