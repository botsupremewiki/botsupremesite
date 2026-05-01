"use client";

import { useLocale, type Locale } from "@/lib/i18n-client";

const FLAGS: Record<Locale, string> = {
  fr: "🇫🇷",
  en: "🇬🇧",
};

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const next: Locale = locale === "fr" ? "en" : "fr";
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      title={`Switch to ${next.toUpperCase()}`}
      className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-white/10"
    >
      {FLAGS[locale]} {locale.toUpperCase()}
    </button>
  );
}
