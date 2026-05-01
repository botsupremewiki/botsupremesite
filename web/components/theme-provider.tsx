"use client";

import { Moon, Sun, Monitor } from "lucide-react";

/**
 * ThemeProvider : gère le thème global (light/dark/system).
 *
 * Approche :
 *  - Le thème est appliqué via `data-theme="light|dark"` sur <html>
 *  - Lit le cookie `theme` au montage. Si absent, suit prefers-color-scheme
 *  - Persiste les changements dans le cookie (1 an)
 *  - Tailwind v4 : on utilise un `@variant dark` custom dans globals.css
 *    pour conditionner les classes via `[data-theme="dark"]`
 *
 * NOTE : la majorité des pages existantes utilisent des classes
 * hardcodées (bg-zinc-950, text-zinc-100). Ces pages restent dark.
 * Le toggle marche pour les nouvelles classes qui utilisent les
 * variables CSS (--bg, --text) ou les classes dark:.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[2]) : null;
}
function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

function systemPreference(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const stored = readCookie("theme") as Theme | null;
    const t: Theme = stored && ["light", "dark", "system"].includes(stored) ? stored : "dark";
    setThemeState(t);
  }, []);

  useEffect(() => {
    const r: "light" | "dark" =
      theme === "system" ? systemPreference() : theme;
    setResolved(r);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = r;
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    writeCookie("theme", t);
    setThemeState(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "dark",
      resolved: "dark",
      setTheme: () => {},
    };
  }
  return ctx;
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next: Theme =
    theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
  const label =
    theme === "dark" ? "Sombre" : theme === "light" ? "Clair" : "Auto";
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Thème actuel : ${label}. Cliquer pour changer.`}
      title="Changer le thème"
      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-white/10"
    >
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
