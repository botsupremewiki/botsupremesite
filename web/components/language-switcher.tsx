"use client";

import { Globe } from "lucide-react";
import { useLocale, type Locale } from "@/lib/i18n-client";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const next: Locale = locale === "fr" ? "en" : "fr";
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={`Switch language to ${next.toUpperCase()}`}
      title={`Switch to ${next.toUpperCase()}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-white/10"
    >
      <Globe size={14} aria-hidden="true" />
      <span>{locale.toUpperCase()}</span>
    </button>
  );
}
