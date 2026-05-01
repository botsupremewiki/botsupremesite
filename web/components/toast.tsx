"use client";

/**
 * Système de toasts global.
 *
 * Usage :
 *   1. Wrap l'app avec <ToastProvider /> (déjà fait dans /play layout)
 *   2. const toast = useToast()
 *   3. toast.success("Action réussie") / toast.error(...) / toast.info(...)
 *
 * Les toasts sont annoncés via la live region globale pour les
 * lecteurs d'écran. Auto-dismiss après 4s. Stack en bottom-right,
 * animé avec framer-motion.
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, XCircle, Info, AlertTriangle } from "lucide-react";
import { announce } from "@/lib/a11y";

type ToastKind = "success" | "error" | "info" | "warning";

type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
};

type ToastContextValue = {
  push: (kind: ToastKind, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const COLORS: Record<
  ToastKind,
  {
    bg: string;
    border: string;
    text: string;
    Icon: typeof CheckCircle;
  }
> = {
  success: {
    bg: "bg-emerald-500/15",
    border: "border-emerald-400/40",
    text: "text-emerald-100",
    Icon: CheckCircle,
  },
  error: {
    bg: "bg-rose-500/15",
    border: "border-rose-400/40",
    text: "text-rose-100",
    Icon: XCircle,
  },
  info: {
    bg: "bg-sky-500/15",
    border: "border-sky-400/40",
    text: "text-sky-100",
    Icon: Info,
  },
  warning: {
    bg: "bg-amber-500/15",
    border: "border-amber-400/40",
    text: "text-amber-100",
    Icon: AlertTriangle,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, kind, message }]);
    announce(
      message,
      kind === "error" || kind === "warning" ? "assertive" : "polite",
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const value: ToastContextValue = {
    push,
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
    warning: (m) => push("warning", m),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        <AnimatePresence>
          {toasts.map((t) => {
            const c = COLORS[t.kind];
            const Icon = c.Icon;
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: 30, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 30, scale: 0.9 }}
                transition={{ duration: 0.18 }}
                role="alert"
                className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border px-3 py-2 shadow-lg backdrop-blur ${c.bg} ${c.border} ${c.text}`}
              >
                <Icon
                  size={16}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                />
                <span className="text-sm">{t.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback : si pas de provider, on log + utilise window.alert (debug only).
    return {
      push: (_, m) => console.warn("[toast no provider]", m),
      success: (m) => console.warn("[toast] ✓", m),
      error: (m) => console.warn("[toast] ✕", m),
      info: (m) => console.warn("[toast] ℹ", m),
      warning: (m) => console.warn("[toast] ⚠", m),
    };
  }
  return ctx;
}
