/**
 * Helpers d'accessibilité.
 *
 * - announce(text) : pousse un message dans la live region globale
 *   (#a11y-live-region) pour qu'il soit annoncé par les lecteurs
 *   d'écran sans changer le focus. À utiliser pour les toasts, les
 *   confirmations d'action, les changements d'état importants.
 *
 * - usePrefersReducedMotion() : hook React qui retourne true si l'user
 *   a coché "réduire les animations" dans son OS. À utiliser pour
 *   éviter de programmer des transitions framer-motion lourdes.
 */

import { useEffect, useState } from "react";

export function announce(text: string, priority: "polite" | "assertive" = "polite") {
  if (typeof document === "undefined") return;
  const region = document.getElementById("a11y-live-region");
  if (!region) return;
  region.setAttribute("aria-live", priority);
  // Reset puis set, pour forcer la ré-annonce même si le texte est identique.
  region.textContent = "";
  setTimeout(() => {
    region.textContent = text;
  }, 50);
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

/**
 * Hook qui piège le focus dans un container (utile pour les modals).
 * Renvoie une ref à attacher au container ; au montage, focus le 1er
 * tabbable et trap Tab/Shift+Tab pour boucler dedans.
 */
import type { RefObject } from "react";
import { useRef } from "react";

export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  active: boolean,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    const container = ref.current;
    const tabbable = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
    // Focus le 1er tabbable au montage.
    const first = tabbable()[0];
    if (first) first.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const els = tabbable();
      if (els.length === 0) return;
      const firstEl = els[0];
      const lastEl = els[els.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    container.addEventListener("keydown", onKey);
    return () => container.removeEventListener("keydown", onKey);
  }, [active]);
  return ref;
}
