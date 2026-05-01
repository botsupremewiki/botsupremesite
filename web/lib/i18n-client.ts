"use client";

import { useEffect, useState } from "react";
import fr from "../locales/fr.json";
import en from "../locales/en.json";

export type Locale = "fr" | "en";

const MESSAGES: Record<Locale, Record<string, unknown>> = { fr, en };

function lookup(messages: Record<string, unknown>, key: string): string {
  const parts = key.split(".");
  let cur: unknown = messages;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return key;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : key;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${oneYear}; SameSite=Lax`;
}

export function useLocale(): {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
} {
  const [locale, setLocaleState] = useState<Locale>("fr");
  useEffect(() => {
    const v = readCookie("locale");
    if (v === "en" || v === "fr") setLocaleState(v);
  }, []);
  const setLocale = (l: Locale) => {
    writeCookie("locale", l);
    setLocaleState(l);
    // Reload pour que les server components prennent la nouvelle locale.
    if (typeof window !== "undefined") window.location.reload();
  };
  const t = (key: string) => lookup(MESSAGES[locale], key);
  return { locale, setLocale, t };
}
